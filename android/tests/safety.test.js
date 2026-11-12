// ตัวเฝ้ากฎของโปรเจกต์: แอป APK ต้องอ่านอย่างเดียว ไม่ย้าย/ลบไฟล์ ไม่เรียกเครือข่าย ไม่เรียก AI เสียเงิน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d, ext) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p, ext) : ext.some((e) => p.endsWith(e)) ? [p] : [];
});

test('โค้ด Java ไม่มีคำสั่งย้าย/ลบ/เปลี่ยนชื่อ/เขียนไฟล์ผู้ใช้', () => {
  const banned = [/renameTo\s*\(/, /\.delete\s*\(/, /Files\.(move|delete|copy|write)/, /deleteDocument|moveDocument|renameDocument/,
    /MANAGE_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/, /openFileDescriptor\([^)]*"(w|rw|wt|wa)"/, /ContentResolver[^;]*\.(delete|update)\s*\(/];
  for (const f of walk(join(root, 'native'), ['.java'])) {
    const src = readFileSync(f, 'utf8');
    for (const re of banned) assert.ok(!re.test(src), `${f} ต้องไม่มี ${re}`);
  }
});

test('สคริปต์ตั้งค่า wrapper ไม่ขอสิทธิ์เขียน/จัดการไฟล์ทั้งเครื่อง', () => {
  const src = readFileSync(join(root, 'scripts/prepare-wrapper.mjs'), 'utf8');
  assert.ok(!/MANAGE_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/.test(src.replace(/\/\/.*$/gm, '')));
});

test('โค้ดเว็บในแอปไม่เรียกเครือข่าย ไม่มี CDN ไม่มี AI', () => {
  for (const f of walk(join(root, 'www'), ['.js', '.html', '.css'])) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src), `${f} เรียกเครือข่าย`);
    assert.ok(!/https?:\/\/(?!localhost|www\.w3\.org)/.test(src), `${f} มีลิงก์ภายนอก`);
    assert.ok(!/openrouter|openai|anthropic|api[_-]?key/i.test(src), `${f} แตะ API/AI`);
  }
});
