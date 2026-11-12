// ทดสอบ end-to-end ของแอป APK ในโหมดเบราว์เซอร์ (Chromium) ด้วยวิดีโอ webm จริงจาก ffmpeg
// ครอบคลุม: สแกน/ลายนิ้วมือ/ภาพตัวอย่าง/เล่นวิดีโอ/ติดป้าย/ค้นหา/เปลี่ยนชื่อไฟล์แล้วจำได้/ตรวจซ้ำ/แผนย้าย (ดูตัวอย่าง)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../scripts/serve.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const dir = mkdtempSync(join(tmpdir(), 'opv-and-'));
const mk = (name, color, freq) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:d=3:r=10`,
  '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=3`, '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libvorbis', '-shortest', join(dir, name)]);
mk('Screenrecorder-001.webm', 'red', 440);
mk('Screenrecorder-002.webm', 'blue', 550);
mk('Screenrecorder-003.webm', 'green', 660);
mk('IMG_family.webm', 'yellow', 330);

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
const pick = async (...names) => { await page.setInputFiles('#pick', names.map((n) => join(dir, n))); };
const waitScan = async () => { await page.waitForFunction(() => /^สแกน \d+ ไฟล์/.test(document.querySelector('#msg')?.textContent || ''), null, { timeout: 30000 }); await page.waitForSelector('#bar', { state: 'hidden' }); };

await page.goto(url);
await page.waitForSelector('.empty');
step('เปิดแอป (คลังว่าง)');

// สแกน: กรองชื่อ Screenrecorder → ไฟล์ IMG_family ต้องไม่เข้าคลัง
await pick('Screenrecorder-001.webm', 'Screenrecorder-002.webm', 'Screenrecorder-003.webm', 'IMG_family.webm');
await waitScan();
assert.match(await page.textContent('#msg'), /สแกน 3 ไฟล์ · ใหม่ 3/);
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 3);
step('สแกน 3 คลิป (ตัวกรองชื่อตัด IMG_family ออก)');

// ภาพตัวอย่างต้องเป็นรูปจริง
await page.waitForFunction(() => document.querySelectorAll('.tile img').length === 3 && [...document.querySelectorAll('.tile img')].every((i) => i.complete && i.naturalWidth > 0));
step('ภาพตัวอย่างโหลดครบ 3 รูป');

// เปิดคลิป เล่นได้ ติดป้าย
await page.click('.tile:has-text("Screenrecorder-001")');
await page.waitForSelector('video');
await page.waitForFunction(() => document.querySelector('video').readyState >= 1 && document.querySelector('video').duration > 2);
step('วิดีโอโหลดและรู้ความยาว');
await page.selectOption('#arc', 'baratie');
await page.fill('#ep', '21');
await page.fill('#chars', 'ลูฟี่, ซันจิ');
await page.fill('#notes', 'ซันจิเปิดร้าน');
await page.click('#save');
await page.waitForSelector('.tile');
step('ติดป้าย Arc/ตอน/ตัวละคร');

// ค้นหา
await page.fill('#q', 'ep21');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1);
await page.fill('#q', 'ซันจิ');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1);
await page.fill('#q', 'Baratie');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1);
await page.fill('#q', '');
await page.selectOption('#tagged', 'no');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 2);
await page.selectOption('#tagged', 'all');
step('ค้นหา ตอน/ตัวละคร/Arc/ยังไม่ติดป้าย');

// เปลี่ยนชื่อไฟล์ (เนื้อหาเดิม) แล้วสแกนใหม่ → ต้องจำได้และป้ายไม่หาย
copyFileSync(join(dir, 'Screenrecorder-001.webm'), join(dir, 'Screenrecorder-renamed-EP21.webm'));
await pick('Screenrecorder-renamed-EP21.webm', 'Screenrecorder-002.webm', 'Screenrecorder-003.webm');
await waitScan();
const msg = await page.textContent('#msg');
assert.match(msg, /ใหม่ 0 · เปลี่ยนชื่อ 1/, msg);
assert.equal(await page.locator('.tile').count(), 3);
await page.fill('#q', 'ep21');
await page.waitForFunction(() => document.querySelectorAll('.tile').length === 1 && document.querySelector('.tile .nm').textContent.includes('renamed'));
await page.fill('#q', '');
step('เปลี่ยนชื่อไฟล์ = จำได้ ไม่สร้างคลิปใหม่ ป้ายไม่หาย (ค้น ep21 เจอชื่อใหม่)');

// เจอไฟล์เนื้อหาเดียวกัน 2 ที่พร้อมกัน = ไฟล์ซ้ำ (ไม่ใช่คลิปใหม่)
await pick('Screenrecorder-renamed-EP21.webm', 'Screenrecorder-001.webm', 'Screenrecorder-002.webm', 'Screenrecorder-003.webm');
await waitScan();
assert.match(await page.textContent('#msg'), /ใหม่ 0.*ซ้ำ 1/);
assert.equal(await page.locator('.tile').count(), 3);
step('เนื้อหาเดียวกัน 2 ที่ = นับเป็นไฟล์ซ้ำ ไม่ใช่คลิปใหม่');

// ตรวจซ้ำ
await page.click('nav [data-tab=dupes]');
await page.waitForSelector('.card:has-text("Screenrecorder")');
assert.match(await page.textContent('main'), /ไม่ลบไฟล์ใด ๆ/);
assert.equal(await page.locator('.card').count(), 1);
step('หน้าตรวจซ้ำเจอ 1 กลุ่ม');

// แผนย้าย: ดูตัวอย่างเท่านั้น
await page.click('nav [data-tab=plan]');
await page.waitForSelector('text=โหมดดูตัวอย่างเท่านั้น');
const planText = await page.textContent('main');
assert.match(planText, /01 - East Blue\/04 - Baratie\/EP0021/);
assert.match(planText, /ยังไม่ติดป้าย 2/);
assert.equal(await page.locator('button:has-text("ย้าย")').count(), 0, 'ต้องไม่มีปุ่มสั่งย้ายจริง');
step('แผนย้าย: เห็นปลายทาง Saga/Arc/ตอน และไม่มีปุ่มย้ายจริง');

// สำรอง/กู้คืน
await page.click('nav [data-tab=settings]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
assert.match(dl.suggestedFilename(), /^onepiece-vault-android-.*\.json$/);
step('ส่งออกไฟล์สำรอง');

// ไม่มีอีโมจิ / ✓ ✗ และไม่มีการเรียกนอกเครื่อง / ไม่มี error
for (const tab of ['library', 'dupes', 'plan', 'settings']) {
  await page.click(`nav [data-tab=${tab}]`);
  await page.waitForTimeout(150);
  assert.ok(!hasEmoji.test(await page.evaluate(() => document.body.innerText)), `พบอีโมจิในหน้า ${tab}`);
}
assert.deepEqual(external, [], `มีการเรียกนอกเครื่อง: ${external}`);
assert.deepEqual(errors, [], `มี error ในหน้า: ${errors}`);
step('ไม่มีอีโมจิ · ไม่มีการเรียกนอกเครื่อง · ไม่มี error');

await browser.close();
server.close();
console.log('e2e แอนดรอยด์ผ่านทั้งหมด');
