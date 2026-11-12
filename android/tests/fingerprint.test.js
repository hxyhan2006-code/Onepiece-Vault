import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CHUNK, sampleRanges, fingerprint, fingerprintFile } from '../www/js/lib/fingerprint.js';

test('sampleRanges: ไฟล์เล็กอ่านทั้งไฟล์ ไฟล์ใหญ่อ่าน 3 ช่วง', () => {
  assert.deepEqual(sampleRanges(0), []);
  assert.deepEqual(sampleRanges(1000), [{ offset: 0, length: 1000 }]);
  assert.deepEqual(sampleRanges(CHUNK * 3), [{ offset: 0, length: CHUNK * 3 }]);
  const big = CHUNK * 3 + 1;
  assert.deepEqual(sampleRanges(big).map((r) => r.offset), [0, Math.floor((big - CHUNK) / 2), big - CHUNK]);
});

test('ลายนิ้วมือเหมือนเดิมเมื่อชื่อเปลี่ยน (ขึ้นกับเนื้อหา+ขนาดเท่านั้น) และต่างกันเมื่อเนื้อหาต่าง', async () => {
  const data = randomBytes(CHUNK * 4);
  const a = await fingerprint(data.length, (o, l) => data.subarray(o, o + l));
  const b = await fingerprint(data.length, (o, l) => data.subarray(o, o + l));
  assert.equal(a, b);
  assert.match(a, /^v1-[0-9a-f]{64}$/);
  const edited = Buffer.from(data); edited[Math.floor(data.length / 2)] ^= 1; // ไบต์กลางไฟล์ต่างกัน
  assert.notEqual(a, await fingerprint(edited.length, (o, l) => edited.subarray(o, o + l)));
});

test('fingerprintFile ใช้ได้กับ Blob/File', async () => {
  const data = randomBytes(5000);
  assert.equal(await fingerprintFile(new Blob([data])), await fingerprint(5000, (o, l) => data.subarray(o, o + l)));
});

const javac = spawnSync('javac', ['-version'], { encoding: 'utf8' });
test('JS กับ Java ให้ลายนิ้วมือตรงกัน (ขนาดขอบเขตต่าง ๆ)', { skip: javac.error ? 'ไม่มี javac' : false }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'opv-fp-'));
  const build = spawnSync('javac', ['-d', dir, new URL('../native/java/com/han/onepiecevault/Fingerprint.java', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  for (const size of [1, 1000, CHUNK * 3, CHUNK * 3 + 1, 5_000_001]) {
    const f = join(dir, `f${size}.bin`);
    writeFileSync(f, randomBytes(size));
    const run = spawnSync('java', ['-cp', dir, 'com.han.onepiecevault.Fingerprint', f], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const buf = readFileSync(f);
    const js = await fingerprint(size, (o, l) => buf.subarray(o, o + l));
    assert.equal(run.stdout.trim(), js, `ขนาด ${size}`);
  }
});
