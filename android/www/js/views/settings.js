import * as db from '../db.js';
import * as native from '../native.js';
import { buildBackup, validateBackup, mergeBackup } from '../lib/backup.js';
import { esc, toast, confirmDialog, formatBytes } from '../ui.js';

export async function render(root, { tax }) {
  const clips = await db.allClips();
  const filter = await db.getMeta('scanFilter', 'Screenrecorder');
  const tagged = clips.filter((c) => c.arcId).length;
  const total = clips.reduce((n, c) => n + (c.size || 0), 0);
  root.innerHTML = `<h2>ตั้งค่า</h2>
    <p class="meta">คลัง ${clips.length} คลิป (${formatBytes(total)}) · ติดป้ายแล้ว ${tagged} · ไม่มีการอัปโหลดวิดีโอหรือข้อมูลออกจากเครื่อง ไม่มีการเรียก AI</p>
    <h3>ตัวกรองชื่อไฟล์ตอนสแกน</h3>
    <p class="meta">สแกนเฉพาะไฟล์ที่ชื่อมีคำนี้ (ไม่สนตัวพิมพ์ ขีด ช่องว่าง) · เว้นว่าง = ทุกวิดีโอในเครื่อง</p>
    <div class="row"><input id="filter" value="${esc(filter)}"><button class="btn" id="saveFilter">บันทึก</button></div>
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
