import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimecode, formatTimecode } from '../js/lib/timecode.js';

test('parseTimecode รองรับหลายรูปแบบ', () => {
  assert.equal(parseTimecode('90'), 90);
  assert.equal(parseTimecode('1:30'), 90);
  assert.equal(parseTimecode('01:02:03'), 3723);
  assert.equal(parseTimecode(' 12:30 '), 750);
});
test('parseTimecode ปฏิเสธค่าที่ผิด', () => {
  for (const bad of ['', 'abc', '1:60', '1:2:3:4', '-5', '1.5', null, undefined]) assert.equal(parseTimecode(bad), null, String(bad));
});
test('formatTimecode', () => {
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(750), '12:30');
  assert.equal(formatTimecode(3723), '1:02:03');
  assert.equal(formatTimecode(-4), '00:00');
});
test('parse/format กลับไปกลับมาได้', () => {
  for (const s of [0, 59, 60, 3599, 3600, 86399]) assert.equal(parseTimecode(formatTimecode(s)), s);
});
