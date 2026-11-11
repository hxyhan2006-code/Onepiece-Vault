import * as db from './db.js';
import * as search from './views/search.js';
import * as episodes from './views/episodes.js';
import * as episode from './views/episode.js';
import * as settings from './views/settings.js';
import { toast } from './ui.js';

const root = document.getElementById('view');
let data = { episodes: [], scenes: [] };
let cleanup = null;

function parseHash() {
  const [path, query = ''] = (location.hash.slice(1) || '/search').split('?');
  const [, name = 'search', id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  if (id) params.id = decodeURIComponent(id);
  return { name, params };
}

const nav = (path) => { location.hash = path; };

async function render() {
  cleanup?.();
  cleanup = null;
  data = await db.loadAll(); // โหลดสดทุกครั้ง กันข้อมูลค้างหลังแก้/ลบ
  const { name, params } = parseHash();
  const view = { search, episodes, episode, settings }[name] || search;
  const tab = name === 'episode' ? 'episodes' : name;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  cleanup = view.render(root, { data, params, nav, refresh }) || null;
}

async function refresh() {
  const y = window.scrollY;
  await render();
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', render);

try {
  await render();
} catch (e) {
  root.innerHTML = '<div class="empty"><p>เปิดฐานข้อมูลในเครื่องไม่ได้ (อาจอยู่ในโหมดส่วนตัว)</p></div>';
  console.error(e);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => toast('เปิดโหมดออฟไลน์ไม่สำเร็จ'));
}
