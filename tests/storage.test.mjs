import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { loadItems, commitAction, closeStore, DATABASE } from '../src/storage.ts';

const fixture = (id = 'mine-test') => ({id, kind:'found', title:'测试校园卡', campus:'成都校区', location:'图书馆', date:'2026-10-16', time:'刚刚', description:'仅为自动化测试', contact:'test_contact', image:'', mine:true, createdAt:1});
beforeEach(async () => { await closeStore(); globalThis.indexedDB = new IDBFactory(); });
afterEach(closeStore);
async function raw(write) {
  const db = await new Promise((resolve, reject) => { const r=indexedDB.open(DATABASE,1); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
  return new Promise((resolve,reject)=>{const t=db.transaction('content','readwrite'); const s=t.objectStore('content'); let result; const r=write===undefined?s.get('state'):s.put(write,'state');r.onsuccess=()=>result=r.result;t.oncomplete=()=>{db.close();resolve(result)};t.onabort=()=>reject(t.error);});
}
test('fresh installs and reopened empty stores contain no sample posts', async () => {
  assert.deepEqual(await loadItems(), []);
  await closeStore();
  assert.deepEqual(await loadItems(), []);
});

test('seeds once and preserves publications across database reopen', async () => {
  await loadItems([{...fixture('sample'),mine:false}]);
  await commitAction({type:'save',item:fixture(),editing:false});
  await closeStore();
  const items=await loadItems([]);
  assert.deepEqual(items.map(i=>i.id),['mine-test','sample']);
  items[0].title='outside mutation';
  assert.equal((await loadItems([]))[0].title,'测试校园卡');
});
test('edit, complete, reopen, delete and undo are durable', async () => {
  await loadItems([]);
  const item={...fixture(),image:'data:image/png;base64,YWJj'};
  await commitAction({type:'save',item,editing:false});
  await commitAction({type:'save',item:{...item,title:'修改后的卡',createdAt:99},editing:true});
  await commitAction({type:'complete',id:item.id}); await closeStore();
  const saved=(await loadItems([]))[0];
  assert.equal(saved.done,true); assert.equal(saved.createdAt,1); assert.equal(saved.title,'修改后的卡'); assert.equal(saved.image,item.image);
  await commitAction({type:'delete',id:item.id}); await closeStore(); assert.equal((await loadItems([])).length,0);
  await commitAction({type:'restore',item:saved}); await closeStore(); assert.deepEqual(await loadItems([]),[saved]);
  assert.equal((await commitAction({type:'complete',id:item.id}))[0].done,false);
});
test('sample records cannot be edited, completed or deleted', async () => {
  const sample={...fixture('sample'),mine:false}; await loadItems([sample]);
  for(const action of [{type:'save',item:sample,editing:true},{type:'complete',id:'sample'},{type:'delete',id:'sample'}]) await assert.rejects(commitAction(action));
  assert.deepEqual(await loadItems([]),[sample]);
});
test('invalid date, oversized text and remote or script images are rejected atomically', async () => {
  await loadItems([]);
  for(const invalid of [{date:'2026-02-30'},{title:'字'.repeat(31)},{contact:' '},{image:'https://example.com/photo.png'},{image:'javascript:alert(1)'}]) {
    await assert.rejects(commitAction({type:'save',item:{...fixture(),...invalid},editing:false}));
    assert.deepEqual(await loadItems([]),[]);
  }
});
test('duplicate IDs and an already-restored record are rejected', async () => {
  await loadItems([]); await commitAction({type:'save',item:fixture(),editing:false});
  await assert.rejects(commitAction({type:'save',item:fixture(),editing:false}));
  await assert.rejects(commitAction({type:'restore',item:fixture()}));
  assert.equal((await loadItems([])).length,1);
});
test('concurrent writes preserve both records', async () => {
  await loadItems([]);
  await Promise.all(['mine-a','mine-b'].map(id=>commitAction({type:'save',item:fixture(id),editing:false})));
  assert.deepEqual((await loadItems([])).map(i=>i.id).sort(),['mine-a','mine-b']);
});
test('a failed write keeps the previously saved state', async () => {
  await loadItems([fixture()]);
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(){throw new DOMException('Full','QuotaExceededError')};
  try { await assert.rejects(commitAction({type:'delete',id:'mine-test'})); }
  finally { IDBObjectStore.prototype.put=original; }
  await closeStore(); assert.deepEqual(await loadItems([]),[fixture()]);
});
test('corrupt storage is reported and is never replaced by sample data', async () => {
  await loadItems([]); await raw({version:27,items:[]}); await closeStore();
  await assert.rejects(loadItems([fixture()]),/格式无法读取/);
  assert.deepEqual(await raw(),{version:27,items:[]});
});
