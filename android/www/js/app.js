// router แบบ hash: #/library · #/clip/ID · #/dupes · #/plan · #/settings — โหลดข้อมูลสดจาก IndexedDB ทุกครั้งที่เปลี่ยนหน้า
import { isNative } from './native.js';
import * as db from './db.js';
import { DEFAULT_TAXONOMY, validateTaxonomy } from './lib/taxonomy.js';
import * as library from './views/library.js';
import * as clip from './views/clip.js';
import * as dupes from './views/dupes.js';
import * as plan from './views/plan.js';
import * as settings from './views/settings.js';

const routes = { library, clip, dupes, plan, settings };
const root = document.getElementById('view');
let cleanup;

document.getElementById('mode').textContent = isNative ? 'ในเครื่อง' : 'โหมดทดลองบนเบราว์เซอร์';

async function route() {
  const [name = 'library', arg] = (location.hash.replace(/^#\/?/, '') || 'library').split('?')[0].split('/');
  const view = routes[name] || library;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (name === 'clip' ? 'library' : name)));
  cleanup?.();
  cleanup = null;
  const tax = validateTaxonomy(await db.getMeta('taxonomy', DEFAULT_TAXONOMY));
  root.replaceChildren();
  window.scrollTo(0, 0);
  cleanup = await view.render(root, { tax, arg: arg ? decodeURIComponent(arg) : '' });
}

addEventListener('hashchange', route);
route();
