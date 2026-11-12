import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TAXONOMY as T, findArc } from '../www/js/lib/taxonomy.js';
import { buildPlan, targetDir, safeName, planToText } from '../www/js/lib/plan.js';
import { searchClips, nameMatcher, topCharacters } from '../www/js/lib/search.js';
import { buildBackup, validateBackup, mergeBackup } from '../www/js/lib/backup.js';

const clip = (id, o = {}) => ({ id, name: `${id}.mp4`, path: `/m/${id}.mp4`, folder: '/m', size: 1, status: 'present', copies: [], arcId: '', episode: null, characters: [], notes: '', ...o });

test('taxonomy: id ไม่ซ้ำ และหา Arc ได้', () => {
  const ids = T.sagas.flatMap((s) => s.arcs.map((a) => a.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(findArc(T, 'baratie').saga.id, 'east-blue');
  assert.equal(findArc(T, 'nope'), null);
});

test('plan: โฟลเดอร์ Saga → Arc → ตอน และเป็น dryRun เสมอ', () => {
  const dir = targetDir('/r', T, clip('a', { arcId: 'baratie', episode: 21 }));
  assert.match(dir, /^\/r\/01 - East Blue\/04 - Baratie\/EP0021$/);
  const plan = buildPlan([clip('a', { arcId: 'baratie', episode: 21 }), clip('b'), clip('c', { status: 'missing', arcId: 'zou' })], T, '/r');
  assert.equal(plan.dryRun, true);
  assert.deepEqual([plan.summary.ready, plan.summary['skip-untagged'], plan.summary['skip-missing']], [1, 1, 1]);
  assert.match(planToText(plan), /ยังไม่ได้ย้ายจริง/);
});

test('plan: ชื่อปลายทางชน / อยู่ถูกที่แล้ว / ตอนไม่ระบุ', () => {
  const a = clip('a', { name: 'x.mp4', path: '/m/x.mp4', arcId: 'zou', episode: 1 });
  const b = clip('b', { name: 'x.mp4', path: '/n/x.mp4', arcId: 'zou', episode: 1 });
  const p = buildPlan([a, b], T, '/r');
  assert.deepEqual(p.items.map((i) => i.state).sort(), ['conflict', 'ready']);
  const dir = targetDir('/r', T, a);
  const same = buildPlan([clip('s', { path: `${dir}/s.mp4`, arcId: 'zou', episode: 1 })], T, '/r');
  assert.equal(same.items[0].state, 'same');
  const noEp = buildPlan([clip('n', { arcId: 'zou' })], T, '/r');
  assert.match(noEp.items[0].to, /ไม่ระบุตอน/);
});

test('plan: คลิปมีสำเนาซ้ำ แจ้งจำนวนสำเนา ไม่วางแผนสำเนา', () => {
  const p = buildPlan([clip('a', { arcId: 'zou', copies: [{ path: '/q/a.mp4', name: 'a.mp4' }] })], T, '/r');
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].dupCopies, 1);
});

test('safeName ตัดอักขระต้องห้าม', () => assert.equal(safeName('a:b/c*?.mp4 '), 'a_b_c__.mp4'));

test('search: ตัวละคร/ตอน/Arc/สถานะ', () => {
  const cs = [clip('a', { characters: ['ลูฟี่'], arcId: 'baratie', episode: 21 }), clip('b', { notes: 'ซันจิ' }), clip('c', { status: 'missing' })];
  assert.equal(searchClips(cs, T, { text: 'ลูฟี่' }).length, 1);
  assert.equal(searchClips(cs, T, { text: 'ep21' }).length, 1);
  assert.equal(searchClips(cs, T, { text: 'ตอน21 baratie' }).length, 1);
  assert.equal(searchClips(cs, T, { sagaId: 'east-blue' }).length, 1);
  assert.equal(searchClips(cs, T, { tagged: 'no' }).length, 1);
  assert.equal(searchClips(cs, T, { status: 'missing' }).length, 1);
  assert.equal(searchClips(cs, T, { status: 'all' }).length, 3);
  assert.deepEqual(topCharacters(cs), ['ลูฟี่']);
});

test('nameMatcher: Screenrecorder ไม่สนขีด/ตัวพิมพ์; ว่าง = ทุกไฟล์', () => {
  const m = nameMatcher('Screenrecorder');
  assert.ok(m('Screenrecorder-20240101.mp4') && m('screen_recorder 1.mp4') && !m('IMG_001.mp4'));
  assert.ok(nameMatcher('')('anything.mp4'));
});

test('backup: ส่งออก→ตรวจ→รวม และปฏิเสธไฟล์ผิด', () => {
  const cs = [clip('v1-a', { arcId: 'zou', episode: 3, updatedAt: 5 })];
  const back = validateBackup(JSON.stringify(buildBackup(cs)));
  assert.equal(back[0].arcId, 'zou');
  const m = mergeBackup([], back, 9);
  assert.equal(m.added, 1);
  assert.equal(m.clips[0].status, 'missing'); // รอสแกนเจอไฟล์ด้วยลายนิ้วมือ
  const newer = mergeBackup(m.clips, [{ ...back[0], episode: 4, updatedAt: 7 }], 10);
  assert.equal(newer.updated, 1);
  assert.equal(newer.clips[0].episode, 4);
  assert.throws(() => validateBackup('x'), /JSON/);
  assert.throws(() => validateBackup({ app: 'other' }), /ไม่ใช่ข้อมูลสำรอง/);
});
