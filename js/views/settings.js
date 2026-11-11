import * as db from '../db.js';
import { buildBackup, validateBackup, applyImport } from '../lib/backup.js';
import { esc, showDialog, toast, formatBytes } from '../ui.js';

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function render(root, { data, refresh }) {
  const videos = data.episodes.filter((e) => e.hasVideo);
  root.innerHTML = `
    <h2>ตั้งค่าและสำรองข้อมูล</h2>
    <div class="card"><div class="title">สรุปข้อมูล</div>
      <p class="meta">${data.episodes.length} ตอน · ${data.scenes.length} ฉาก · ${videos.length} วิดีโอ (${formatBytes(videos.reduce((a, e) => a + (e.videoSize || 0), 0))})</p>
      <p class="meta" id="storage">กำลังตรวจพื้นที่เก็บข้อมูล…</p>
      <button class="btn small" id="persist">ขอให้เบราว์เซอร์ไม่ลบข้อมูลอัตโนมัติ</button></div>
    <div class="card"><div class="title">สำรองข้อมูล (JSON)</div>
      <p class="meta">รวมตอนและ Scene Index เท่านั้น ไม่รวมไฟล์วิดีโอ และไม่มีอะไรถูกอัปโหลดออกจากเครื่อง</p>
      <div class="row wrap"><button class="btn primary" id="export">ส่งออกไฟล์สำรอง</button>
      <label class="btn">นำเข้าไฟล์สำรอง<input type="file" id="import" accept="application/json,.json" hidden></label></div></div>
    <div class="card"><div class="title">เกี่ยวกับ</div>
      <p class="meta">Onepiece Vault v0.1 · ใช้งานออฟไลน์ ข้อมูลทั้งหมดอยู่ใน IndexedDB ของเครื่องนี้</p></div>`;

  navigator.storage?.estimate?.().then(({ usage = 0, quota = 0 }) => {
    root.querySelector('#storage').textContent = `ใช้พื้นที่ ${formatBytes(usage)} จากโควตา ${formatBytes(quota)}`;
  }).catch(() => {});
  root.querySelector('#persist').onclick = async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'เปิดการเก็บถาวรแล้ว' : 'เบราว์เซอร์ไม่อนุญาต (ลองติดตั้งแอปลงหน้าจอหลักก่อน)');
  };
  root.querySelector('#export').onclick = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`onepiece-vault-${stamp}.json`, JSON.stringify(buildBackup(data.episodes, data.scenes), null, 2));
    toast('ส่งออกไฟล์สำรองแล้ว');
  };
  root.querySelector('#import').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    try { incoming = validateBackup(await file.text()); } catch (ex) { toast(ex.message); return; }
    await showDialog({
      title: 'นำเข้าข้อมูลสำรอง',
      body: `<p>พบ ${incoming.episodes.length} ตอน, ${incoming.scenes.length} ฉาก</p>
        <label class="check"><input type="radio" name="mode" value="merge" checked> รวมกับข้อมูลเดิม (id ซ้ำใช้ของไฟล์)</label>
        <label class="check"><input type="radio" name="mode" value="replace"> แทนที่ข้อมูลทั้งหมด</label>`,
      submitLabel: 'นำเข้า',
      onSubmit: async (f) => {
        await db.writeAll(applyImport(data, incoming, f.get('mode')));
        toast('นำเข้าสำเร็จ'); refresh();
      },
    });
  };
}
