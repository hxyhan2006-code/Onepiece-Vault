import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, duplicateGroups } from '../www/js/lib/reconcile.js';

const f = (fp, path, extra = {}) => ({ fp, name: path.split('/').pop(), path, size: 100, mtime: 1, ...extra });
const paths = (...ss) => new Set(ss.map((s) => s.path));

test('ไฟล์ใหม่ถูกเพิ่ม', () => {
  const s = [f('v1-a', '/m/Screenrecorder-1.mp4')];
  const r = reconcile([], s, paths(...s), 10);
  assert.equal(r.stats.added, 1);
  assert.equal(r.clips[0].id, 'v1-a');
  assert.equal(r.clips[0].status, 'present');
});

test('เปลี่ยนชื่อ: คลิปเดิม ป้ายไม่หาย เก็บชื่อเก่าไว้', () => {
  const first = reconcile([], [f('v1-a', '/m/a.mp4')], new Set(['/m/a.mp4']), 1).clips;
  const tagged = first.map((c) => ({ ...c, arcId: 'baratie', episode: 21, notes: 'ซันจิ' }));
  const s = [f('v1-a', '/m/EP21.mp4')];
  const r = reconcile(tagged, s, paths(...s), 2);
  assert.equal(r.stats.renamed, 1);
  assert.equal(r.clips.length, 1);
  assert.equal(r.clips[0].name, 'EP21.mp4');
  assert.equal(r.clips[0].arcId, 'baratie');
  assert.equal(r.clips[0].history[0].name, 'a.mp4');
});

test('ย้ายโฟลเดอร์ + ชื่อเดิม', () => {
  const old = reconcile([], [f('v1-a', '/m/a.mp4')], new Set(['/m/a.mp4']), 1).clips;
  const r = reconcile(old, [f('v1-a', '/n/a.mp4')], new Set(['/n/a.mp4']), 2);
  assert.equal(r.stats.moved, 1);
  assert.equal(r.clips[0].folder, '/n');
});

test('ไม่เปลี่ยนอะไร = unchanged', () => {
  const s = [f('v1-a', '/m/a.mp4')];
  const old = reconcile([], s, paths(...s), 1).clips;
  assert.equal(reconcile(old, s, paths(...s), 2).stats.unchanged, 1);
});

test('ไฟล์หาย → ทำเครื่องหมาย missing ไม่ลบ · กลับมาแล้วเป็นปกติ', () => {
  const s = [f('v1-a', '/m/a.mp4')];
  const old = reconcile([], s, paths(...s), 1).clips.map((c) => ({ ...c, arcId: 'zou' }));
  const gone = reconcile(old, [], new Set(), 2);
  assert.equal(gone.stats.missing, 1);
  assert.equal(gone.clips[0].status, 'missing');
  assert.equal(gone.clips[0].arcId, 'zou');
  const back = reconcile(gone.clips, s, paths(...s), 3);
  assert.equal(back.stats.back, 1);
  assert.equal(back.clips[0].status, 'present');
});

test('ไฟล์ที่ถูกกรองชื่อออก (ยังอยู่ในเครื่อง) ไม่ถูกนับว่าหาย', () => {
  const old = reconcile([], [f('v1-a', '/m/a.mp4')], new Set(['/m/a.mp4']), 1).clips;
  const r = reconcile(old, [], new Set(['/m/a.mp4']), 2);
  assert.equal(r.stats.missing, 0);
  assert.equal(r.clips[0].status, 'present');
});

test('ไฟล์ซ้ำ (เนื้อหาเดียวกัน 2 ที่): คลิปเดียว + สำเนา ไม่ลบอะไร', () => {
  const s = [f('v1-a', '/m/a.mp4'), f('v1-a', '/m/copy/a (1).mp4')];
  const r = reconcile([], s, paths(...s), 1);
  assert.equal(r.clips.length, 1);
  assert.equal(r.stats.duplicates, 1);
  const g = duplicateGroups(r.clips);
  assert.equal(g.length, 1);
  assert.equal(g[0].locations.length, 2);
});

test('path ถูกไฟล์อื่นเข้ามาแทน → คลิปเก่าเป็น missing', () => {
  const old = reconcile([], [f('v1-a', '/m/a.mp4')], new Set(['/m/a.mp4']), 1).clips;
  const s = [f('v1-b', '/m/a.mp4')];
  const r = reconcile(old, s, paths(...s), 2);
  assert.equal(r.clips.find((c) => c.id === 'v1-a').status, 'missing');
  assert.equal(r.clips.find((c) => c.id === 'v1-b').status, 'present');
});
