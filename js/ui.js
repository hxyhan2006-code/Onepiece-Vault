// ตัวช่วย UI: escape HTML, toast, dialog
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** ไอคอน SVG จาก sprite ใน index.html (ห้ามใช้อีโมจิ) */
export const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** เปิด dialog ฟอร์ม; onSubmit(formData) คืน false เพื่อไม่ปิด */
export function showDialog({ title, body, submitLabel = 'บันทึก', danger = false, onSubmit, extra }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<form method="dialog" novalidate>
      <h2>${esc(title)}</h2>
      <div class="sheet-body">${body}</div>
      <p class="form-error" role="alert" hidden></p>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-cancel>ยกเลิก</button>
        <button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submitLabel)}</button>
      </div></form>`;
    document.body.append(dlg);
    const form = dlg.querySelector('form');
    const err = dlg.querySelector('.form-error');
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('[data-cancel]').onclick = () => close(false);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await onSubmit?.(new FormData(form));
        if (res === false) return;
        close(true);
      } catch (ex) { err.textContent = ex.message || String(ex); err.hidden = false; }
    });
    extra?.(dlg);
    dlg.showModal();
    dlg.querySelector('input,textarea,select')?.focus();
  });
}

export const confirmDialog = (message, label = 'ยืนยัน') =>
  showDialog({ title: 'ยืนยันการทำรายการ', body: `<p>${esc(message)}</p>`, submitLabel: label, danger: true });
