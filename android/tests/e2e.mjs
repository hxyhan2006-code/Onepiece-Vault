// ทดสอบ end-to-end ของแอป APK ในโหมดเบราว์เซอร์ (Chromium) ด้วยวิดีโอ webm จริงจาก ffmpeg + โครงโฟลเดอร์จริง
// ครอบคลุม: เลือกโฟลเดอร์+โฟลเดอร์ย่อย / ตัวกรองชื่อแยกกัน / สลับโฟลเดอร์แล้วป้ายไม่หาย / ตัวเลขนับตรงกัน / ลายนิ้วมือ /
//          ภาพตัวอย่าง / เล่นวิดีโอ / ติดป้าย / ค้นหา / ไฟล์ซ้ำ / ย้ายที่ / แผนย้าย (ดูตัวอย่าง) / สำรอง / ไฟล์เป็นร้อย
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../scripts/serve.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = mkdtempSync(join(tmpdir(), 'opv-and-'));
const P = join(root, 'Pictures');
const owner = join(P, 'Gallery', 'owner');
for (const d of [owner, join(owner, 'sub', 'deep'), join(P, 'Gallery', 'owner2'), join(P, 'Other')]) mkdirSync(d, { recursive: true });
const mk = (file, color, freq) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:d=3:r=10`,
  '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=3`, '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libvorbis', '-shortest', file]);
mk(join(owner, 'Screenrecorder-001.webm'), 'red', 440);
mk(join(owner, 'sub', 'Screenrecorder-002.webm'), 'blue', 550);
mk(join(owner, 'sub', 'deep', 'Gallery-clip-003.webm'), 'green', 660);
mk(join(P, 'Gallery', 'owner2', 'Screenrecorder-004.webm'), 'yellow', 330); // ชื่อโฟลเดอร์ขึ้นต้นเหมือน owner แต่ไม่ใช่โฟลเดอร์ย่อย
mk(join(P, 'Other', 'IMG_family.webm'), 'white', 220);

const server = await startServer(8098);
const url = 'http://localhost:8098/android/www/index.html';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [], external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('request', (r) => { if (!/^(http:\/\/localhost|blob:|data:)/.test(r.url())) external.push(r.url()); });
const step = (n) => console.log('ผ่าน:', n);
const hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{FE0F}]/u;
const READY = { library: '#folder:not(:empty)', dupes: 'h2:has-text("ตรวจไฟล์ซ้ำ")', plan: 'h2:has-text("แผนย้ายไฟล์")', settings: '#scope' };
const nav = async (tab) => { await page.click(`nav [data-tab=${tab}]`); await page.waitForSelector(READY[tab]); };
const scanDir = async () => { await nav('library'); await page.setInputFiles('#pickDir', P); await waitScan(); };
const waitScan = async () => {
  await page.waitForFunction(() => /^(สแกน \d|ไม่พบวิดีโอ|หยุดสแกน)/.test(document.querySelector('#msg')?.textContent || '') && !document.querySelector('#scanRow')?.offsetParent, null, { timeout: 120000 });
};
const counts = async () => {
  const t = await page.textContent('#counts');
  const m = t.match(/([\d,]+) คลิป \+ ไฟล์ซ้ำ ([\d,]+) = ([\d,]+) ไฟล์/);
  assert.ok(m, `รูปแบบตัวเลขไม่ตรง: ${t}`);
  const [c, d, f] = m.slice(1).map((x) => Number(x.replace(/,/g, '')));
  assert.equal(c + d, f, `คลิป + ซ้ำ ต้องเท่ากับไฟล์: ${t}`);
  return { clips: c, copies: d, files: f, text: t };
};
const setScope = async (v) => { await nav('settings'); await page.fill('#scope', v); await page.click('#saveScope'); await page.waitForSelector('#scope'); };
const tiles = () => page.locator('.tile').count();

await page.goto(url);
await page.waitForSelector('.empty');
assert.match(await page.textContent('#folder'), /Pictures\/Gallery\/owner \(รวมโฟลเดอร์ย่อย\)/);
assert.equal(await page.locator('#stop').isVisible(), false, 'ปุ่มหยุดต้องซ่อนเมื่อไม่ได้สแกน');
step('เปิดแอป: โฟลเดอร์เริ่มต้น Pictures/Gallery/owner');

// ตั้งค่า: โฟลเดอร์กับตัวกรองชื่อเป็นคนละส่วนชัดเจน
await nav('settings');
const st = await page.textContent('main');
assert.match(st, /1\. โฟลเดอร์ที่สแกน/);
assert.match(st, /2\. ตัวกรองชื่อไฟล์ \(แยกจากโฟลเดอร์\)/);
assert.equal(await page.inputValue('#filter'), '');
step('ตั้งค่าแยก "โฟลเดอร์" กับ "ตัวกรองชื่อไฟล์" ชัดเจน (ชื่อเริ่มต้น = ทุกไฟล์)');

// สแกนทั้งต้นไม้ Pictures แต่เอาเฉพาะ owner + โฟลเดอร์ย่อยทุกชั้น
await scanDir();
const msg1 = await page.textContent('#msg');
assert.match(msg1, /สแกน 3 ไฟล์ · ในโฟลเดอร์ที่เลือกมี 3 คลิป \+ ซ้ำ 0 = 3 ไฟล์/, msg1);
assert.match(msg1, /นอกโฟลเดอร์ 2/, msg1);
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 3);
const names = await page.locator('.tile .nm').allTextContents();
assert.deepEqual(names.sort(), ['Gallery-clip-003.webm', 'Screenrecorder-001.webm', 'Screenrecorder-002.webm']);
assert.deepEqual((({ clips, copies, files }) => [clips, copies, files])(await counts()), [3, 0, 3]);
step('สแกน owner รวมโฟลเดอร์ย่อย 2 ชั้น: ได้ 3 คลิป (owner2 และ Other ถูกข้าม)');

await page.waitForFunction(() => document.querySelectorAll('.tile img').length === 3 && [...document.querySelectorAll('.tile img')].every((i) => i.complete && i.naturalWidth > 0));
step('ภาพตัวอย่างโหลดครบ 3 รูป');

// เล่น + ติดป้าย
await page.click('.tile:has-text("Screenrecorder-001")');
await page.waitForSelector('video');
await page.waitForFunction(() => document.querySelector('video').readyState >= 1 && document.querySelector('video').duration > 2);
await page.selectOption('#arc', 'baratie');
await page.fill('#ep', '21');
await page.fill('#chars', 'ลูฟี่, ซันจิ');
await page.fill('#notes', 'ซันจิเปิดร้าน');
await page.click('#save');
await page.waitForSelector('.tile');
step('เล่นวิดีโอและติดป้าย');

// สลับเป็นทุกโฟลเดอร์ + สแกนใหม่ → ได้ครบ 5 ; ตัวกรองชื่อทำงานแยกจากโฟลเดอร์
await setScope('');
await scanDir();
assert.match(await page.textContent('#msg'), /สแกน 5 ไฟล์ · ในโฟลเดอร์ที่เลือกมี 5 คลิป \+ ซ้ำ 0 = 5 ไฟล์/);
assert.equal(await tiles(), 5);
await nav('settings'); await page.fill('#filter', 'screen recorder'); await page.click('#saveFilter');
await setScope('Pictures/Gallery/owner');
await scanDir();
assert.match(await page.textContent('#msg'), /สแกน 2 ไฟล์ · ในโฟลเดอร์ที่เลือกมี 3 คลิป \+ ซ้ำ 0 = 3 ไฟล์/);
assert.match(await page.textContent('#msg'), /ไม่ตรงชื่อ 1/);
await nav('settings'); await page.fill('#filter', ''); await page.click('#saveFilter');
step('ตัวกรองชื่อกับโฟลเดอร์ทำงานแยกกัน (ข้ามนอกโฟลเดอร์ / ข้ามไม่ตรงชื่อ แจ้งแยกตัวเลข)');

// เปลี่ยนโฟลเดอร์ = แสดงเฉพาะในโฟลเดอร์ที่เลือก ไม่ลบข้อมูลหรือป้าย
await setScope('Pictures/Gallery/owner/sub');
await nav('library');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 2);
assert.match(await page.textContent('#counts'), /ซ่อนอยู่นอกโฟลเดอร์ 3 คลิป/);
assert.equal((await counts()).clips, 2);
await setScope('Pictures/Gallery/owner2');
await nav('library');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1);
await setScope('Pictures/Gallery/owner');
await nav('library');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 3);
await page.fill('#q', 'ep21');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1 && /Baratie/.test(document.querySelector('.tile').textContent));
await page.fill('#q', 'ซันจิ');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1);
await page.fill('#q', '');
await page.selectOption('#tagged', 'no');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 2);
await page.selectOption('#tagged', 'all');
await setScope('');
await nav('library');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 5);
assert.doesNotMatch(await page.textContent('#counts'), /ซ่อนอยู่/);
await setScope('Pictures/Gallery/owner');
step('สลับโฟลเดอร์ owner/sub/owner2/ทุกโฟลเดอร์: แสดงเฉพาะที่เลือก ป้ายไม่หาย ค้นหาได้');

// ย้ายไฟล์ (เนื้อหาเดิม) ไปโฟลเดอร์อื่น+ชื่อใหม่ → จำได้ ป้ายไม่หาย ไม่เพิ่มคลิป
renameSync(join(owner, 'Screenrecorder-001.webm'), join(owner, 'sub', 'Screenrecorder-renamed-EP21.webm'));
await scanDir();
assert.match(await page.textContent('#msg'), /ใหม่ 0 · เปลี่ยนชื่อ 0 · ย้ายที่ 1/);
assert.deepEqual((({ clips, copies, files }) => [clips, copies, files])(await counts()), [3, 0, 3]);
await page.fill('#q', 'ep21');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1 && document.querySelector('.tile .nm').textContent.includes('renamed'));
await page.fill('#q', '');
step('ย้ายที่+เปลี่ยนชื่อ: จำได้ ป้ายไม่หาย จำนวนคลิปคงเดิม');

// ไฟล์ซ้ำ: คัดลอกเนื้อหาเดียวกันไปอีกที่ → นับเป็นซ้ำ ไม่ใช่คลิปใหม่ และตัวเลขทุกหน้าต้องตรงกัน
copyFileSync(join(owner, 'sub', 'Screenrecorder-renamed-EP21.webm'), join(owner, 'Screenrecorder-copy.webm'));
await scanDir();
assert.match(await page.textContent('#msg'), /สแกน 4 ไฟล์ · ในโฟลเดอร์ที่เลือกมี 3 คลิป \+ ซ้ำ 1 = 4 ไฟล์/);
const c1 = await counts();
assert.deepEqual([c1.clips, c1.copies, c1.files], [3, 1, 4]);
await nav('dupes');
await page.waitForSelector('.card');
const dtext = await page.textContent('main');
assert.match(dtext, /3 คลิป \+ ไฟล์ซ้ำ 1 = 4 ไฟล์/);
assert.match(dtext, /พบ 1 กลุ่ม มีไฟล์ซ้ำเกิน 1 ไฟล์/);
assert.match(dtext, /ไม่ลบไฟล์ใด ๆ/);
assert.equal(await page.locator('.card').count(), 1);
await nav('settings');
assert.match(await page.textContent('main'), /ที่แสดงตอนนี้: 3 คลิป \+ ไฟล์ซ้ำ 1 = 4 ไฟล์/);
step('ไฟล์ซ้ำ: หน้าคลัง/ตรวจซ้ำ/ตั้งค่า/สรุปสแกน ตัวเลขตรงกัน (3 คลิป + 1 ซ้ำ = 4 ไฟล์)');

// แผนย้าย: ดูตัวอย่างเท่านั้น และครอบคลุมเฉพาะโฟลเดอร์ที่เลือก
await nav('plan');
await page.waitForSelector('text=โหมดดูตัวอย่างเท่านั้น');
const planText = await page.textContent('main');
assert.match(planText, /01 - East Blue\/04 - Baratie\/EP0021/);
assert.match(planText, /ทั้งหมด 3 /);
assert.equal(await page.locator('button:has-text("ย้าย")').count(), 0, 'ต้องไม่มีปุ่มสั่งย้ายจริง');
step('แผนย้าย: ดูตัวอย่างเท่านั้น ไม่มีปุ่มย้ายจริง เฉพาะคลิปในโฟลเดอร์ที่เลือก');

// สำรอง
await nav('settings');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
assert.match(dl.suggestedFilename(), /^onepiece-vault-android-.*\.json$/);
const backup = JSON.parse(readFileSync(await dl.path(), 'utf8'));
assert.equal(backup.clips.length, 5, 'สำรองต้องรวมคลิปนอกโฟลเดอร์ที่ซ่อนอยู่ด้วย (ไม่ทิ้งข้อมูล)');
step('ส่งออกสำรองครบทุกคลิปรวมที่ซ่อนอยู่');

// ไฟล์เป็นร้อย: เสถียร นับถูก แบ่งหน้า
const big = join(root, 'big', 'Pictures', 'Gallery', 'owner', 'batch');
mkdirSync(big, { recursive: true });
const seed = readFileSync(join(owner, 'sub', 'deep', 'Gallery-clip-003.webm'));
const N = 130;
for (let i = 0; i < N; i++) writeFileSync(join(big, `Screenrecorder-big-${String(i).padStart(4, '0')}.webm`), Buffer.concat([seed, Buffer.alloc(i + 1, i)]));
await nav('library');
const t0 = Date.now();
await page.setInputFiles('#pickDir', join(root, 'big', 'Pictures'));
await waitScan();
console.log(`   (สแกน ${N} ไฟล์ใช้ ${Math.round((Date.now() - t0) / 100) / 10} วินาที)`);
assert.match(await page.textContent('#msg'), new RegExp(`สแกน ${N} ไฟล์ · ในโฟลเดอร์ที่เลือกมี ${3 + N} คลิป \\+ ซ้ำ 1 = ${4 + N} ไฟล์`));
const c2 = await counts();
assert.deepEqual([c2.clips, c2.copies, c2.files], [3 + N, 1, 4 + N]); // 3 คลิปเดิม (+ซ้ำ 1 ที่มีอยู่) + 130 ใหม่ · ที่ไม่ได้เลือกรอบนี้ไม่ถูกนับว่าหาย
assert.equal(await tiles(), 60);
await page.click('#more');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 120);
await page.click('#more');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 3 + 130);
assert.equal(await page.locator('#more').isHidden(), true);
// สแกนซ้ำ: ใช้ที่จำลายนิ้วมือ ไม่มีอะไรเปลี่ยน ตัวเลขเท่าเดิม
await page.setInputFiles('#pickDir', join(root, 'big', 'Pictures'));
await waitScan();
assert.match(await page.textContent('#msg'), /ใหม่ 0 · เปลี่ยนชื่อ 0 · ย้ายที่ 0 · ไฟล์หาย 0/);
assert.deepEqual(await counts().then((c) => [c.clips, c.copies, c.files]), [c2.clips, c2.copies, c2.files]);
step(`ไฟล์ ${N} ไฟล์: สแกนเสร็จ นับถูก แบ่งหน้า สแกนซ้ำไม่เปลี่ยนตัวเลข`);


// ตัวเลือกโฟลเดอร์จากรายการ (มีจำนวนไฟล์รวมโฟลเดอร์ย่อย)
await nav('settings');
await page.click('#pickFolder');
await page.waitForSelector('dialog .folder-row');
const rowTxt = await page.locator('dialog .folder-row[data-dir="Pictures/Gallery/owner"]').textContent();
assert.match(rowTxt, /owner\s*\d+/);
await page.locator('dialog .folder-row[data-dir="Pictures/Gallery/owner/sub"]').click();
await page.waitForFunction(() => document.querySelector('#scope')?.value === 'Pictures/Gallery/owner/sub');
await setScope('Pictures/Gallery/owner');
step('เลือกโฟลเดอร์จากรายการได้ (แสดงจำนวนไฟล์รวมโฟลเดอร์ย่อย)');

// หยุดสแกนกลางคัน = รายการไม่เปลี่ยน แล้วสแกนใหม่ทำต่อจนครบ
const many = join(root, 'many', 'Pictures', 'Gallery', 'owner', 'many');
mkdirSync(many, { recursive: true });
for (let i = 0; i < 700; i++) writeFileSync(join(many, `Screenrecorder-many-${String(i).padStart(4, '0')}.webm`), Buffer.concat([seed, Buffer.alloc(i + 1000, i % 251)]));
await nav('library');
const before = (await counts()).clips;
await page.setInputFiles('#pickDir', join(root, 'many', 'Pictures'));
await page.waitForSelector('#stop', { state: 'visible' });
await page.click('#stop');
await waitScan();
const stopMsg = await page.textContent('#msg');
assert.match(stopMsg, /หยุดสแกนแล้ว/, stopMsg);
assert.equal((await counts()).clips, before, 'หยุดสแกนแล้วรายการต้องไม่เปลี่ยน');
step('หยุดสแกนกลางคัน: รายการไม่เปลี่ยน');
await page.setInputFiles('#pickDir', join(root, 'many', 'Pictures'));
await waitScan();
assert.match(await page.textContent('#msg'), /สแกน 700 ไฟล์ .*ใหม่ 700/);
await page.waitForFunction((n) => new RegExp(`^${n} คลิป`).test(document.querySelector('#counts').textContent.replace(/,/g, '')), before + 700, { timeout: 20000 });
assert.equal((await counts()).clips, before + 700);
step('สแกนใหม่หลังหยุด: ครบ 700 ไม่ตก ไม่ซ้ำ');

// อัปเกรดฐานข้อมูลรุ่นเก่า (v1, ก่อนมี fpcache) → ข้อมูลและป้ายเดิมต้องอยู่ครบ
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 } });
const old = await ctx2.newPage();
await old.goto('http://localhost:8098/android/www/css/app.css'); // หน้าที่ origin เดียวกันแต่ยังไม่มีแอป จึงสร้าง DB รุ่น 1 ได้
await old.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('opv-android', 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('clips', { keyPath: 'id' }); d.createObjectStore('thumbs', { keyPath: 'id' }); d.createObjectStore('meta', { keyPath: 'key' }); };
  r.onsuccess = () => {
    const tx = r.result.transaction('clips', 'readwrite');
    tx.objectStore('clips').put({ id: 'v1-old', name: 'old-clip.mp4', path: '/storage/emulated/0/Pictures/Gallery/owner/old-clip.mp4', folder: '/storage/emulated/0/Pictures/Gallery/owner', uri: '', size: 5, mtime: 1, durationMs: 0, w: 0, h: 0, status: 'present', firstSeen: 1, lastSeen: 1, copies: [{ path: '/storage/emulated/0/Download/old-copy.mp4', name: 'old-copy.mp4', uri: '' }], history: [], arcId: 'zou', episode: 7, characters: ['โซโล'], notes: 'ข้อมูลรุ่นเก่า', updatedAt: 9 });
    tx.oncomplete = () => { r.result.close(); res(); };
  };
  r.onerror = () => rej(r.error);
}));
await old.goto(url);
await old.waitForSelector('.tile:has-text("old-clip.mp4")');
assert.match(await old.textContent('.tile'), /Zou · ตอน 7/);
assert.match(await old.textContent('#counts'), /1 คลิป \+ ไฟล์ซ้ำ 0 = 1 ไฟล์/); // สำเนาเดิมอยู่ใน Download (นอกโฟลเดอร์ที่เลือก) ไม่นับในโฟลเดอร์ owner
await old.evaluate(() => new Promise((res) => { const r = indexedDB.open('opv-android'); r.onsuccess = () => { const tx = r.result.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'scanFolder', value: '' }); tx.oncomplete = () => { r.result.close(); res(); }; }; }));
await old.reload();
await old.waitForSelector('.tile');
assert.match(await old.textContent('#counts'), /1 คลิป \+ ไฟล์ซ้ำ 1 = 2 ไฟล์/); // ดูทุกโฟลเดอร์: เห็นสำเนาด้วย
const ver = await old.evaluate(() => new Promise((res) => { const r = indexedDB.open('opv-android'); r.onsuccess = () => { res({ v: r.result.version, stores: [...r.result.objectStoreNames].sort() }); r.result.close(); }; }));
assert.deepEqual(ver, { v: 2, stores: ['clips', 'fpcache', 'meta', 'thumbs'] });
await ctx2.close();
step('อัปเกรดฐานข้อมูล v1 เป็น v2: คลิป ป้าย ไฟล์ซ้ำเดิมอยู่ครบ');

// ไม่มีอีโมจิ / ไม่มีการเรียกนอกเครื่อง / ไม่มี error
for (const tab of ['library', 'dupes', 'plan', 'settings']) {
  await nav(tab);
  await page.waitForTimeout(200);
  assert.ok(!hasEmoji.test(await page.evaluate(() => document.body.innerText)), `พบอีโมจิในหน้า ${tab}`);
}
assert.deepEqual(external, [], `มีการเรียกนอกเครื่อง: ${external}`);
assert.deepEqual(errors, [], `มี error ในหน้า: ${errors}`);
step('ไม่มีอีโมจิ · ไม่มีการเรียกนอกเครื่อง · ไม่มี error');

await browser.close();
server.close();
console.log('e2e แอนดรอยด์ผ่านทั้งหมด');
