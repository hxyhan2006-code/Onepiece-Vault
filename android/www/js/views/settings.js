import * as db from '../db.js';
import * as native from '../native.js';
import { buildBackup, validateBackup, mergeBackup } from '../lib/backup.js';
import { DEFAULT_SCOPE, normScope, folderTree, libraryCounts } from '../lib/folders.js';
import { esc, toast, confirmDialog, formatBytes } from '../ui.js';

const n = (x) => Number(x).toLocaleString('th-TH');

/** กล่องเลือกโฟลเดอร์จากรายการในเครื่อง (แสดงจำนวนไฟล์ รวมโฟลเดอร์ย่อย) */
async function pickFolder(current, clips) {
  let paths;
  if (native.isNative) {
    if (!(await native.ensureAccess())) throw new Error('ยังไม่ได้รับสิทธิ์อ่านวิดีโอ');
    paths = (await native.listVideos()).filter((x) => x.size > 0).map((x) => x.path);
  } else paths = clips.map((c) => c.path);
  const tree = folderTree(paths);
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<h2>เลือกโฟลเดอร์ที่จะสแกน</h2><p class="meta">เลือกแล้วจะรวมโฟลเดอร์ย่อยทั้งหมด · ตัวเลข = จำนวนวิดีโอรวมโฟลเดอร์ย่อย</p>
      <input id="ff" type="search" placeholder="พิมพ์ค้นหาโฟลเดอร์" aria-label="ค้นหาโฟลเดอร์">
      <div id="fl" style="max-height:50vh;overflow:auto;margin-top:8px"></div>
      <div class="sheet-actions"><button class="btn ghost" data-no>ปิด</button></div>`;
    document.body.append(dlg);
    const list = dlg.querySelector('#fl');
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    const draw = () => {
      const q = dlg.querySelector('#ff').value.trim().toLowerCase();
      const rows = tree.filter((e) => !q || e.dir.toLowerCase().includes(q)).slice(0, 300);
      list.innerHTML = rows.length ? rows.map((e) => `<button class="folder-row${normScope(current).toLowerCase() === e.dir.toLowerCase() ? ' on' : ''}" data-dir="${esc(e.dir)}" style="padding-left:${12 + Math.min(e.depth, 6) * 12}px" title="${esc(e.dir)}"><span>${esc(e.dir.split('/').pop())}</span><span class="cnt">${n(e.total)}</span></button>`).join('') : '<div class="empty">ไม่พบโฟลเดอร์</div>';
    };
    list.onclick = (ev) => { const b = ev.target.closest('[data-dir]'); if (b) close(b.dataset.dir); };
    dlg.querySelector('#ff').oninput = draw;
    dlg.querySelector('[data-no]').onclick = () => close(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    draw();
    dlg.showModal();
  });
}

export async function render(root, { tax, scope }) {
  const clips = await db.allClips();
  const filter = await db.getMeta('scanFilter', '');
  const counts = libraryCounts(clips, scope);
  const tagged = clips.filter((c) => c.arcId).length;
  const total = clips.reduce((sum, c) => sum + (c.size || 0), 0);
  root.innerHTML = `<h2>ตั้งค่า</h2>
    <p class="meta">ฐานข้อมูลในแอป ${n(clips.length)} คลิป (${formatBytes(total)}) · ติดป้ายแล้ว ${n(tagged)} · ไม่มีการอัปโหลดวิดีโอหรือข้อมูลออกจากเครื่อง ไม่มีการเรียก AI</p>
    <p class="meta">ที่แสดงตอนนี้: ${n(counts.clips)} คลิป + ไฟล์ซ้ำ ${n(counts.copies)} = ${n(counts.files)} ไฟล์${counts.hidden ? ` · ซ่อนอยู่นอกโฟลเดอร์ ${n(counts.hidden)} คลิป` : ''}</p>
    <h3>1. โฟลเดอร์ที่สแกน</h3>
    <p class="meta">สแกนและแสดงเฉพาะวิดีโอในโฟลเดอร์นี้ รวมโฟลเดอร์ย่อยทั้งหมด · เว้นว่าง = ทุกโฟลเดอร์ · เปลี่ยนโฟลเดอร์แค่เปลี่ยนสิ่งที่แสดงและสแกน ไม่ลบคลิปหรือป้ายเดิม (คลิปนอกโฟลเดอร์ถูกซ่อนไว้ กลับมาแสดงเมื่อเลือกโฟลเดอร์นั้นอีก)</p>
    <label for="scope">โฟลเดอร์ (เช่น ${esc(DEFAULT_SCOPE)})</label>
    <input id="scope" value="${esc(scope)}" autocomplete="off" autocapitalize="off">
    <div class="row wrap"><button class="btn" id="pickFolder">เลือกจากรายการ</button><button class="btn primary" id="saveScope">บันทึกโฟลเดอร์</button><button class="btn ghost" id="allScope">ทุกโฟลเดอร์</button></div>
    <h3>2. ตัวกรองชื่อไฟล์ (แยกจากโฟลเดอร์)</h3>
    <p class="meta">ใช้ร่วมกับโฟลเดอร์ตอนสแกน: เอาเฉพาะไฟล์ในโฟลเดอร์ข้างบนที่ชื่อมีคำนี้ (ไม่สนตัวพิมพ์ ขีด ช่องว่าง) · เว้นว่าง = ทุกไฟล์ในโฟลเดอร์</p>
    <div class="row"><input id="filter" value="${esc(filter)}" placeholder="เช่น Screenrecorder" autocomplete="off"><button class="btn" id="saveFilter">บันทึก</button></div>
    <h3>สำรองป้ายกำกับ</h3>
    <p class="meta">ไฟล์สำรองไม่รวมวิดีโอ · กู้คืนแล้วสแกนอีกครั้ง แอปจะจับคู่กับไฟล์จริงจากเนื้อหาไฟล์ ถึงชื่อเปลี่ยนไปแล้วก็ตาม</p>
    <div class="row wrap"><button class="btn" id="export">ส่งออกสำรอง</button><button class="btn ghost" id="import">นำเข้า (รวมกับของเดิม)</button></div>
    <input id="file" type="file" accept="application/json,.json" hidden><p class="form-error" id="err" hidden></p>
    <h3>รายการ Saga / Arc</h3>
    <p class="meta">${tax.sagas.map((s) => `${esc(s.name)} (${s.arcs.length})`).join(' · ')}</p>
    <h3>ล้างรายการในแอป</h3>
    <p class="meta">ล้างเฉพาะรายการ ป้าย และภาพตัวอย่างในแอป ไม่แตะวิดีโอ (ควรส่งออกสำรองก่อน)</p>
    <button class="btn danger" id="clear">ล้างรายการในแอป</button>`;
  const $ = (q) => root.querySelector(q);
  const err = (m) => { $('#err').textContent = m || ''; $('#err').hidden = !m; };
  const setScope = async (v) => { await db.setMeta('scanFolder', normScope(v)); toast(normScope(v) ? 'บันทึกโฟลเดอร์แล้ว กดสแกนที่หน้าคลัง' : 'ตั้งเป็นทุกโฟลเดอร์แล้ว'); dispatchEvent(new HashChangeEvent('hashchange')); };
  $('#saveScope').onclick = () => setScope($('#scope').value);
  $('#allScope').onclick = () => setScope('');
  $('#pickFolder').onclick = async () => {
    try { const d = await pickFolder($('#scope').value, clips); if (d !== null) await setScope(d); } catch (e) { err(e.message); }
  };
  $('#saveFilter').onclick = async () => { await db.setMeta('scanFilter', $('#filter').value.trim()); toast('บันทึกตัวกรองแล้ว'); };
  $('#export').onclick = async () => {
    try { await native.shareText(`onepiece-vault-android-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(buildBackup(clips), null, 1)); }
    catch (e) { toast(e.message || 'ส่งออกไม่สำเร็จ'); }
  };
  $('#import').onclick = () => $('#file').click();
  $('#file').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const incoming = validateBackup(await f.text());
      const preview = mergeBackup(await db.allClips(), incoming);
      if (!(await confirmDialog(`นำเข้า ${incoming.length} คลิป (เพิ่มใหม่ ${preview.added} · อัปเดตป้าย ${preview.updated}) รวมกับของเดิม?`))) return;
      const cur = await db.allClips(); // อ่านสดอีกครั้งหลังกดยืนยัน
      const m = mergeBackup(cur, incoming);
      const old = new Set(cur);
      await db.putClips(m.clips.filter((c) => !old.has(c))); err(''); toast('นำเข้าแล้ว'); dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (ex) { err(ex.message); }
  };
  $('#clear').onclick = async () => {
    if (!(await confirmDialog('ล้างรายการคลิป ป้ายกำกับ และภาพตัวอย่างทั้งหมดในแอป? (วิดีโอในเครื่องไม่ถูกลบ)', 'ล้างรายการ'))) return;
    await db.clearIndex(); toast('ล้างรายการแล้ว'); dispatchEvent(new HashChangeEvent('hashchange'));
  };
}
