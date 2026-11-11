import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, validateBackup, applyImport } from '../js/lib/backup.js';

const eps = [{ id: 'e1', number: 1, title: 'A', hasVideo: true, videoName: 'a.mp4', videoSize: 5 }];
const scs = [{ id: 's1', episodeId: 'e1', start: 5, end: 9, title: 'x', characters: ['ลูฟี่'], events: [], notes: '', updatedAt: 1 }];

test('สำรองแล้วกู้คืนได้ข้อมูลเดิม (ไม่รวมสถานะวิดีโอ)', () => {
  const json = JSON.stringify(buildBackup(eps, scs));
  const back = validateBackup(json);
  assert.deepEqual(back.scenes, scs);
  assert.deepEqual(back.episodes, [{ id: 'e1', number: 1, title: 'A', videoName: 'a.mp4' }]);
  assert.ok(!json.includes('videoSize'));
});
test('ปฏิเสธไฟล์ที่ไม่ถูกต้อง', () => {
  assert.throws(() => validateBackup('{not json'), /JSON/);
  assert.throws(() => validateBackup({ app: 'other' }), /ไม่ใช่ข้อมูลสำรอง/);
  assert.throws(() => validateBackup({ app: 'onepiece-vault', version: 99, episodes: [], scenes: [] }), /ใหม่กว่า/);
  assert.throws(() => validateBackup({ app: 'onepiece-vault', version: 1 }), /โครงสร้าง/);
});
test('ตัดข้อมูลเสียทิ้ง: scene กำพร้า, เวลาผิด, id ซ้ำ', () => {
  const r = validateBackup({
    app: 'onepiece-vault', version: 1,
    episodes: [{ id: 'e1', number: 1 }, { id: 'e1', number: 2 }, { id: 'e2', number: -1 }],
    scenes: [
      { id: 'a', episodeId: 'e1', start: 5, end: 2 },   // end < start -> end เป็น null
      { id: 'b', episodeId: 'nope', start: 1 },         // ไม่มี episode
      { id: 'c', episodeId: 'e1', start: 'x' },         // เวลาผิด
      { id: 'a', episodeId: 'e1', start: 7 },           // id ซ้ำ
    ],
  });
  assert.equal(r.episodes.length, 1);
  assert.equal(r.scenes.length, 1);
  assert.equal(r.scenes[0].end, null);
});
test('applyImport: replace/merge และคงสถานะวิดีโอเดิม', () => {
  const current = { episodes: eps, scenes: scs };
  const incoming = { episodes: [{ id: 'e1', number: 1, title: 'ใหม่', videoName: '' }, { id: 'e3', number: 3, title: '', videoName: '' }],
    scenes: [{ ...scs[0], title: 'แก้แล้ว' }] };
  const merged = applyImport(current, incoming, 'merge');
  assert.equal(merged.episodes.length, 2);
  assert.equal(merged.episodes.find((e) => e.id === 'e1').title, 'ใหม่');
  assert.equal(merged.episodes.find((e) => e.id === 'e1').hasVideo, true);
  assert.equal(merged.episodes.find((e) => e.id === 'e3').hasVideo, false);
  assert.equal(merged.scenes[0].title, 'แก้แล้ว');
  const replaced = applyImport(current, { episodes: [incoming.episodes[1]], scenes: [] }, 'replace');
  assert.deepEqual(replaced.episodes.map((e) => e.id), ['e3']);
  assert.equal(replaced.scenes.length, 0);
});
