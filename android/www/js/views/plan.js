import * as db from '../db.js';
import * as native from '../native.js';
import { buildPlan, planToText } from '../lib/plan.js';
import { esc, toast, formatBytes } from '../ui.js';

const DEFAULT_ROOT = '/storage/emulated/0/Movies/OnePiece';
const LABEL = { ready: 'ย้ายได้ (ถ้าอนุมัติ)', same: 'อยู่ถูกที่แล้ว', conflict: 'ชนกัน ต้องแก้ก่อน', 'skip-untagged': 'ยังไม่ติดป้าย', 'skip-missing': 'ไฟล์หาย' };

export async function render(root, { tax }) {
  const clips = await db.allClips();
  const rootPath = await db.getMeta('planRoot', DEFAULT_ROOT);
  const plan = buildPlan(clips, tax, rootPath);
  const s = plan.summary;
  root.innerHTML = `<h2>แผนย้ายไฟล์ (ดูตัวอย่าง)</h2>
    <div class="notice">โหมดดูตัวอย่างเท่านั้น: แอปนี้ยังย้าย ลบ หรือเปลี่ยนชื่อไฟล์จริงไม่ได้ ไฟล์ต้นฉบับอยู่ที่เดิมทั้งหมด</div>
    <label for="root">โฟลเดอร์ปลายทางหลัก</label><input id="root" value="${esc(rootPath)}">
    <div class="row"><button class="btn" id="apply" style="flex:1">คำนวณใหม่</button><button class="btn ghost" id="export" style="flex:1">ส่งออกแผน</button></div>
    <p class="meta">ทั้งหมด ${s.total} · ย้ายได้ ${s.ready || 0} · อยู่ถูกที่แล้ว ${s.same || 0} · ชนกัน ${s.conflict || 0} · ยังไม่ติดป้าย ${s['skip-untagged'] || 0} · ไฟล์หาย ${s['skip-missing'] || 0}</p>
    ${plan.items.length ? '' : '<div class="empty">ยังไม่มีคลิป</div>'}
    ${['ready', 'conflict', 'same'].map((st) => {
      const list = plan.items.filter((i) => i.state === st).slice(0, 200);
      return list.length ? `<h3>${LABEL[st]} (${plan.items.filter((i) => i.state === st).length})</h3>${list.map((i) => `<div class="card"><div class="title" style="word-break:break-all">${esc(i.name)}</div>
        <p class="path">จาก: ${esc(i.from)}</p><p class="path">ไป: ${esc(i.to)}</p><p class="meta">${formatBytes(i.size)}${i.reason ? ` · ${esc(i.reason)}` : ''}${i.dupCopies ? ` · มีไฟล์ซ้ำอีก ${i.dupCopies} ที่ (ไม่ถูกแตะ)` : ''}</p></div>`).join('')}` : '';
    }).join('')}`;
  const $ = (q) => root.querySelector(q);
  $('#apply').onclick = async () => { await db.setMeta('planRoot', $('#root').value.trim() || DEFAULT_ROOT); dispatchEvent(new HashChangeEvent('hashchange')); };
  $('#export').onclick = async () => {
    try { await native.shareText('onepiece-vault-move-plan.txt', planToText(plan), 'text/plain'); } catch (e) { toast(e.message || 'ส่งออกไม่สำเร็จ'); }
  };
}
