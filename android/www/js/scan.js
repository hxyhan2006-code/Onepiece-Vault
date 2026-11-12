// สแกนคลัง (รันทีละรอบ หยุดได้ ทำต่อได้):
//   ลิสต์วิดีโอ → กรองโฟลเดอร์ (รวมโฟลเดอร์ย่อย) → กรองชื่อ → ลายนิ้วมือ (ข้ามไฟล์ที่รู้จักแล้ว บันทึกเป็นชุด ๆ) → จับคู่ฐานข้อมูล → ภาพตัวอย่าง
// ไฟล์นอกโฟลเดอร์ที่เลือกไม่ถูกแตะ: คลิปและป้ายของมันอยู่ครบ แค่ไม่แสดง
import * as db from './db.js';
import * as native from './native.js';
import { reconcile } from './lib/reconcile.js';
import { nameMatcher } from './lib/search.js';
import { DEFAULT_SCOPE, inScope, libraryCounts, scopeClips, normScope, visibleInScope } from './lib/folders.js';

const FP_WORKERS = 3, THUMB_WORKERS = 2, FLUSH_EVERY = 50, RETRY_THUMB_MS = 24 * 3600 * 1000;
const keyOf = (x) => `${x.path}|${x.size}|${x.mtime}`;

async function pool(list, n, signal, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length && !signal.aborted) await fn(list[i++]); }));
}

export const getScope = async () => normScope(await db.getMeta('scanFolder', DEFAULT_SCOPE));

async function doScan(picked, scope, signal, onProgress) {
  if (!(await native.ensureAccess())) throw new Error('ยังไม่ได้รับสิทธิ์อ่านวิดีโอ กรุณาอนุญาตในหน้าต่างที่ขึ้นมา');
  const nameOk = nameMatcher(await db.getMeta('scanFilter', ''));
  onProgress({ phase: 'list', done: 0, total: 0 });
  const all = (await native.listVideos(picked)).filter((x) => x.size > 0);
  const existing = await db.allClips();
  if (!all.length && existing.length) throw new Error('ระบบไม่เห็นวิดีโอเลยตอนนี้ (การ์ดความจำหรือคลังสื่ออาจยังไม่พร้อม) จึงไม่เปลี่ยนรายการ ลองใหม่อีกครั้ง');
  const inFolder = all.filter((x) => inScope(x.path, scope));
  const items = inFolder.filter((x) => nameOk(x.name));
  const skipped = { outsideFolder: all.length - inFolder.length, byName: inFolder.length - items.length };

  // ที่รู้ลายนิ้วมืออยู่แล้ว: จากคลิป (ตัวหลัก+สำเนา) และจากที่จำที่ค้างจากสแกนรอบก่อน
  const known = await db.getFpCache();
  for (const c of existing) {
    known.set(keyOf(c), c.id);
    for (const k of c.copies || []) if (k.size) known.set(keyOf(k), c.id);
  }

  let done = 0, failed = 0, fresh = 0;
  let pending = [];
  const flush = async () => { const rows = pending; pending = []; if (rows.length) await db.putFpCache(rows); };
  await pool(items, FP_WORKERS, signal, async (it) => {
    let fp = known.get(keyOf(it));
    if (!fp) {
      try { fp = await native.fingerprintOf(it); fresh++; pending.push({ key: keyOf(it), fp }); if (pending.length >= FLUSH_EVERY) await flush(); }
      catch { failed++; }
    }
    it.fp = fp;
    onProgress({ phase: 'fingerprint', done: ++done, total: items.length });
  });
  await flush();
  const base = { skipped, failed, fresh, listed: all.length, inFolder: inFolder.length, matched: items.length };
  if (signal.aborted) return { ...base, aborted: true };

  // อ่านฐานข้อมูลสดอีกครั้งหลังใช้เวลาอ่านลายนิ้วมือ แล้วเขียนเฉพาะคลิปที่เปลี่ยน (ไม่ทับป้ายที่ Han เพิ่งแก้ระหว่างสแกน)
  const live = await db.allClips();
  const r = reconcile(live, items, new Set(all.map((x) => x.path)), Date.now(), { trustListing: native.isNative, canMarkMissing: (c) => visibleInScope(c, scope) });
  const before = new Set(live);
  await db.putClips(r.clips.filter((c) => !before.has(c)));
  await db.pruneFpCache(new Set(all.map(keyOf)));
  return { ...base, stats: r.stats, counts: libraryCounts(r.clips, scope), clips: r.clips };
}

/** สร้างภาพตัวอย่างให้คลิปในโฟลเดอร์ที่เลือกที่ยังไม่มี (ไฟล์ที่ทำไม่สำเร็จ จดไว้ ลองใหม่หลัง 24 ชม. ไม่วนซ้ำทุกสแกน) */
async function doThumbs(scope, signal, onProgress) {
  const have = new Set(await db.thumbIds());
  const now = Date.now();
  const todo = scopeClips(await db.allClips(), scope)
    .filter((c) => c.status === 'present' && !have.has(c.id) && !(c.thumbFailAt && now - c.thumbFailAt < RETRY_THUMB_MS));
  let done = 0, failed = 0;
  await pool(todo, THUMB_WORKERS, signal, async (c) => {
    try {
      const t = await native.makeThumb(c);
      await db.putThumb(c.id, t.blob);
      if (t.durationMs && !c.durationMs) await db.patchClip(c.id, () => ({ durationMs: t.durationMs, w: t.w || c.w, h: t.h || c.h }));
    } catch { failed++; await db.patchClip(c.id, () => ({ thumbFailAt: Date.now() })); }
    onProgress({ phase: 'thumb', done: ++done, total: todo.length });
  });
  return { done, failed, total: todo.length };
}

// ---- สถานะสแกนระดับแอป: มีได้รอบเดียว ออกจากหน้าคลังแล้วกลับมายังเห็นความคืบหน้า ----
let state = { running: false, phase: '', done: 0, total: 0, result: null, error: '', thumbs: null, thumbsStopped: false };
let ctrl = null;
let promise = null;
const subs = new Set();
let lastEmit = 0;
const emit = (force) => { const t = Date.now(); if (force || t - lastEmit > 120) { lastEmit = t; subs.forEach((f) => f({ ...state })); } };
export const getScanState = () => ({ ...state });
export const subscribeScan = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const stopScan = () => ctrl?.abort();

export function startScan(picked) {
  if (state.running) return promise;
  ctrl = new AbortController();
  const signal = ctrl.signal;
  state = { running: true, phase: 'list', done: 0, total: 0, result: null, error: '', thumbs: null, thumbsStopped: false };
  emit(true);
  const progress = (p) => { state = { ...state, ...p }; emit(); };
  promise = (async () => {
    try {
      const scope = await getScope(); // ใช้ขอบเขตเดียวตลอดรอบ (ถ้าผู้ใช้เปลี่ยนโฟลเดอร์ระหว่างสแกน มีผลรอบหน้า)
      const result = await doScan(picked, scope, signal, progress);
      state = { ...state, result };
      if (!result.aborted) state.thumbs = await doThumbs(scope, signal, progress);
      if (signal.aborted && !result.aborted) state.thumbsStopped = true; // หยุดตอนสร้างภาพตัวอย่าง: รายการคลิปบันทึกไปแล้ว
    } catch (e) { state = { ...state, error: e.message || 'สแกนไม่สำเร็จ' }; }
    state = { ...state, running: false };
    emit(true);
    return state.result;
  })();
  return promise;
}

const n = (x) => Number(x).toLocaleString('th-TH');
/** สรุปสแกนเป็นประโยคเดียวอ่านง่าย — ตัวเลขมาจาก libraryCounts ชุดเดียวกับหน้าคลัง */
export function describeScan(st) {
  const r = st.result;
  if (st.error) return st.error;
  if (!r) return '';
  const sk = r.skipped;
  const skip = [sk.outsideFolder ? `นอกโฟลเดอร์ ${n(sk.outsideFolder)}` : '', sk.byName ? `ไม่ตรงชื่อ ${n(sk.byName)}` : ''].filter(Boolean).join(' · ');
  if (r.aborted) return `หยุดสแกนแล้ว (อ่านไปแล้ว ${n(r.fresh)} ไฟล์ สแกนใหม่แล้วจะทำต่อจากเดิม รายการยังไม่เปลี่ยน)`;
  if (!r.matched) return `ไม่พบวิดีโอในโฟลเดอร์ที่เลือก${skip ? ` (ข้าม: ${skip})` : ''} · ตรวจที่ตั้งค่า > โฟลเดอร์ที่สแกน`;
  const s = r.stats, c = r.counts;
  const parts = [`ใหม่ ${n(s.added)}`, `เปลี่ยนชื่อ ${n(s.renamed)}`, `ย้ายที่ ${n(s.moved)}`, `ไฟล์หาย ${n(s.missing)}`];
  return `สแกน ${n(r.matched)} ไฟล์ · ในโฟลเดอร์ที่เลือกมี ${n(c.clips)} คลิป + ซ้ำ ${n(c.copies)} = ${n(c.files)} ไฟล์ · ${parts.join(' · ')}${r.failed ? ` · อ่านไม่ได้ ${n(r.failed)}` : ''}${skip ? ` · ข้าม ${skip}` : ''}${st.thumbsStopped ? ' · หยุดสร้างภาพตัวอย่างกลางคัน (สแกนอีกครั้งจะทำต่อ)' : ''}`;
}
