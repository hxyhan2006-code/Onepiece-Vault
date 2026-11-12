export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}
export function formatDuration(ms) {
  const s = Math.round((ms || 0) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

let timer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(timer); timer = setTimeout(() => el.classList.remove('show'), 3000);
}

/** กล่องยืนยันของแอป (ห้ามใช้ confirm ของเบราว์เซอร์) */
export function confirmDialog(message, label = 'ยืนยัน') {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<h2>ยืนยันการทำรายการ</h2><p>${esc(message)}</p>
      <div class="sheet-actions"><button class="btn ghost" data-no>ยกเลิก</button><button class="btn danger" data-yes>${esc(label)}</button></div>`;
    document.body.append(dlg);
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('[data-no]').onclick = () => close(false);
    dlg.querySelector('[data-yes]').onclick = () => close(true);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    dlg.showModal();
  });
}

/** ตัวเลือก Arc จัดกลุ่มตาม Saga */
export function arcOptions(tax, selected = '', blank = 'ยังไม่ระบุ') {
  return `<option value="">${esc(blank)}</option>` + tax.sagas.map((s) =>
    `<optgroup label="${esc(s.name)}">${s.arcs.map((a) => `<option value="${esc(a.id)}"${a.id === selected ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>`).join('');
}
