import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchScenes, topValues } from '../js/lib/search.js';

const episodes = [{ id: 'e1', number: 1, title: 'ลูฟี่ผู้ชายที่จะเป็นราชาโจรสลัด' }, { id: 'e2', number: 12, title: 'Arlong' }];
const scenes = [
  { id: 's1', episodeId: 'e1', start: 60, end: 120, title: 'พบกับชังค์ส', characters: ['ลูฟี่', 'ชังค์ส'], events: ['กินผลปีศาจ'], notes: '' },
  { id: 's2', episodeId: 'e2', start: 750, end: 800, title: 'ต่อสู้', characters: ['ซานจิ', 'ลูฟี่'], events: ['ศึกใหญ่'], notes: 'โซโลช่วย' },
  { id: 's3', episodeId: 'e2', start: 10, end: null, title: 'เปิดตอน', characters: [], events: [], notes: '' },
];
const ids = (r) => r.map((s) => s.id);

test('ค้นหาด้วยตัวละคร/เหตุการณ์/บันทึก', () => {
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: 'ลูฟี่' })), ['s1', 's2']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: 'ศึกใหญ่' })), ['s2']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: 'โซโล' })), ['s2']);
});
test('หลายคำเป็น AND และไม่สนตัวพิมพ์', () => {
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: 'ลูฟี่ arlong' })), ['s2']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: 'ARLONG' })), ['s3', 's2']);
});
test('ค้นหาด้วยเลขตอน', () => {
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: 'ep12' })), ['s3', 's2']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: 'ตอน1' })), ['s1']);
});
test('ค้นหาด้วย Timestamp', () => {
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: '12:30' })), ['s2']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: '1:30' })), ['s1']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, { text: '00:10' })), ['s3']);
});
test('กรองตอน/ตัวละคร และเรียงตามตอน+เวลา', () => {
  assert.deepEqual(ids(searchScenes(scenes, episodes, { episodeId: 'e2' })), ['s3', 's2']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, { character: 'ซานจิ' })), ['s2']);
  assert.deepEqual(ids(searchScenes(scenes, episodes, {})), ['s1', 's3', 's2']);
});
test('topValues เรียงตามความถี่', () => {
  assert.deepEqual(topValues(scenes, 'characters', 2), ['ลูฟี่', 'ชังค์ส']);
});
