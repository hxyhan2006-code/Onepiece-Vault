import * as db from '../db.js';
import { esc, showDialog, toast, formatBytes } from '../ui.js';

export function episodeForm(existing, data) {
  return showDialog({
    title: existing ? 'แก้ไขตอน' : 'เพิ่มตอน',
    body: `<label>หมายเลขตอน<input name="number" type="number" min="0" inputmode="numeric" required value="${existing?.number ?? ''}"></label>
      <label>ชื่อตอน (ไม่บังคับ)<input name="title" maxlength="200" value="${esc(existing?.title ?? '')}"></label>`,
    onSubmit: async (f) => {
      const number = Number(f.get('number'));
      if (f.get('number') === '' || !Number.isInteger(number) || number < 0) throw new Error('กรุณาใส่หมายเลขตอนเป็นจำนวนเต็ม');
      if (data.episodes.some((e) => e.number === number && e.id !== existing?.id)) throw new Error(`มีตอน ${number} อยู่แล้ว`);
      await db.saveEpisode({ hasVideo: false, videoSize: 0, videoName: '', ...existing, id: existing?.id ?? db.newId(), number, title: String(f.get('title')).trim() });
    },
  });
}

export function render(root, { data, refresh }) {
  const eps = [...data.episodes].sort((a, b) => a.number - b.number);
  const count = (id) => data.scenes.filter((s) => s.episodeId === id).length;
  root.innerHTML = `
    <div class="row between"><h2>ตอนทั้งหมด (${eps.length})</h2><button class="btn primary" id="add">+ เพิ่มตอน</button></div>
    ${eps.length ? eps.map((e) => `<a class="card" href="#/episode/${esc(e.id)}">
        <div class="title">EP ${e.number}${e.title ? ' · ' + esc(e.title) : ''}</div>
        <div class="meta">${count(e.id)} ฉาก · ${e.hasVideo ? '🎞 ' + esc(e.videoName) + ' (' + formatBytes(e.videoSize) + ')' : 'ยังไม่นำเข้าวิดีโอ'}</div></a>`).join('')
      : '<div class="empty"><p>ยังไม่มีตอน กด “เพิ่มตอน” เพื่อเริ่มต้น</p></div>'}`;
  root.querySelector('#add').onclick = async () => { if (await episodeForm(null, data)) { toast('เพิ่มตอนแล้ว'); refresh(); } };
}
