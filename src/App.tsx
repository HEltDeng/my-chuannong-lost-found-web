import { isOnline, isConnected, onlineDetail, getNotices, markNoticeRead } from './online';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowLeftIcon, MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, Cross2Icon, CheckIcon, ImageIcon, Pencil1Icon, TrashIcon, CopyIcon, CheckCircledIcon, SewingPinFilledIcon } from '@radix-ui/react-icons';
import { BottomSheet, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard, useKeyboardInsets, useMobileDevice } from './mobile';
import type { Item, Kind, ReviewNotice } from './types';
import { loadItems, commitAction, type Action } from './storage';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/600.css';
import '@fontsource/noto-sans-sc/700.css';

declare global { interface Window { CampusLostFound?: { back: () => boolean; ready: boolean; refresh: () => Promise<void> }; } }
type Draft = Pick<Item, 'kind' | 'title' | 'campus' | 'location' | 'date' | 'image' | 'description' | 'contact'>;
type Page = 'home' | 'mine' | 'detail' | 'publish' | 'notifications';
type Sheet = 'campus' | 'form-campus' | 'contact' | 'delete' | 'discard' | 'photo' | 'full-image' | null;
const campuses = ['成都校区', '雅安校区', '都江堰校区'];
const boot = new URLSearchParams(location.search);
const bootKind: Kind = boot.get('start') === 'publish-lost' ? 'lost' : 'found';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function timeLabel(item: Item) {
  if (item.createdAt) {
    const age = Date.now() - item.createdAt;
    if (age < 60_000) return '刚刚';
    if (age < 3_600_000) return `${Math.floor(age / 60_000)}分钟前`;
    return new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(item.createdAt));
  }
  return item.date === today() ? item.time.replace('昨天', '今天') : `${item.date.slice(5)} ${item.time.replace(/^(今天|昨天) /, '')}`;
}
const emptyDraft = (kind: Kind): Draft => ({ kind, title: '', campus: '成都校区', location: '', date: today(), image: '', description: '', contact: '' });

const reviewLabels:Record<string,string>={PENDING:'待审核',PUBLISHED:'已发布',VIOLATION:'违规'};
const ReviewBadge=({item}:{item:{status?:string}})=>item.status?<span className={`lf-review-status ${item.status.toLowerCase()}`}>{reviewLabels[item.status]||item.status}</span>:null;
const ReviewReason=({item}:{item:Item})=>item.moderationNote?<div className="lf-review-reason"><strong>处理原因</strong><p>{item.moderationNote}</p></div>:null;
const progress=(item:Item)=>item.done?(item.kind==='lost'?'已找回':'已归还'):'进行中';
async function readPhoto(file:File):Promise<string>{
  const source=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});
  const image=new Image();image.src=source;await image.decode();
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const value=canvas.toDataURL('image/jpeg',.85);if(value.length>3_000_000)throw Error('图片较大，请换一张照片');return value;
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [processingPhoto,setProcessingPhoto]=useState(false);
  const [connected,setConnected]=useState(true);
  const [notices,setNotices]=useState<ReviewNotice[]>([]);
  const syncing=useRef(false),seenNotices=useRef(new Set<string>());
  const publishId=useRef(`mine-${crypto.randomUUID()}`);
  const saving = useRef(false);
  const [page, setPage] = useState<Page>(boot.get('start')?.startsWith('publish-') ? 'publish' : boot.has('post') ? 'detail' : 'home');
  const [previousPage, setPreviousPage] = useState<'home' | 'mine'>('home');
  const [kind, setKind] = useState<Kind>(bootKind);
  const [query, setQuery] = useState('');
  const [campus, setCampus] = useState('全部校区');
  const [mineFilter, setMineFilter] = useState('全部');
  const [selectedId, setSelectedId] = useState<string | null>(boot.get('post'));
  const [sheet, setSheet] = useState<Sheet>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(bootKind));
  const [originalDraft, setOriginalDraft] = useState<Draft>(emptyDraft(bootKind));
  const [editId, setEditId] = useState<string | null>(null);
  const [formReturn, setFormReturn] = useState<Page>('home');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [lastDeleted, setLastDeleted] = useState<Item | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboard();
  const { bottomInset, isKeyboardVisible } = useKeyboardInsets();
  const { device } = useMobileDevice();
  const load = async () => { setLoadError(''); try { setItems(await loadItems([])); setNotices(getNotices()); setConnected(isConnected()); setReady(true); } catch (cause) { setLoadError((cause as Error).message); } };
  useEffect(() => { void load(); }, []);
  const selected = items.find(i => i.id === selectedId);
  async function sync(manual=false){
    if(!ready||!isOnline()||syncing.current||document.hidden)return;
    syncing.current=true;
    try{setItems(await loadItems([]));const next=getNotices();setNotices(next);setConnected(true);
      if(next.some(n=>!n.read_at&&!seenNotices.current.has(n.id)))setToast('收到新的处理通知，请查看结果和原因');
      next.forEach(n=>seenNotices.current.add(n.id));if(manual)setToast('已同步最新状态');
    }catch(error){setConnected(false);setItems(rows=>rows.filter(r=>r.mine));if(manual)setToast((error as Error).message);}
    finally{syncing.current=false;}
  }
  useEffect(()=>{if(!ready||!isOnline())return;const refresh=()=>{void sync();};const timer=window.setInterval(refresh,10000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);refresh();return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[ready]);
  useEffect(()=>{if(!selected&&['contact','delete','full-image'].includes(sheet||''))setSheet(null);},[selected,sheet]);
  useEffect(() => {
    if (page !== 'detail' || !selectedId || !isOnline()) return;
    let active = true;
    onlineDetail(selectedId).then(item => { if (item && active) setItems(rows => [...rows.filter(r=>r.id!==item.id),item]); })
      .catch(error => { if(active){setToast(error.message);if(error.code==='NOT_FOUND')setItems(rows=>rows.filter(r=>r.id!==selectedId));} });
    return () => { active = false; };
  }, [page, selectedId]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => { setToast(''); setLastDeleted(null); }, 6500); return () => window.clearTimeout(timer); }, [toast]);
  const tell = (text: string) => { setToast(''); window.setTimeout(() => setToast(text), 0); };
  const go = (next: Page) => { keyboard.hide(); setSheet(null); setPage(next); };
  const back = (): boolean => {
    if (busy) return true;
    if (sheet) { setSheet(null); return true; }
    if (page === 'home' || !ready) return false;
    if (page === 'publish' && JSON.stringify(draft) !== JSON.stringify(originalDraft)) { keyboard.hide(); setSheet('discard'); return true; }
    go(page === 'detail' ? previousPage : page === 'publish' ? formReturn : 'home');
    return true;
  };
  useEffect(() => { window.CampusLostFound = {back, ready, refresh:()=>sync()}; return () => { delete window.CampusLostFound; }; });
  const headerBack = () => { if (!back()) { if (location.hostname === 'appassets.androidplatform.net') location.href = './exit'; else tell('当前已在失物招领首页'); } };
  const persist = async (action: Action): Promise<boolean> => {
    if (saving.current || !ready) return false;
    saving.current = true; setBusy(true);
    try { setItems(await commitAction(action)); setNotices(getNotices()); setConnected(isConnected()); return true; }
    catch (cause) { tell((cause as Error).message || '保存失败，请重试'); return false; }
    finally { saving.current = false; setBusy(false); }
  };
  const openDetail = (item: Item) => { setSelectedId(item.id); setPreviousPage(page === 'mine' ? 'mine' : 'home'); go('detail'); };
  const openPublish = (item?: Item) => {
    if(!item)publishId.current=`mine-${crypto.randomUUID()}`;
    const next = item ? { kind: item.kind, title: item.title, campus: item.campus, location: item.location, date: item.date, image: item.image, description: item.description, contact: item.contact } : emptyDraft(kind);
    setFormReturn(page); setEditId(item?.id ?? null); setDraft(next); setOriginalDraft(next); setError(''); go('publish');
  };
  const changeDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(old => ({ ...old, [key]: value })); setError(''); };
  const publish = async (event: FormEvent) => {
    event.preventDefault(); keyboard.hide();
    if(processingPhoto)return;
    if (!draft.title.trim()) { setError('请填写物品名称'); return; }
    if (!draft.location.trim()) { setError('请填写具体地点'); return; }
    if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date)) || new Date(draft.date).toISOString().slice(0,10) !== draft.date) { setError('请填写有效日期，如 2026-10-16'); return; }
    if (!draft.contact.trim()) { setError('请填写微信号或联系电话'); return; }
    const item: Item = { ...draft, title: draft.title.trim(), location: draft.location.trim(), description: draft.description.trim(), contact: draft.contact.trim(), id: editId || publishId.current, mine: true, time: editId ? (items.find(i => i.id === editId)?.time || '刚刚') : '刚刚', done: items.find(i => i.id === editId)?.done, createdAt: editId ? items.find(i => i.id === editId)?.createdAt : Date.now() };
    if (!await persist({type:'save',item,editing:!!editId})) return;
    setSelectedId(item.id); setPreviousPage('mine'); setMineFilter('全部'); setKind(item.kind); setCampus('全部校区'); setQuery(''); go(isOnline()?'mine':'detail'); tell(isOnline()?(editId?'修改已提交，等待重新审核':'已提交，等待管理员审核'):(editId?'修改已保存':'发布成功'));
  };
  const remove = async () => { if (!selected?.mine || !await persist({type:'delete',id:selected.id})) return; setLastDeleted(isOnline()?null:selected); go('mine'); tell('已删除这条信息'); };
  const restore = async () => { if (lastDeleted && await persist({type:'restore',item:lastDeleted})) { setLastDeleted(null); setToast(''); } };
  const complete = async () => { if (selected && await persist({type:'complete',id:selected.id})) tell(selected.done ? '已重新开放' : '已标记为完成'); };
  const copyContact = async () => {
    if (!selected) return;
    let copied = false;
    try {
      const field = document.createElement('textarea'); field.value = selected.contact; field.readOnly = true; field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;font-size:16px';
      (document.querySelector('[role=dialog]') || document.body).appendChild(field); field.focus(); field.select(); copied = document.execCommand('copy'); field.remove();
      if (!copied && navigator.clipboard) { await navigator.clipboard.writeText(selected.contact); copied = true; }
    } catch { copied = false; }
    tell(copied ? '联系方式已复制' : '请长按联系方式手动复制');
  };
  const keywords = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = items.filter(i => (!isOnline()||(connected&&i.status==='PUBLISHED')) && !i.done && i.kind === kind && (campus === '全部校区' || i.campus === campus) && keywords.every(word => `${i.title}${i.location}${i.campus}${i.description}`.toLocaleLowerCase().includes(word)));
  const myItems = items.filter(i => i.mine && (mineFilter === '全部' || (mineFilter==='进行中'?!i.done:mineFilter==='已完成'?i.done:reviewLabels[i.status||'']===mineFilter)));
  const heading = page === 'home' ? '失物招领' : page === 'mine' ? '我的发布' : page === 'notifications'?'处理通知':page === 'detail' ? (selected?.kind === 'lost' ? '寻物详情' : '招领详情') : editId ? '编辑信息' : '发布信息';
  const row = (item: Item) => <button key={item.id} className="lf-item" data-id={item.id} onClick={() => openDetail(item)} aria-label={`查看${item.title}`}>
    {item.image ? <img src={item.image} alt={item.title} className="lf-thumb" draggable={false} /> : <span className="lf-no-photo" aria-label="未添加图片"><ImageIcon /></span>}
    <span className="lf-item-copy"><span className="lf-item-title">{item.title}</span><span className="lf-location"><SewingPinFilledIcon />{item.campus} · {item.location}</span><span className="lf-time">{timeLabel(item)}{!isOnline() && !item.mine && <span className="lf-status done">示例</span>}{page === 'mine' && <span className={`lf-status ${item.done ? 'done' : ''}`}>{progress(item)}</span>}{page==='mine'&&<ReviewBadge item={item}/>}</span>{page==='mine'&&<ReviewReason item={item}/>}</span>
  </button>;

  return <div className="lf-app" style={{ '--lf-safe-top': `${device.geometry.safeArea.top}px` } as CSSProperties}>
    <header className="lf-header"><button className="lf-back" aria-label="返回" onClick={headerBack}><ArrowLeftIcon /></button><h1>{heading}</h1>{page === 'home' && ready ? <button className="lf-text-button" onClick={() => go('mine')}>我的</button> : <span className="lf-header-spacer" />}</header>
    {!ready && <div className="native-loading" role="status">{loadError || '正在读取信息…'}{loadError && <button className="lf-primary" onClick={load}>重新读取</button>}</div>}
    {ready && <>
    {isOnline()&&<div className="lf-sync"><span>{connected?'审核通过后公开展示':'连接已中断，请重新连接后同步'}</span><div><button onClick={()=>{go('notifications');void sync();}}>处理通知{notices.some(n=>!n.read_at)?` (${notices.filter(n=>!n.read_at).length})`:''}</button><button onClick={()=>void sync(true)}>刷新</button></div></div>}
    {page==='notifications'&&<MobileScroll className="lf-scroll"><main className="lf-notices">{notices.length?notices.map(n=><article className="lf-notice" key={n.id} data-post={n.post_id}><div><ReviewBadge item={n}/><span>{n.post_type==='lost'?'寻物':'招领'} · {n.read_at?'已读':'未读'}</span></div><h2>{n.title}</h2><p>处理结果：{{approve:'审核通过',reject:'审核驳回',take_down:'已下架'}[n.action]}</p>{n.reason?<div className="lf-review-reason"><strong>具体原因</strong><p>{n.reason}</p></div>:<p>本次审核已通过，当前状态和完成进度可在“我的发布”查看。</p>}<small>{new Date(n.created_at).toLocaleString('zh-CN')}</small><div className="lf-notice-actions"><button onClick={()=>{setSelectedId(n.post_id);setPreviousPage('mine');go('detail');}}>查看信息</button>{!n.read_at&&<button onClick={()=>void markNoticeRead(n.id).then(setNotices).catch(e=>tell(e.message))}>标记已读</button>}</div></article>):<p>暂时没有处理通知</p>}</main></MobileScroll>}

    {page === 'home' && <>
      <div className="lf-discovery">
        <form className="lf-search" role="search" onSubmit={event => { event.preventDefault(); keyboard.hide();
    if(processingPhoto)return; }}><MagnifyingGlassIcon /><KeyboardInput aria-label="搜索物品或地点" placeholder="搜索物品或地点" value={query} onChange={e => setQuery(e.target.value)} maxLength={60} enterKeyHint="search" />{query && <button type="button" className="lf-clear" aria-label="清空搜索" onClick={() => { setQuery(''); keyboard.hide(); }}><Cross2Icon /></button>}</form>
        <div className="lf-filter-bar"><div className="lf-tabs" role="tablist" aria-label="信息类型"><button role="tab" aria-selected={kind === 'lost'} className={kind === 'lost' ? 'active' : ''} onClick={() => { keyboard.hide(); setKind('lost'); }}>寻物</button><button role="tab" aria-selected={kind === 'found'} className={kind === 'found' ? 'active' : ''} onClick={() => { keyboard.hide(); setKind('found'); }}>招领</button></div><button className="lf-campus" onClick={() => setSheet('campus')}>{campus}<ChevronDownIcon /></button></div>
      </div>
      <MobileScroll key={`home-${kind}-${campus}`} className="lf-scroll lf-home-scroll"><main className="lf-list" aria-label={kind === 'found' ? '招领列表' : '寻物列表'}>{filtered.length ? <>{filtered.map(row)}<p className="lf-end">没有更多了</p></> : <div className="lf-empty"><MagnifyingGlassIcon /><h2>没有找到相关物品</h2><p>试试其他关键词，或切换校区</p><button className="lf-secondary" onClick={() => { keyboard.hide(); setQuery(''); setCampus('全部校区'); }}>清除筛选</button></div>}</main></MobileScroll>
      {!isKeyboardVisible && <button className="lf-fab" style={{ bottom: bottomInset + 18 }} onClick={() => openPublish()}><PlusIcon />发布</button>}
    </>}
    {page === 'mine' && <>
      <div className="lf-mine-tabs" role="tablist" aria-label="发布状态">{(isOnline()?['全部','待审核','已发布','违规','进行中','已完成']:['全部','进行中','已完成']).map(filter => <button key={filter} role="tab" aria-selected={mineFilter === filter} className={mineFilter === filter ? 'active' : ''} onClick={() => setMineFilter(filter)}>{filter}</button>)}</div>
      <MobileScroll key={`mine-${mineFilter}`} className="lf-scroll"><main className="lf-list lf-mine-list">{myItems.length ? <>{myItems.map(row)}<p className="lf-end">没有更多了</p></> : <div className="lf-empty"><ImageIcon /><h2>{mineFilter === '已完成' ? '还没有完成的记录' : '还没有发布信息'}</h2><p>寻回遗失物品，也帮好心找到回应</p><button className="lf-primary" onClick={() => openPublish()}>发布一条信息</button></div>}</main></MobileScroll>
    </>}
    {page === 'detail' && selected && <>
      <MobileScroll key={selected.id} className="lf-scroll"><main className="lf-detail">
        {selected.mine&&<div className="lf-review-detail"><ReviewBadge item={selected}/><span>{selected.status==='PUBLISHED'&&!selected.done?'公开列表展示中':'公开列表不展示'}</span><ReviewReason item={selected}/></div>}
        {selected.image&&<button className="lf-detail-photo" onClick={()=>setSheet('full-image')} aria-label="查看完整物品照片"><img className="lf-detail-image" src={selected.image} alt={selected.title} draggable={false}/><span>点击查看完整大图</span></button>}
        <div className="lf-detail-heading"><span className="lf-label">{selected.kind === 'found' ? '招领' : '寻物'}{' · '+progress(selected)}</span><h2>{selected.title}</h2><p className="lf-location"><SewingPinFilledIcon />{selected.campus} · {selected.location}</p><p className="lf-detail-date">{selected.date} · {selected.kind === 'found' ? '拾获' : '遗失'}</p></div>
        <section className="lf-description"><h3>物品描述</h3><p>{selected.description || '发布人暂未补充描述，可联系了解物品特征。'}</p></section><p className="lf-gentle-note">{selected.kind === 'found' ? '领取时请核对物品特征，确认后当面交还。' : '如有相关线索，可以通过联系方式联系发布人。'}</p>{!isOnline() && !selected.mine && <p className="lf-demo-note">示例信息，用于体验页面交互</p>}
      </main></MobileScroll>
      <div className="lf-dock" style={{ bottom: bottomInset }}>{selected.mine ? <><div className="lf-management"><button disabled={busy} onClick={() => openPublish(selected)}><Pencil1Icon />编辑</button><button disabled={busy} className="lf-delete" onClick={() => setSheet('delete')}><TrashIcon />删除</button></div><button disabled={busy||(isOnline()&&selected.status!=='PUBLISHED')} className="lf-primary" onClick={complete}><CheckCircledIcon />{selected.done?'重新开放':selected.kind==='lost'?'标记已找回':'标记已归还'}</button></> : <button className="lf-primary" onClick={() => setSheet('contact')}>联系发布人</button>}</div>
    </>}
    {page === 'detail' && !selected && <div className="lf-empty"><h2>这条信息不存在或已被删除</h2><button className="lf-primary" onClick={() => go('home')}>返回列表</button></div>}
    {page === 'publish' && <>
      <MobileScroll key={`publish-${editId || 'new'}`} className="lf-scroll"><form id="lf-publish-form" className="lf-form" onSubmit={publish} noValidate>
        <div className="lf-segment" role="tablist" aria-label="发布类型"><button type="button" role="tab" aria-selected={draft.kind === 'lost'} className={draft.kind === 'lost' ? 'active' : ''} onClick={() => changeDraft('kind', 'lost')}>我丢了东西</button><button type="button" role="tab" aria-selected={draft.kind === 'found'} className={draft.kind === 'found' ? 'active' : ''} onClick={() => changeDraft('kind', 'found')}>我捡到东西</button></div>
        <div className="lf-photo-row"><button type="button" className="lf-photo-picker" onClick={() => setSheet('photo')} aria-label={draft.image ? '更换物品照片' : '添加物品照片'}>{draft.image ? <img src={draft.image} alt="已选物品照片" /> : <><PlusIcon /><span>添加照片</span></>}</button><div><p>物品照片 <span>选填</span></p><small>清晰的照片，更容易找到失主<br />请遮住证件上的个人信息</small>{draft.image && <button type="button" className="lf-remove-photo" onClick={() => changeDraft('image', '')}>移除照片</button>}</div></div>
        <label className="lf-field"><span>物品名称 <b>*</b></span><KeyboardInput aria-label="物品名称" value={draft.title} onChange={e => changeDraft('title', e.target.value)} maxLength={30} placeholder={draft.kind === 'found' ? '例如：捡到一张校园卡' : '例如：寻找一串钥匙'} /></label>
        <div className="lf-field"><span>所在校区 <b>*</b></span><button type="button" className="lf-select" aria-label="选择所在校区" onClick={() => setSheet('form-campus')}>{draft.campus}<ChevronRightIcon /></button></div>
        <label className="lf-field"><span>{draft.kind === 'found' ? '拾获地点' : '遗失地点'} <b>*</b></span><KeyboardInput aria-label="具体地点" value={draft.location} onChange={e => changeDraft('location', e.target.value)} maxLength={40} placeholder="例如：图书馆一楼" /></label>
        <label className="lf-field"><span>{draft.kind === 'found' ? '拾获日期' : '遗失日期'} <b>*</b></span><KeyboardInput aria-label="物品日期" value={draft.date} onChange={e => changeDraft('date', e.target.value)} maxLength={10} placeholder="2026-10-16" /></label>
        <label className="lf-field"><span>补充描述 <em>选填</em></span><KeyboardTextarea aria-label="补充描述" value={draft.description} onChange={e => changeDraft('description', e.target.value)} maxLength={300} placeholder="物品特征、颜色，或其他有用的线索…" rows={3} /></label>
        <label className="lf-field"><span>联系方式 <b>*</b></span><KeyboardInput aria-label="联系方式" value={draft.contact} onChange={e => changeDraft('contact', e.target.value)} maxLength={60} placeholder="微信号或联系电话" /><small>仅在物品详情中展示</small></label><p className="lf-demo-note">{isOnline() ? '提交或修改后需管理员审核，通过后对其他同学展示。联系方式仅在详情展示。' : '信息保存在本机，暂未向其他设备同步'}</p>
      </form></MobileScroll><div className="lf-dock" style={{ bottom: bottomInset }}>{error && <p role="alert" className="lf-error">{error}</p>}<button disabled={busy||processingPhoto} type="submit" form="lf-publish-form" className="lf-primary">{busy?'正在提交…':processingPhoto?'正在处理图片…':isOnline()?(editId?'保存并重新审核':'提交审核'):(editId?'保存修改':'确认发布')}</button></div>
    </>}
    <BottomSheet open={sheet === 'campus' || sheet === 'form-campus'} onOpenChange={open => !open && setSheet(null)} title="选择校区" description="查看所在校区的失物信息" snap={0.48}><div className="lf-sheet-options">{(sheet === 'campus' ? ['全部校区', ...campuses] : campuses).map(c => <button key={c} onClick={() => { if (sheet === 'campus') setCampus(c); else changeDraft('campus', c); setSheet(null); }}><span>{c}</span>{(sheet === 'campus' ? campus : draft.campus) === c && <CheckIcon />}</button>)}</div></BottomSheet>
    <BottomSheet open={sheet === 'contact'} onOpenChange={open => !open && setSheet(null)} title="联系发布人" description={isOnline() || selected?.mine ? '通过以下方式联系' : '以下为示例联系方式，不会发出消息'} snap={0.4}><div className="lf-contact-card"><span>微信号 / 电话</span><strong>{selected?.contact}</strong></div><button className="lf-primary" onClick={copyContact}><CopyIcon />复制联系方式</button></BottomSheet>
    <BottomSheet open={sheet === 'delete'} onOpenChange={open => !open && !busy && setSheet(null)} title="删除这条信息？" description={isOnline()?"删除后将从后台、公开列表和我的发布中永久移除，不能撤销。":"删除后将从列表中移除，可在提示中撤销。"} snap={0.36}><div className="lf-sheet-actions"><button disabled={busy} className="lf-danger" onClick={remove}>确认删除</button><button disabled={busy} className="lf-secondary" onClick={() => setSheet(null)}>保留信息</button></div></BottomSheet>
    <BottomSheet open={sheet === 'discard'} onOpenChange={open => !open && setSheet(null)} title="放弃这次编辑？" description="尚未保存的内容将不会保留。" snap={0.36}><div className="lf-sheet-actions"><button className="lf-primary" onClick={() => setSheet(null)}>继续编辑</button><button className="lf-secondary" onClick={() => go(formReturn)}>放弃编辑</button></div></BottomSheet>
    <BottomSheet open={sheet === 'photo'} onOpenChange={open => !open && setSheet(null)} title="添加物品照片" description="选择真实物品照片，请遮住证件上的个人信息" snap={0.57}><button className="lf-primary" onClick={() => upload.current?.click()}><ImageIcon />从本机选择照片</button></BottomSheet>
    <BottomSheet open={sheet==='full-image'&&!!selected?.image} onOpenChange={open=>!open&&setSheet(null)} title="完整物品照片" description={selected?.title}><img className="lf-full-image" src={selected?.image} alt={selected?.title}/></BottomSheet>
    <input ref={upload} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { tell('请选择 10 MB 以内的 JPG、PNG 或 WebP 图片'); event.target.value = ''; return; } event.target.value='';setProcessingPhoto(true);try{changeDraft('image',await readPhoto(file));setSheet(null);}catch(error){tell((error as Error).message||'无法读取这张照片，请重新选择');}finally{setProcessingPhoto(false);} }} />
    </>}
    {toast && <div className="lf-toast" role="status" style={{ bottom: bottomInset + 90 }}>{toast}{lastDeleted && <button disabled={busy} onClick={restore}>撤销</button>}</div>}
  </div>;
}
