import * as db from '../db.js';
import * as native from '../native.js';
import { findArc } from '../lib/taxonomy.js';
import { esc, icon, arcOptions, toast, formatBytes, formatDuration } from '../ui.js';

export async function render(root, { tax, arg }) {
  const c = await db.getClip(arg);
  if (!c) { root.innerHTML = '<a class="back" href="#/library">' + icon('back') + 'กลับ</a><div class="empty">ไม่พบคลิปนี้</div>'; return; }
  const src = c.status === 'present' ? native.playUrl(c) : null;
  const a = findArc(tax, c.arcId);
  root.innerHTML = `
    <a class="back" href="#/library">${icon('back')}กลับคลัง</a>
    ${src ? `<video id="v" src="${esc(src)}" controls playsinline preload="metadata"></video><p class="form-error" id="verr" hidden></p>
      ${native.isNative ? '<div class="row"><button class="btn small ghost" id="ext">เปิดด้วยแอปเล่นวิดีโอ</button></div>' : ''}`
      : `<div class="notice">${c.status === 'missing' ? 'ไฟล์นี้หายจากเครื่อง (ป้ายยังอยู่ เมื่อไฟล์กลับมาแล้วสแกน จะจับคู่ให้เอง)' : 'เล่นไม่ได้ในหน้านี้ ให้กดสแกนเลือกไฟล์ใหม่'}</div>`}
    <h2 style="word-break:break-all">${esc(c.name)}</h2>
    <p class="meta">${formatBytes(c.size)}${c.durationMs ? ` · ${formatDuration(c.durationMs)}` : ''}${c.w ? ` · ${c.w}x${c.h}` : ''}</p>
    <p class="path">${esc(c.path)}</p>
    ${c.copies?.length ? `<div class="notice">มีไฟล์เนื้อหาเดียวกันอีก ${c.copies.length} ที่ (ไม่ได้ลบอะไร)<br>${c.copies.map((x) => esc(x.path)).join('<br>')}</div>` : ''}
    ${c.history?.length ? `<h3>ชื่อ/ที่อยู่เดิมที่เคยเจอ</h3>${c.history.slice().reverse().map((h) => `<p class="path">${esc(h.path)}</p>`).join('')}` : ''}
    <h3>ป้ายกำกับ</h3>
    <label for="arc">Arc${a ? ` (Saga: ${esc(a.saga.name)})` : ''}</label><select id="arc">${arcOptions(tax, c.arcId)}</select>
    <label for="ep">เลขตอน</label><input id="ep" type="number" min="0" inputmode="numeric" value="${c.episode ?? ''}" placeholder="เช่น 21">
    <label for="chars">ตัวละคร (คั่นด้วยจุลภาค)</label><input id="chars" value="${esc((c.characters || []).join(', '))}" placeholder="ลูฟี่, ซันจิ">
    <label for="notes">บันทึก</label><textarea id="notes" rows="3">${esc(c.notes)}</textarea>
    <p class="form-error" id="err" role="alert" hidden></p>
    <div class="row"><button class="btn primary" id="save" style="flex:1">บันทึกป้าย</button></div>`;
  const $ = (s) => root.querySelector(s);
  const v = $('#v');
  if (v) v.onerror = () => { $('#verr').textContent = 'เล่นวิดีโอนี้ในแอปไม่ได้ (รูปแบบไฟล์อาจไม่รองรับ)'; $('#verr').hidden = false; };
  $('#ext')?.addEventListener('click', () => native.openExternal(c).catch((e) => toast(e.message)));
  $('#save').onclick = async () => {
    const raw = $('#ep').value.trim();
    const ep = raw === '' ? null : Number(raw);
    if (ep !== null && (!Number.isInteger(ep) || ep < 0)) { $('#err').textContent = 'เลขตอนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป'; $('#err').hidden = false; return; }
    const characters = $('#chars').value.split(',').map((x) => x.trim()).filter(Boolean);
    await db.putClips([{ ...c, arcId: $('#arc').value, episode: ep, characters, notes: $('#notes').value.trim(), updatedAt: Date.now() }]);
    toast('บันทึกป้ายแล้ว');
    location.hash = '#/library';
  };
  return () => { if (v && !native.isNative && src) URL.revokeObjectURL(src); };
}
