import type { Item, ReviewNotice } from './types';
import type { Action } from './storage';

declare global { interface Window { ChuannongContent?: { request(method: string,path: string,body: string): string } } }
let online = false, connected = false;
let records: Item[] = [], notices:ReviewNotice[]=[];
let work:Promise<unknown>=Promise.resolve();
const queue=<T>(fn:()=>Promise<T>):Promise<T>=>{const next=work.then(fn);work=next.catch(()=>{});return next;};
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export const isOnline = () => online;
export const isConnected=()=>connected;
export const getNotices=()=>copy(notices);
async function call(method: string,path: string,body: unknown = {}): Promise<any> {
  await new Promise(resolve=>setTimeout(resolve,0));
  const response=JSON.parse(window.ChuannongContent!.request(method,'community/lost-found'+path,JSON.stringify(body)));
  if(!response.ok)throw Object.assign(new Error(response.error?.message||'操作失败'),{code:response.error?.code});
  return response.data;
}
async function pages<T>(path:string):Promise<T[]>{
  const first=await call('GET',path+'limit=100'),rows=[...first.items];
  while(rows.length<first.total){const page=await call('GET',path+'limit=100&offset='+rows.length);if(!page.items.length)break;rows.push(...page.items);}
  return rows;
}
async function refresh():Promise<Item[]>{
  try{
    const publicRows=await pages<Item>('?'),mine=await pages<Item>('?mine=true&'),nextNotices=await pages<ReviewNotice>('/notifications?');
    const previous=new Map(records.map(r=>[r.id,r]));
    records=[...new Map([...publicRows,...mine].map(r=>[r.id,r])).values()].map(r=>({...r,contact:r.contact||previous.get(r.id)?.contact||''}));
    notices=nextNotices;online=true;connected=true;return copy(records);
  }catch(error){connected=false;throw error;}
}
export async function loadOnline():Promise<Item[]|null>{
  if(typeof window==='undefined'||!window.ChuannongContent)return null;
  return queue(refresh); // Native connection failures must never enable local publishing.
}
export async function onlineDetail(id:string):Promise<Item|null>{
  if(!online)return null;
  return queue(async()=>{
    try{const item=await call('GET','/'+id);records=records.filter(r=>r.id!==id);records.push(item);return copy(item);}
    catch(error){if((error as {code:string}).code==='NOT_FOUND')records=records.filter(r=>r.id!==id);throw error;}
  });
}
export const markNoticeRead=(id:string)=>queue(async()=>{
  await call('PATCH','/notifications',{ids:[id]});
  notices=notices.map(n=>n.id===id?{...n,read_at:n.read_at||Date.now()}:n);return getNotices();
});
export function commitOnline(action:Action):Promise<Item[]>{
  return queue(async()=>{
    if(action.type==='save')await call(action.editing?'PATCH':'POST',action.editing?'/'+action.item.id:'',{...action.item,clientId:action.item.id});
    else if(action.type==='delete')await call('DELETE','/'+action.id);
    else if(action.type==='restore')throw Error('已删除记录不能恢复，请重新提交审核');
    else await call('PATCH','/'+action.id,{done:!records.find(r=>r.id===action.id)?.done});
    return refresh();
  });
}
