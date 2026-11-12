import * as db from '../db.js';
import { startScan, stopScan, getScanState, subscribeScan, describeScan } from '../scan.js';
import { isNative } from '../native.js';
import { searchClips, topCharacters } from '../lib/search.js';
import { findArc } from '../lib/taxonomy.js';
import { scopeClips, libraryCounts } from '../lib/folders.js';
import { esc, icon, arcOptions, formatDuration } from '../ui.js';

const PAGE = 60;
const state = { text: '', tagged: 'all', status: 'present', arcId: '', limit: PAGE };
const n = (x) => Number(x).toLocaleString('th-TH');

export async function render(root, { tax, scope }) {
  const urls = [];
  let alive = true; // ออกจากหน้านี้แล้ว = ไม่แตะหน้าจอ (สแกนยังทำต่อจนเสร็จ)
  let clips = await db.allClips();
  const chars = topCharacters(scopeClips(clips, scope));
  root.innerHTML = `
    <div class="row"><input id="q" type="search" placeholder="ค้นหา ชื่อไฟล์ ตัวละคร ep12 บันทึก" value="${esc(state.text)}">
      <button class="btn primary" id="scan">${icon('scan')}สแกน</button></div>
    <input id="pick" type="file" accept="video/*" multiple hidden><input id="pickDir" type="file" webkitdirectory hidden>
    ${isNative ? '' : '<div class="row"><button class="btn small ghost" id="scanFiles">สแกนจากไฟล์ที่เลือกเอง</button></div>'}
    <div class="row" id="scanRow" hidden><div class="bar" style="flex:1"><i></i></div><button class="btn small danger" id="stop">หยุด</button></div>
    <p class="meta" id="msg"></p>
    <p class="meta" id="folder"></p><p class="meta" id="counts"></p>
    <div class="row wrap">
      <select id="tagged" style="flex:1"><option value="all">ทุกคลิป</option><option value="no">ยังไม่ติดป้าย</option><option value="yes">ติดป้ายแล้ว</option></select>
      <select id="status" style="flex:1"><option value="present">ไฟล์ปกติ</option><option value="missing">ไฟล์หาย</option><option value="all">ทั้งหมด</option></select>
    </div>
    <select id="arc">${arcOptions(tax, state.arcId, 'ทุก Arc')}</select>
    ${chars.length ? `<div class="chips row" id="chars">${chars.map((c) => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <p class="meta" id="count"></p><div class="grid" id="grid"></div><div class="row"><button class="btn ghost" id="more" hidden>แสดงเพิ่ม</button></div>`;
  const $ = (s) => root.querySelector(s);
  $('#tagged').value = state.tagged; $('#status').value = state.status;

  function head() {
    const c = libraryCounts(clips, scope);
    $('#folder').textContent = scope ? `โฟลเดอร์ที่แสดง: ${scope} (รวมโฟลเดอร์ย่อย)` : 'โฟลเดอร์ที่แสดง: ทุกโฟลเดอร์';
    $('#counts').textContent = clips.length
      ? `${n(c.clips)} คลิป + ไฟล์ซ้ำ ${n(c.copies)} = ${n(c.files)} ไฟล์${c.missing ? ` · ไฟล์หาย ${n(c.missing)}` : ''}${c.hidden ? ` · ซ่อนอยู่นอกโฟลเดอร์ ${n(c.hidden)} คลิป (ไม่ได้ลบ ป้ายยังอยู่)` : ''}` : '';
  }

  async function draw() {
    if (!alive) return;
    urls.splice(0).forEach(URL.revokeObjectURL);
    head();
    const found = searchClips(scopeClips(clips, scope), tax, state);
    const shown = found.slice(0, state.limit);
    $('#count').textContent = clips.length ? `แสดง ${n(found.length)} คลิป` : '';
    $('#more').hidden = found.length <= shown.length;
    if (!shown.length) {
      $('#grid').innerHTML = `<div class="empty" style="grid-column:1/-1">${clips.length ? 'ไม่มีคลิปตรงกับตัวกรองในโฟลเดอร์นี้' : `ยังไม่มีคลิปในคลัง<br>กด "สแกน" เพื่อเริ่ม${isNative ? '' : ' (โหมดทดลอง: เลือกโฟลเดอร์หรือไฟล์วิดีโอเอง)'}`}</div>`;
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

  // ---- สถานะสแกน (ใช้ตัวกลางของแอป: กดซ้ำไม่เริ่มรอบที่สอง · กลับมาหน้านี้ยังเห็นความคืบหน้า) ----
  const PHASE = { list: 'อ่านรายการวิดีโอ', fingerprint: 'อ่านลายนิ้วมือไฟล์', thumb: 'สร้างภาพตัวอย่าง' };
  let wasRunning = false;
  async function onScan(st) {
    if (!alive) return;
    $('#scanRow').hidden = !st.running;
    $('#scan').disabled = st.running;
    if (st.running) {
      $('.bar > i').style.width = `${Math.round((st.done / Math.max(1, st.total)) * 100)}%`;
      $('#msg').textContent = `${PHASE[st.phase] || ''} ${st.total ? `${n(st.done)}/${n(st.total)}` : ''}`;
    } else if (wasRunning || st.result || st.error) {
      $('#msg').textContent = describeScan(st) + (st.thumbs?.failed ? ` · ภาพตัวอย่างทำไม่ได้ ${n(st.thumbs.failed)}` : '');
    }
    if (wasRunning && !st.running) { clips = await db.allClips(); await redraw(); }
    wasRunning = st.running;
  }
  const unsub = subscribeScan(onScan);
  wasRunning = getScanState().running;
  onScan(getScanState());
  const begin = (picked) => { startScan(picked); };
  $('#stop').onclick = stopScan;
  const pickWith = (sel) => { const el = $(sel); el.onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) begin(f); }; };
  pickWith('#pick'); pickWith('#pickDir');
  $('#scan').onclick = () => (isNative ? begin() : $('#pickDir').click());
  $('#scanFiles')?.addEventListener('click', () => $('#pick').click());
  await draw();
  return () => { alive = false; clearTimeout(t); unsub(); urls.splice(0).forEach(URL.revokeObjectURL); };
}
