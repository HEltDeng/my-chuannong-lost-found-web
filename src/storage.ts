import { loadOnline, isOnline, commitOnline } from './online.ts';
import type { Item } from './types.ts';

export const DATABASE = 'mychuannong-lost-found-v2';
type State = { version: 1; items: Item[] };
export type Action = { type: 'save'; item: Item; editing: boolean } | { type: 'complete' | 'delete'; id: string } | { type: 'restore'; item: Item };
let database: Promise<IDBDatabase> | undefined;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function validateState(value: unknown): State {
  const state = value as State;
  if (!state || state.version !== 1 || !Array.isArray(state.items)) throw new Error('本机数据格式无法读取，请保留数据后重试');
  const ids = new Set<string>();
  for (const item of state.items) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) throw new Error('本机信息标识异常');
    ids.add(item.id);
    if (!['lost','found'].includes(item.kind) || !['成都校区','雅安校区','都江堰校区'].includes(item.campus)) throw new Error('物品类型或校区无效');
    for (const key of ['title','location','date','time','description','contact','image'] as const) if (typeof item[key] !== 'string') throw new Error('物品内容格式无效');
    if (!item.title.trim() || item.title.length > 30 || !item.location.trim() || item.location.length > 40 || item.description.length > 300 || item.contact.length > 60) throw new Error('请检查物品名称、地点和联系方式');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0,10) !== item.date) throw new Error('物品日期无效');
    if (item.mine && !item.contact.trim()) throw new Error('请填写联系方式');
    if (item.mine !== undefined && typeof item.mine !== 'boolean' || item.done !== undefined && typeof item.done !== 'boolean') throw new Error('物品状态无效');
    if (item.image && !/^\.\/assets\/items\/(card|umbrella|keys|earbuds)\.png$/.test(item.image) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.image)) throw new Error('图片格式无效');
    if (item.image.length > 14 * 1024 * 1024) throw new Error('图片过大');
  }
  return copy(state);
}
export function applyAction(state: State, action: Action): State {
  const next = validateState(state);
  if (action.type === 'save') {
    const index = next.items.findIndex(item => item.id === action.item.id);
    if (action.editing) {
      if (index < 0 || !next.items[index].mine) throw new Error('只能编辑自己的发布');
      const original = next.items[index];
      next.items[index] = { ...action.item, id: original.id, mine: true, createdAt: original.createdAt, time: original.time, done: original.done };
    } else {
      if (index >= 0 || !action.item.id.startsWith('mine-')) throw new Error('信息标识重复');
      next.items.unshift({ ...action.item, mine: true, done: false });
    }
  } else if (action.type === 'restore') {
    if (!action.item.mine || next.items.some(item => item.id === action.item.id)) throw new Error('无法撤销此记录');
    next.items.unshift(action.item);
  } else {
    const item = next.items.find(item => item.id === action.id);
    if (!item?.mine) throw new Error('只能管理自己的发布');
    if (action.type === 'complete') item.done = !item.done;
    else next.items = next.items.filter(item => item.id !== action.id);
  }
  return validateState(next);
}
function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('content');
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
    request.onerror = () => { database = undefined; reject(new Error('无法打开本机存储，请重试')); };
    request.onblocked = () => { database = undefined; reject(new Error('本机存储正被其他页面占用，请关闭后重试')); };
  });
  return database;
}
async function transact(seed?: Item[], action?: Action): Promise<Item[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('content','readwrite');
    const store = transaction.objectStore('content');
    const request = store.get('state');
    let result: State; let failure: Error | null = null;
    request.onsuccess = () => {
      try {
        const state = request.result === undefined ? validateState({ version: 1, items: seed || [] }) : validateState(request.result);
        result = action ? applyAction(state, action) : state;
        if (request.result === undefined || action) store.put(result, 'state');
      } catch (error) { failure = error as Error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(copy(result.items));
    transaction.onabort = transaction.onerror = () => reject(failure || new Error('保存失败，本机存储可能已满，请重试'));
  });
}
export const loadItems = async (seed: Item[] = []) => (await loadOnline()) ?? transact(seed);
export const commitAction = (action: Action) => isOnline() ? commitOnline(action) : transact(undefined, action);
export async function closeStore() { if (database) (await database).close(); database = undefined; }
