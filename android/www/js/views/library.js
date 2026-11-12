import * as db from '../db.js';
import { runScan, buildThumbs, summarize } from '../scan.js';
import { isNative } from '../native.js';
import { searchClips, topCharacters } from '../lib/search.js';
import { findArc } from '../lib/taxonomy.js';
import { esc, icon, arcOptions, toast, formatDuration } from '../ui.js';

const PAGE = 60;
const state = { text: '', tagged: 'all', status: 'present', arcId: '', limit: PAGE };

export async function render(root, { tax }) {
  const urls = [];
  let alive = true; // ออกจากหน้านี้แล้ว = ไม่แตะหน้าจอ (สแกนยังทำต่อจนเสร็จ)
  let clips = await db.allClips();
  const chars = topCharacters(clips);
  root.innerHTML = `
    <div class="row"><input id="q" type="search" placeholder="ค้นหา ชื่อไฟล์ ตัวละคร ep12 บันทึก" value="${esc(state.text)}">
      <button class="btn primary" id="scan">${icon('scan')}สแกน</button></div>
    <input id="pick" type="file" accept="video/*" multiple hidden>
    <div class="bar" id="bar" hidden><i></i></div><p class="meta" id="msg"></p>
    <div class="row wrap">
      <select id="tagged" style="flex:1"><option value="all">ทุกคลิป</option><option value="no">ยังไม่ติดป้าย</option><option value="yes">ติดป้ายแล้ว</option></select>
      <select id="status" style="flex:1"><option value="present">ไฟล์ปกติ</option><option value="missing">ไฟล์หาย</option><option value="all">ทั้งหมด</option></select>
    </div>
    <select id="arc">${arcOptions(tax, state.arcId, 'ทุก Arc')}</select>
    ${chars.length ? `<div class="chips row" id="chars">${chars.map((c) => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <p class="meta" id="count"></p><div class="grid" id="grid"></div><div class="row"><button class="btn ghost" id="more" hidden>แสดงเพิ่ม</button></div>`;
  const $ = (s) => root.querySelector(s);
  $('#tagged').value = state.tagged; $('#status').value = state.status;

  async function draw() {
    if (!alive) return;
    urls.splice(0).forEach(URL.revokeObjectURL);
    const found = searchClips(clips, tax, state);
    const shown = found.slice(0, state.limit);
    $('#count').textContent = clips.length ? `${found.length} คลิป` : '';
    $('#more').hidden = found.length <= shown.length;
    if (!clips.length) {
      $('#grid').innerHTML = `<div class="empty" style="grid-column:1/-1">ยังไม่มีคลิปในคลัง<br>กด "สแกน" เพื่อเริ่ม${isNative ? '' : ' (โหมดทดลอง: เลือกไฟล์วิดีโอเอง)'}</div>`;
      return;
    }
    const thumbs = await Promise.all(shown.map((c) => db.getThumb(c.id)));
    if (!alive) return;
    $('#grid').innerHTML = shown.map((c, i) => {
      const u = thumbs[i] ? URL.createObjectURL(thumbs[i]) : '';
      if (u) urls.push(u);
      const a = findArc(tax, c.arcId);
      const label = a ? `${a.arc.name}${c.episode != null ? ` · ตอน ${c.episode}` : ''}` : 'ยังไม่ติดป้าย';
      return `<a class="tile" href="#/clip/${encodeURIComponent(c.id)}"><div class="thumb">${u ? `<img src="${u}" alt="">` : 'ไม่มีภาพ'}${c.durationMs ? `<span class="dur">${formatDuration(c.durationMs)}</span>` : ''}</div>
        <div class="info"><div class="nm">${esc(c.name)}</div><div class="tag ${a ? '' : 'off'}">${esc(label)}</div>${c.status === 'missing' ? '<div class="tag warn">ไฟล์หาย</div>' : ''}${c.copies?.length ? '<div class="tag warn">มีไฟล์ซ้ำ</div>' : ''}</div></a>`;
    }).join('');
  }
  const redraw = () => { state.limit = PAGE; return draw(); };
  let t;
  $('#q').addEventListener('input', (e) => { state.text = e.target.value; clearTimeout(t); t = setTimeout(redraw, 150); });
  $('#tagged').onchange = (e) => { state.tagged = e.target.value; redraw(); };
  $('#status').onchange = (e) => { state.status = e.target.value; redraw(); };
  $('#arc').onchange = (e) => { state.arcId = e.target.value; redraw(); };
  $('#more').onclick = () => { state.limit += PAGE; draw(); };
  root.querySelectorAll('#chars .chip').forEach((b) => { b.onclick = () => { $('#q').value = state.text = b.dataset.c; redraw(); }; });

  let busy = false;
  async function scan(picked) {
    if (busy) return;
    busy = true;
    const bar = $('#bar'); bar.hidden = false;
    const prog = (p) => { if (!alive) return; bar.firstElementChild.style.width = `${Math.round((p.done / Math.max(1, p.total)) * 100)}%`; $('#msg').textContent = `${p.phase === 'scan' ? 'อ่านลายนิ้วมือไฟล์' : 'สร้างภาพตัวอย่าง'} ${p.done}/${p.total}`; };
    try {
      const r = await runScan({ picked, onProgress: prog });
      if (alive) $('#msg').textContent = summarize(r);
      await buildThumbs(prog);
      toast(`สแกนเสร็จแล้ว: ${summarize(r)}`);
      if (alive) { $('#msg').textContent = summarize(r); clips = await db.allClips(); await redraw(); }
    } catch (e) { if (alive) $('#msg').textContent = ''; toast(e.message || 'สแกนไม่สำเร็จ'); }
    if (alive) bar.hidden = true;
    busy = false;
  }
  $('#pick').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) scan(f); };
  $('#scan').onclick = () => (isNative ? scan() : $('#pick').click());
  await draw();
  return () => { alive = false; clearTimeout(t); urls.splice(0).forEach(URL.revokeObjectURL); };
}
