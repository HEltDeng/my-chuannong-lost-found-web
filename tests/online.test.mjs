import test from 'node:test';
import assert from 'node:assert/strict';
const fixture=(status='PENDING')=>({id:'one',kind:'lost',title:'寻物测试',campus:'雅安校区',location:'图书馆',date:'2026-10-19',time:'刚刚',description:'测试描述',contact:'synthetic',image:'',mine:true,status,done:false});
async function setup(){
  const state={rows:[fixture()],notices:[],fail:false,calls:[]};
  globalThis.window={ChuannongContent:{request(method,path,raw){
    state.calls.push([method,path,JSON.parse(raw)]);
    if(state.fail)return JSON.stringify({ok:false,error:{code:'OFFLINE',message:'连接失败'}});
    const body=JSON.parse(raw),url=new URL(path,'https://local.test/');let data;
    if(url.pathname.endsWith('/notifications')){
      if(method==='PATCH')state.notices=state.notices.map(n=>body.ids.includes(n.id)?{...n,read_at:1}:n);
      data={items:state.notices,total:state.notices.length};
    }else if(method==='GET'){
      if(url.pathname.endsWith('/one'))data=state.rows[0];
      else {const items=url.searchParams.get('mine')==='true'?state.rows:state.rows.filter(r=>r.status==='PUBLISHED'&&!r.done);data={items,total:items.length};}
    }else if(method==='DELETE'){state.rows=[];state.notices=[];data={deleted:true};}
    else if(body.done!==undefined){state.rows[0].done=body.done;data=state.rows[0];}
    else {state.rows=[{...body,id:'one',status:'PENDING',mine:true}];data=state.rows[0];}
    return JSON.stringify({ok:true,data});
  }}};
  const api=await import('../src/online.ts?test='+crypto.randomUUID());return {api,state};
}
test('native failure never falls back to local publishing',async()=>{const {api,state}=await setup();state.fail=true;await assert.rejects(api.loadOnline(),/连接失败/);assert.equal(api.isOnline(),false);});
test('pending and violation stay in own records without becoming public',async()=>{const {api,state}=await setup();assert.equal((await api.loadOnline())[0].status,'PENDING');state.rows[0].status='VIOLATION';assert.equal((await api.loadOnline())[0].status,'VIOLATION');assert.equal(api.isConnected(),true);});
test('submission retries keep the same client id and resubmit for review',async()=>{const {api,state}=await setup();await api.loadOnline();const item={...fixture(),id:'stable-client'};state.fail=true;await assert.rejects(api.commitOnline({type:'save',item,editing:false}));state.fail=false;const result=await api.commitOnline({type:'save',item,editing:false});assert.equal(result[0].status,'PENDING');assert.deepEqual(state.calls.filter(c=>c[0]==='POST').map(c=>c[2].clientId),['stable-client','stable-client']);});
test('deletion clears records and notices after reload and restore is rejected',async()=>{const {api,state}=await setup();state.notices=[{id:'note',post_id:'one',read_at:null}];await api.loadOnline();assert.deepEqual(await api.commitOnline({type:'delete',id:'one'}),[]);assert.deepEqual(await api.loadOnline(),[]);assert.deepEqual(api.getNotices(),[]);await assert.rejects(api.commitOnline({type:'restore',item:fixture()}),/不能恢复/);});
test('completion and notification read state are saved to the API',async()=>{const {api,state}=await setup();state.rows=[fixture('PUBLISHED')];state.notices=[{id:'note',post_id:'one',read_at:null}];await api.loadOnline();assert.equal((await api.commitOnline({type:'complete',id:'one'}))[0].done,true);assert.ok((await api.markNoticeRead('note'))[0].read_at);await api.loadOnline();assert.ok(api.getNotices()[0].read_at);});
test('refresh replaces stale published data and reports connection failure',async()=>{const {api,state}=await setup();state.rows=[fixture('PUBLISHED')];await api.loadOnline();state.rows=[];assert.deepEqual(await api.loadOnline(),[]);state.fail=true;await assert.rejects(api.loadOnline());assert.equal(api.isConnected(),false);});
