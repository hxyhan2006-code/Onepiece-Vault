import * as db from '../db.js';
import { formatTimecode, parseTimecode } from '../lib/timecode.js';
import { esc, showDialog, confirmDialog, toast, formatBytes } from '../ui.js';
import { episodeForm } from './episodes.js';

const listToText = (a) => (a || []).join(', ');
const textToList = (s) => String(s || '').split(/[,\n،]/).map((x) => x.trim()).filter(Boolean);

function sceneForm(ep, existing, getTime) {
  return showDialog({
    title: existing ? 'แก้ไข Scene' : 'เพิ่ม Scene',
    body: `<label>ชื่อฉาก<input name="title" maxlength="200" value="${esc(existing?.title ?? '')}"></label>
      <div class="grid2">
        <label>เริ่ม (ชม:นาที:วินาที)<input name="start" inputmode="numeric" placeholder="12:30" required value="${existing ? formatTimecode(existing.start) : ''}"></label>
        <label>จบ (ไม่บังคับ)<input name="end" inputmode="numeric" placeholder="13:10" value="${existing?.end != null ? formatTimecode(existing.end) : ''}"></label>
      </div>
      ${getTime ? `<div class="row"><button type="button" class="btn small" data-now="start">ใช้เวลาวิดีโอเป็นจุดเริ่ม</button>
        <button type="button" class="btn small" data-now="end">…เป็นจุดจบ</button></div>` : ''}
      <label>ตัวละคร (คั่นด้วย ,)<input name="characters" value="${esc(listToText(existing?.characters))}"></label>
      <label>เหตุการณ์ (คั่นด้วย ,)<input name="events" value="${esc(listToText(existing?.events))}"></label>
      <label>บันทึกเพิ่มเติม<textarea name="notes" rows="3">${esc(existing?.notes ?? '')}</textarea></label>`,
    extra: (dlg) => dlg.querySelectorAll('[data-now]').forEach((b) => {
      b.onclick = () => { dlg.querySelector(`[name=${b.dataset.now}]`).value = formatTimecode(getTime()); };
    }),
    onSubmit: async (f) => {
      const start = parseTimecode(f.get('start'));
      if (start === null) throw new Error('เวลาเริ่มไม่ถูกต้อง (ตัวอย่าง 12:30 หรือ 1:02:03)');
      const endRaw = String(f.get('end')).trim();
      const end = endRaw ? parseTimecode(endRaw) : null;
      if (endRaw && end === null) throw new Error('เวลาจบไม่ถูกต้อง');
      if (end !== null && end < start) throw new Error('เวลาจบต้องไม่น้อยกว่าเวลาเริ่ม');
      await db.saveScene({
        id: existing?.id ?? db.newId(), episodeId: ep.id, start, end,
        title: String(f.get('title')).trim(), characters: textToList(f.get('characters')),
        events: textToList(f.get('events')), notes: String(f.get('notes')).trim(), updatedAt: Date.now(),
      });
    },
  });
}

export function render(root, { data, params, refresh, nav }) {
  const ep = data.episodes.find((e) => e.id === params.id);
  if (!ep) { root.innerHTML = '<div class="empty"><p>ไม่พบตอนนี้</p><a class="btn" href="#/episodes">กลับ</a></div>'; return; }
  const scenes = data.scenes.filter((s) => s.episodeId === ep.id).sort((a, b) => a.start - b.start);
  const seekTo = params.t != null ? Number(params.t) : null;

  root.innerHTML = `
    <div class="row between"><a class="back" href="#/episodes">‹ ตอนทั้งหมด</a>
      <span><button class="btn small" id="editEp">แก้ไขตอน</button> <button class="btn small ghost" id="delEp">ลบตอน</button></span></div>
    <h2>EP ${ep.number}${ep.title ? ' · ' + esc(ep.title) : ''}</h2>
    <div id="player" class="player">${ep.hasVideo ? '<p class="meta">กำลังโหลดวิดีโอ…</p>' : ''}</div>
    <div class="row wrap">
      <label class="btn">${ep.hasVideo ? 'เปลี่ยนวิดีโอ' : 'นำเข้าวิดีโอจากเครื่อง'}
        <input type="file" id="file" accept="video/*" hidden></label>
      ${ep.hasVideo ? '<button class="btn ghost" id="rmVideo">ลบวิดีโอ</button>' : ''}
    </div>
    ${ep.hasVideo ? `<p class="meta">${esc(ep.videoName)} · ${formatBytes(ep.videoSize)} · เก็บในเครื่องนี้เท่านั้น</p>` : ''}
    <div class="row between"><h3>Scene Index (${scenes.length})</h3><button class="btn primary" id="addScene">+ เพิ่ม Scene</button></div>
    <div id="scenes">${scenes.length ? scenes.map((s) => `
      <div class="card" data-id="${esc(s.id)}">
        <div class="row between"><button class="time" data-seek="${s.start}">▶ ${formatTimecode(s.start)}${s.end != null ? '–' + formatTimecode(s.end) : ''}</button>
          <span><button class="btn small" data-edit="${esc(s.id)}">แก้ไข</button> <button class="btn small ghost" data-del="${esc(s.id)}">ลบ</button></span></div>
        <div class="title">${esc(s.title || '(ไม่มีชื่อฉาก)')}</div>
        <div class="chips">${s.characters.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}${s.events.map((c) => `<span class="chip event">${esc(c)}</span>`).join('')}</div>
        ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}</div>`).join('')
      : '<div class="empty"><p>ยังไม่มี Scene ในตอนนี้</p></div>'}</div>`;

  let url = null;
  let video = null;
  const getTime = () => video?.currentTime ?? 0;
  const seek = (t) => { if (video) { video.currentTime = t; video.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };

  if (ep.hasVideo) {
    db.getVideo(ep.id).then((rec) => {
      const box = root.querySelector('#player');
      if (!rec || !box.isConnected) { if (box.isConnected) box.innerHTML = '<p class="meta">ไม่พบไฟล์วิดีโอ</p>'; return; }
      url = URL.createObjectURL(rec.blob);
      box.innerHTML = '<video controls playsinline preload="metadata"></video>';
      video = box.querySelector('video');
      video.src = url;
      if (seekTo !== null) video.addEventListener('loadedmetadata', () => { video.currentTime = seekTo; }, { once: true });
    }).catch(() => toast('โหลดวิดีโอไม่สำเร็จ'));
  }

  const after = (ok, msg) => { if (ok) { toast(msg); refresh(); } };
  root.querySelector('#editEp').onclick = async () => after(await episodeForm(ep, data), 'บันทึกแล้ว');
  root.querySelector('#addScene').onclick = async () => after(await sceneForm(ep, null, ep.hasVideo ? getTime : null), 'เพิ่ม Scene แล้ว');
  root.querySelector('#file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast('กรุณาเลือกไฟล์วิดีโอ'); return; }
    try { await db.attachVideo(ep, file); toast('นำเข้าวิดีโอแล้ว'); refresh(); }
    catch { toast('นำเข้าไม่สำเร็จ (พื้นที่เก็บข้อมูลอาจไม่พอ)'); }
  };
  root.querySelector('#rmVideo')?.addEventListener('click', async () => {
    if (await confirmDialog('ลบวิดีโอของตอนนี้ออกจากเครื่อง? (Scene Index ยังอยู่)', 'ลบวิดีโอ')) { await db.detachVideo(ep); refresh(); }
  });
  root.querySelector('#scenes').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.seek) { if (video) seek(Number(t.dataset.seek)); else toast('ยังไม่ได้นำเข้าวิดีโอ'); }
    if (t.dataset.edit) after(await sceneForm(ep, scenes.find((s) => s.id === t.dataset.edit), ep.hasVideo ? getTime : null), 'บันทึกแล้ว');
    if (t.dataset.del && await confirmDialog('ลบ Scene นี้?', 'ลบ')) { await db.deleteScene(t.dataset.del); toast('ลบแล้ว'); refresh(); }
  });
  root.querySelector('#delEp').onclick = async () => { if (await removeEpisode(ep)) { toast('ลบตอนแล้ว'); nav('/episodes'); } };
  return () => { if (url) URL.revokeObjectURL(url); };
}

// ลบตอน: ใช้จากหน้า episode ผ่านปุ่มแก้ไข? แยกเป็นฟังก์ชันให้หน้าตั้งค่า/รายการเรียกได้
export async function removeEpisode(ep) {
  return confirmDialog(`ลบ EP ${ep.number} พร้อม Scene และวิดีโอทั้งหมด?`, 'ลบตอน').then(async (ok) => { if (ok) await db.deleteEpisode(ep.id); return ok; });
}
