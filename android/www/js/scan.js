// สแกนคลัง: ลิสต์วิดีโอ → ลายนิ้วมือ (ข้ามไฟล์ที่รู้จักแล้ว: path+ขนาด+เวลาแก้ไขเท่าเดิม) → จับคู่ฐานข้อมูล → สร้างภาพตัวอย่างที่ยังขาด
import * as db from './db.js';
import * as native from './native.js';
import { reconcile } from './lib/reconcile.js';
import { nameMatcher } from './lib/search.js';

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}

export async function runScan({ picked, onProgress = () => {} }) {
  if (!(await native.ensureAccess())) throw new Error('ยังไม่ได้รับสิทธิ์อ่านวิดีโอ กรุณาอนุญาตในหน้าต่างที่ขึ้นมา');
  const filter = nameMatcher(await db.getMeta('scanFilter', 'Screenrecorder'));
  const all = (await native.listVideos(picked)).filter((x) => x.size > 0);
  const listed = new Set(all.map((x) => x.path));
  const items = all.filter((x) => filter(x.name));
  const existing = await db.allClips();
  if (!native.isNative) existing.forEach((c) => listed.add(c.path)); // เบราว์เซอร์เห็นแค่ไฟล์ที่เลือก ไม่ถือว่าไฟล์อื่นหาย
  const known = new Map(existing.map((c) => [`${c.path}|${c.size}|${c.mtime}`, c.id]));

  let done = 0, failed = 0;
  await pool(items, 3, async (it) => {
    const id = known.get(`${it.path}|${it.size}|${it.mtime}`);
    try { it.fp = id || await native.fingerprintOf(it); } catch { failed++; }
    onProgress({ phase: 'scan', done: ++done, total: items.length });
  });

  const r = reconcile(existing, items, listed);
  await db.putClips(r.clips);
  return { ...r, failed, total: items.length, ignored: all.length - items.length };
}

/** สร้างภาพตัวอย่างให้คลิปที่ยังไม่มี (ทีละน้อย ๆ ไม่บล็อกหน้าจอ) */
export async function buildThumbs(onProgress = () => {}) {
  const have = new Set(await db.thumbIds());
  const todo = (await db.allClips()).filter((c) => c.status === 'present' && !have.has(c.id));
  let done = 0, failed = 0;
  const upd = [];
  await pool(todo, 2, async (c) => {
    try {
      const t = await native.makeThumb(c);
      await db.putThumb(c.id, t.blob);
      if (t.durationMs && !c.durationMs) upd.push({ ...c, durationMs: t.durationMs, w: t.w || c.w, h: t.h || c.h });
    } catch { failed++; }
    onProgress({ phase: 'thumb', done: ++done, total: todo.length });
  });
  if (upd.length) { const fresh = new Map((await db.allClips()).map((c) => [c.id, c])); await db.putClips(upd.map((u) => ({ ...fresh.get(u.id), durationMs: u.durationMs, w: u.w, h: u.h }))); }
  return { done, failed, total: todo.length };
}

export const summarize = (r) => {
  const s = r.stats;
  const parts = [`ใหม่ ${s.added}`, `เปลี่ยนชื่อ ${s.renamed}`, `ย้ายที่ ${s.moved}`, `ไฟล์หาย ${s.missing}`, `ซ้ำ ${s.duplicates}`];
  return `สแกน ${r.total} ไฟล์ · ${parts.join(' · ')}${r.failed ? ` · อ่านไม่ได้ ${r.failed}` : ''}`;
};
