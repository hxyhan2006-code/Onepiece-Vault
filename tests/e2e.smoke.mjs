// ทดสอบแบบ end-to-end ด้วย Chromium (ต้องมี playwright) — รัน: npm run test:e2e
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../scripts/serve.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const server = await startServer(8099);
const url = 'http://localhost:8099/index.html';
const dir = await mkdtemp(join(tmpdir(), 'opv-'));
const videoPath = join(dir, 'ep1.mp4');
await writeFile(videoPath, Buffer.alloc(2048, 1)); // ไฟล์จำลอง (ทดสอบการเก็บ ไม่ใช่การเล่น)

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const step = (n) => console.log('✓', n);

await page.goto(url);
await page.waitForSelector('.empty');
step('เปิดแอป (ว่าง)');

// เพิ่มตอน
await page.click('nav [data-tab=episodes]');
await page.click('#add');
await page.fill('dialog [name=number]', '1');
await page.fill('dialog [name=title]', 'ตอนแรก');
await page.click('dialog button[type=submit]');
await page.waitForSelector('a.card:has-text("EP 1")');
step('เพิ่มตอน');

// ตอนซ้ำต้องแจ้งเตือน
await page.click('#add');
await page.fill('dialog [name=number]', '1');
await page.click('dialog button[type=submit]');
assert.match(await page.textContent('dialog .form-error'), /มีตอน 1 อยู่แล้ว/);
await page.click('dialog [data-cancel]');
step('กันตอนซ้ำ');

// เพิ่ม Scene + validation
await page.click('a.card:has-text("EP 1")');
await page.click('#addScene');
await page.fill('dialog [name=start]', '99:99');
await page.click('dialog button[type=submit]');
assert.match(await page.textContent('dialog .form-error'), /เวลาเริ่มไม่ถูกต้อง/);
await page.fill('dialog [name=title]', 'ลูฟี่พบชังค์ส');
await page.fill('dialog [name=start]', '12:30');
await page.fill('dialog [name=end]', '13:10');
await page.fill('dialog [name=characters]', 'ลูฟี่, ชังค์ส');
await page.fill('dialog [name=events]', 'กินผลปีศาจ');
await page.click('dialog button[type=submit]');
await page.waitForSelector('#scenes .card:has-text("ลูฟี่พบชังค์ส")');
step('เพิ่ม Scene + ตรวจเวลา');

// แก้ไข Scene
await page.click('[data-edit]');
await page.fill('dialog [name=title]', 'ลูฟี่พบชังค์ส (แก้)');
await page.click('dialog button[type=submit]');
await page.waitForSelector('#scenes .card:has-text("(แก้)")');
step('แก้ไข Scene');

// นำเข้าวิดีโอ
await page.setInputFiles('#file', videoPath);
await page.waitForSelector('#rmVideo');
assert.ok((await page.textContent('main')).includes('ep1.mp4'));
step('นำเข้าวิดีโอ');

// ค้นหา: ตัวละคร / เหตุการณ์ / ep / timestamp
await page.click('nav [data-tab=search]');
for (const [q, hit] of [['ชังค์ส', 1], ['ผลปีศาจ', 1], ['ep1', 1], ['12:45', 1], ['13:30', 0], ['ไม่มีแน่นอน', 0]]) {
  await page.fill('#q', q);
  assert.equal(await page.locator('#results a.card').count(), hit, `ค้นหา ${q}`);
}
step('ค้นหา ตัวละคร/เหตุการณ์/ep/timestamp');

// สำรอง JSON
await page.fill('#q', '');
await page.click('nav [data-tab=settings]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
const backupPath = join(dir, 'backup.json');
await dl.saveAs(backupPath);
const backup = JSON.parse((await import('node:fs')).readFileSync(backupPath, 'utf8'));
assert.equal(backup.app, 'onepiece-vault');
assert.equal(backup.scenes.length, 1);
assert.ok(!JSON.stringify(backup).includes('blob'));
step('ส่งออก JSON');

// ลบตอน แล้วกู้คืนจากไฟล์สำรอง
await page.click('nav [data-tab=episodes]');
await page.click('a.card:has-text("EP 1")');
await page.click('#delEp');
await page.click('dialog button[type=submit]');
await page.waitForSelector('.empty');
await page.click('nav [data-tab=settings]');
await page.setInputFiles('#import', backupPath);
await page.click('dialog button[type=submit]');
await page.click('nav [data-tab=search]');
await page.waitForSelector('#results a.card');
step('ลบแล้วกู้คืนจาก JSON');

// ไฟล์ผิดรูปแบบ
const bad = join(dir, 'bad.json');
await writeFile(bad, '{"hello":1}');
await page.click('nav [data-tab=settings]');
await page.setInputFiles('#import', bad);
await page.waitForSelector('#toast.show');
assert.match(await page.textContent('#toast'), /ไม่ใช่ข้อมูลสำรอง/);
step('ปฏิเสธไฟล์ผิด');

// ออฟไลน์: รอ SW แล้วตัดเน็ต
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#view .card, #view .empty');
await page.click('nav [data-tab=search]');
await page.waitForSelector('#results a.card');
step('ใช้งานออฟไลน์ได้');

await page.screenshot({ path: process.env.SHOT || join(dir, 'search.png') });
await browser.close();
server.close();
assert.deepEqual(errors, [], 'ไม่ควรมี error ในคอนโซล: ' + errors.join(' | '));
console.log('E2E ผ่านทั้งหมด');
