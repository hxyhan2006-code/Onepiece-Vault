import { searchScenes, topValues } from '../lib/search.js';
import { formatTimecode } from '../lib/timecode.js';
import { esc } from '../ui.js';

const saved = { text: '', episodeId: '', character: '' }; // จำค่าค้นหาเมื่อสลับหน้า

export function sceneCard(sc, ep) {
  const range = sc.end != null ? `${formatTimecode(sc.start)}–${formatTimecode(sc.end)}` : formatTimecode(sc.start);
  const chips = [...sc.characters.map((c) => `<span class="chip">${esc(c)}</span>`),
    ...sc.events.map((c) => `<span class="chip event">${esc(c)}</span>`)].join('');
  return `<a class="card scene-link" href="#/episode/${esc(sc.episodeId)}?t=${sc.start}">
    <div class="meta">EP ${ep?.number ?? '?'} · ${range}</div>
    <div class="title">${esc(sc.title || '(ไม่มีชื่อฉาก)')}</div>
    ${chips ? `<div class="chips">${chips}</div>` : ''}</a>`;
}

export function render(root, { data }) {
  const { episodes, scenes } = data;
  const chars = topValues(scenes, 'characters');
  const eps = [...episodes].sort((a, b) => a.number - b.number);
  root.innerHTML = `
    <div class="searchbar">
      <input id="q" type="search" placeholder="ค้นหา: ตัวละคร เหตุการณ์ ep12 หรือเวลา 12:30" value="${esc(saved.text)}" autocomplete="off">
      <select id="ep" aria-label="กรองตามตอน"><option value="">ทุกตอน</option>
        ${eps.map((e) => `<option value="${esc(e.id)}" ${e.id === saved.episodeId ? 'selected' : ''}>EP ${e.number}${e.title ? ' ' + esc(e.title) : ''}</option>`).join('')}
      </select>
    </div>
    ${chars.length ? `<div class="chips filter" id="chars">${chars.map((c) =>
      `<button type="button" class="chip ${c === saved.character ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <div id="results"></div>`;

  const out = root.querySelector('#results');
  const draw = () => {
    const list = searchScenes(scenes, episodes, saved);
    const byId = new Map(episodes.map((e) => [e.id, e]));
    if (!scenes.length) {
      out.innerHTML = `<div class="empty"><p>ยังไม่มีข้อมูล Scene</p><a class="btn primary" href="#/episodes">เริ่มจากเพิ่มตอน</a></div>`;
    } else if (!list.length) {
      out.innerHTML = `<div class="empty"><p>ไม่พบ Scene ที่ตรงกับคำค้น</p></div>`;
    } else {
      out.innerHTML = `<p class="count">พบ ${list.length} ฉาก</p>${list.map((s) => sceneCard(s, byId.get(s.episodeId))).join('')}`;
    }
  };
  root.querySelector('#q').addEventListener('input', (e) => { saved.text = e.target.value; draw(); });
  root.querySelector('#ep').addEventListener('change', (e) => { saved.episodeId = e.target.value; draw(); });
  root.querySelector('#chars')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    saved.character = saved.character === b.dataset.c ? '' : b.dataset.c;
    root.querySelectorAll('#chars .chip').forEach((x) => x.classList.toggle('on', x.dataset.c === saved.character));
    draw();
  });
  draw();
}
