import * as db from '../db.js';
import { scopedDuplicateGroups, libraryCounts } from '../lib/folders.js';
import { esc, formatBytes } from '../ui.js';

const n = (x) => Number(x).toLocaleString('th-TH');

export async function render(root, { scope }) {
  const clips = await db.allClips();
  const counts = libraryCounts(clips, scope);
  const groups = scopedDuplicateGroups(clips, scope); // ตัวเลขชุดเดียวกับหน้าคลัง: ไฟล์ซ้ำเกิน = counts.copies
  const wasted = groups.reduce((s, g) => s + g.size * (g.locations.length - 1), 0);
  root.innerHTML = `<h2>ตรวจไฟล์ซ้ำ</h2>
    <p class="meta">เทียบจากเนื้อหาไฟล์ (ลายนิ้วมือ) ไม่ใช่ชื่อ · หน้านี้ดูได้อย่างเดียว แอปไม่ลบไฟล์ใด ๆ</p>
    <p class="meta">${scope ? `โฟลเดอร์ที่แสดง: ${esc(scope)} (รวมโฟลเดอร์ย่อย)` : 'โฟลเดอร์ที่แสดง: ทุกโฟลเดอร์'} · ${n(counts.clips)} คลิป + ไฟล์ซ้ำ ${n(counts.copies)} = ${n(counts.files)} ไฟล์</p>
    ${groups.length ? `<div class="notice">พบ ${n(counts.dupGroups)} กลุ่ม มีไฟล์ซ้ำเกิน ${n(counts.copies)} ไฟล์ · สำเนาอาจกินที่ราว ${formatBytes(wasted)} (เทียบจากตัวอย่างเนื้อหาบางช่วง ไม่ใช่ทั้งไฟล์ ควรเปิดดูเทียบก่อนลบเอง)</div>` : '<div class="empty">ยังไม่พบไฟล์ซ้ำ (ลองสแกนก่อน)</div>'}
    ${groups.map((g) => `<div class="card"><div class="title">${esc(g.name)}</div><p class="meta">${formatBytes(g.size)} · เหมือนกัน ${g.locations.length} ที่</p>
      ${g.locations.map((l, i) => `<p class="path">${i === 0 ? 'ตัวหลัก: ' : 'สำเนา: '}${esc(l.path)}</p>`).join('')}
      <a class="btn small" href="#/clip/${encodeURIComponent(g.id)}">เปิดคลิป</a></div>`).join('')}`;
}
