// แผนย้ายไฟล์ (Preview เท่านั้น): คำนวณว่า "ถ้าจะย้าย" แต่ละคลิปจะไปอยู่ที่ไหน ตามโครง Saga → Arc → ตอน
// ฟังก์ชันนี้ไม่แตะไฟล์ใด ๆ — และแอปไม่มีโค้ดย้าย/ลบ/เปลี่ยนชื่อไฟล์เลย (มีเทสต์เฝ้า)
import { findArc } from './taxonomy.js';
import { folderOf } from './reconcile.js';

const pad = (n, w) => String(n).padStart(w, '0');
export const safeName = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || '_';

export function targetDir(root, tax, clip) {
  const a = findArc(tax, clip.arcId);
  if (!a) return null;
  const ep = clip.episode != null ? `EP${pad(clip.episode, 4)}` : 'ไม่ระบุตอน';
  return [String(root).replace(/\/+$/, ''), `${pad(a.sagaNo, 2)} - ${safeName(a.saga.name)}`, `${pad(a.arcNo, 2)} - ${safeName(a.arc.name)}`, ep].join('/');
}

/**
 * สถานะต่อคลิป: ready (ย้ายได้ถ้าอนุมัติ) · same (อยู่ที่ถูกแล้ว) · conflict (ปลายทางชน) · skip-untagged · skip-missing
 * คลิปที่มีสำเนาซ้ำ: วางแผนเฉพาะตัวหลัก สำเนาที่เหลือแจ้งเตือนเฉย ๆ (ห้ามลบ)
 */
export function buildPlan(clips, tax, root) {
  const items = [];
  const taken = new Map();
  const occupied = new Set(clips.filter((c) => c.status === 'present').flatMap((c) => [c.path, ...(c.copies || []).map((x) => x.path)]));
  for (const c of clips.slice().sort((a, b) => (a.episode ?? 1e9) - (b.episode ?? 1e9) || a.name.localeCompare(b.name))) {
    const base = { id: c.id, name: c.name, from: c.path, size: c.size, dupCopies: (c.copies || []).length };
    if (c.status === 'missing') { items.push({ ...base, state: 'skip-missing', reason: 'ไฟล์หายจากเครื่อง' }); continue; }
    const dir = targetDir(root, tax, c);
    if (!dir) { items.push({ ...base, state: 'skip-untagged', reason: 'ยังไม่ได้ติดป้าย Arc' }); continue; }
    const to = `${dir}/${safeName(c.name)}`;
    if (folderOf(c.path) === dir) { items.push({ ...base, to, state: 'same', reason: 'อยู่ถูกที่แล้ว' }); continue; }
    if (taken.has(to)) { items.push({ ...base, to, state: 'conflict', reason: `ชื่อปลายทางซ้ำกับ ${taken.get(to)}` }); continue; }
    if (occupied.has(to)) { items.push({ ...base, to, state: 'conflict', reason: 'มีไฟล์อื่นอยู่ที่ปลายทางแล้ว' }); continue; }
    taken.set(to, c.name);
    items.push({ ...base, to, state: 'ready', reason: c.episode == null ? 'ยังไม่ระบุตอน จะไปโฟลเดอร์ "ไม่ระบุตอน"' : '' });
  }
  const summary = { total: items.length };
  for (const it of items) summary[it.state] = (summary[it.state] || 0) + 1;
  return { root, items, summary, dryRun: true };
}

export function planToText(plan) {
  const lines = [`แผนย้ายไฟล์ (ดูตัวอย่างเท่านั้น ยังไม่ได้ย้ายจริง) · ปลายทางหลัก ${plan.root}`, ''];
  for (const it of plan.items.filter((i) => i.state === 'ready')) lines.push(`${it.from}\n  -> ${it.to}${it.reason ? `  (${it.reason})` : ''}`);
  const bad = plan.items.filter((i) => i.state === 'conflict');
  if (bad.length) { lines.push('', 'ชนกัน (ต้องแก้ก่อน):'); bad.forEach((i) => lines.push(`${i.from}  -- ${i.reason}`)); }
  return lines.join('\n');
}
