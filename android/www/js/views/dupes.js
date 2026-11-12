import * as db from '../db.js';
import { duplicateGroups } from '../lib/reconcile.js';
import { esc, formatBytes } from '../ui.js';

export async function render(root) {
  const groups = duplicateGroups(await db.allClips());
  const wasted = groups.reduce((n, g) => n + g.size * (g.locations.length - 1), 0);
  root.innerHTML = `<h2>ตรวจไฟล์ซ้ำ</h2>
    <p class="meta">เทียบจากเนื้อหาไฟล์ (ลายนิ้วมือ) ไม่ใช่ชื่อ · หน้านี้ดูได้อย่างเดียว แอปไม่ลบไฟล์ใด ๆ</p>
    ${groups.length ? `<div class="notice">พบ ${groups.length} กลุ่ม · สำเนาอาจกินที่ราว ${formatBytes(wasted)} (เทียบจากตัวอย่างเนื้อหาบางช่วง ไม่ใช่ทั้งไฟล์ ควรเปิดดูเทียบก่อนลบเอง)</div>` : '<div class="empty">ยังไม่พบไฟล์ซ้ำ (ลองสแกนก่อน)</div>'}
    ${groups.map((g) => `<div class="card"><div class="title">${esc(g.name)}</div><p class="meta">${formatBytes(g.size)} · เหมือนกัน ${g.locations.length} ที่</p>
      ${g.locations.map((l, i) => `<p class="path">${i === 0 ? 'ตัวหลัก: ' : 'สำเนา: '}${esc(l.path)}</p>`).join('')}
      <a class="btn small" href="#/clip/${encodeURIComponent(g.id)}">เปิดคลิป</a></div>`).join('')}`;
}
