import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeDir, normScope, inScope, visibleInScope, scopeClips, libraryCounts, folderTree, DEFAULT_SCOPE } from '../www/js/lib/folders.js';
import { reconcile } from '../www/js/lib/reconcile.js';

const R = '/storage/emulated/0/';
const it = (fp, rel, extra = {}) => ({ fp, name: rel.split('/').pop(), path: R + rel, uri: `content://${fp}`, size: 100, mtime: 1, ...extra });
const paths = (xs) => new Set(xs.map((x) => x.path));

test('relativeDir: ตัดคำนำหน้าที่เก็บข้อมูลทุกแบบ', () => {
  assert.equal(relativeDir(`${R}Pictures/Gallery/owner/a.mp4`), 'Pictures/Gallery/owner');
  assert.equal(relativeDir('/storage/1234-ABCD/DCIM/x/a.mp4'), 'DCIM/x');
  assert.equal(relativeDir('/sdcard/Movies/a.mp4'), 'Movies');
  assert.equal(relativeDir('web:Pictures/Gallery/a.webm'), 'Pictures/Gallery');
  assert.equal(relativeDir('web:a.webm'), '');
  assert.equal(relativeDir('content:123'), '');
});

test('inScope: รวมโฟลเดอร์ย่อยทุกชั้น ไม่สนตัวพิมพ์ ไม่เหมาจากชื่อขึ้นต้นคล้ายกัน', () => {
  const s = DEFAULT_SCOPE;
  assert.ok(inScope(`${R}Pictures/Gallery/owner/a.mp4`, s));
  assert.ok(inScope(`${R}Pictures/Gallery/owner/sub/deep/er/a.mp4`, s));
  assert.ok(inScope(`${R}pictures/gallery/OWNER/a.mp4`, s));
  assert.ok(!inScope(`${R}Pictures/Gallery/owner2/a.mp4`, s));
  assert.ok(!inScope(`${R}Pictures/Gallery/ownerx/sub/a.mp4`, s));
  assert.ok(!inScope(`${R}Pictures/Gallery/a.mp4`, s));
  assert.ok(!inScope(`${R}Download/a.mp4`, s));
  assert.ok(inScope(`${R}Download/a.mp4`, '')); // ว่าง = ทุกโฟลเดอร์
});

test('normScope: รับ path เต็ม/มี / หัวท้ายได้', () => {
  assert.equal(normScope('/storage/emulated/0/Pictures/Gallery/owner/'), 'Pictures/Gallery/owner');
  assert.equal(normScope('  Pictures/Gallery/owner// '), 'Pictures/Gallery/owner');
  assert.equal(normScope(''), '');
  assert.ok(inScope(`${R}Pictures/Gallery/owner/x/a.mp4`, '/storage/emulated/0/Pictures/Gallery/owner/'));
});

test('folderTree: จำนวนรวมโฟลเดอร์ย่อย และจำนวนเฉพาะโฟลเดอร์นั้น', () => {
  const t = folderTree([`${R}Pictures/Gallery/owner/a.mp4`, `${R}Pictures/Gallery/owner/b.mp4`, `${R}Pictures/Gallery/owner/s/c.mp4`, `${R}DCIM/d.mp4`, `${R}root.mp4`]);
  const get = (d) => t.find((e) => e.dir === d);
  assert.deepEqual([get('Pictures').total, get('Pictures/Gallery').total, get('Pictures/Gallery/owner').total, get('Pictures/Gallery/owner').own, get('Pictures/Gallery/owner/s').total], [3, 3, 3, 2, 1]);
  assert.equal(get('DCIM').total, 1);
  assert.equal(get('Pictures/Gallery/owner/s').depth, 3);
});

test('การสแกนเฉพาะบางโฟลเดอร์ ไม่ทำให้คลิปนอกโฟลเดอร์กลายเป็น "ไฟล์หาย" และป้ายไม่หาย', () => {
  const all = [it('v1-a', 'Pictures/Gallery/owner/a.mp4'), it('v1-b', 'Download/b.mp4')];
  const first = reconcile([], all, paths(all), 1).clips.map((c) => ({ ...c, arcId: 'zou', episode: 5 }));
  // รอบสอง: เลือกโฟลเดอร์ owner → สแกนเฉพาะ a แต่ระบบยังเห็น b อยู่
  const r = reconcile(first, [all[0]], paths(all), 2);
  assert.equal(r.stats.missing, 0);
  const b = r.clips.find((c) => c.id === 'v1-b');
  assert.equal(b.status, 'present');
  assert.equal(b.arcId, 'zou');
  const c = libraryCounts(r.clips, 'Pictures/Gallery/owner');
  assert.deepEqual([c.clips, c.hidden, c.missing], [1, 1, 0]);
  // เปลี่ยนกลับไปทุกโฟลเดอร์: ทุกคลิปกลับมาแสดงครบ
  assert.equal(libraryCounts(r.clips, '').clips, 2);
});

test('ตัวหลักอยู่นอกโฟลเดอร์ แต่มีสำเนาในโฟลเดอร์ที่เลือก: ไม่ใช่ "ย้ายที่" เป็นสำเนา และคลิปยังเห็นในโฟลเดอร์นั้น', () => {
  const a = it('v1-x', 'Download/x.mp4');
  const first = reconcile([], [a], paths([a]), 1).clips;
  const copyInScope = it('v1-x', 'Pictures/Gallery/owner/x-copy.mp4');
  const r = reconcile(first, [copyInScope], paths([a, copyInScope]), 2);
  assert.equal(r.stats.moved, 0);
  assert.equal(r.clips.length, 1);
  assert.equal(r.clips[0].path, a.path);
  assert.deepEqual(r.clips[0].copies.map((c) => c.path), [copyInScope.path]);
  assert.ok(visibleInScope(r.clips[0], 'Pictures/Gallery/owner'));
  const c = libraryCounts(r.clips, 'Pictures/Gallery/owner');
  assert.deepEqual([c.clips, c.copies, c.files], [1, 0, 1]); // ในโฟลเดอร์นี้มีไฟล์เดียว (ตัวหลักอยู่ข้างนอก)
  assert.equal(libraryCounts(r.clips, '').files, 2); // ดูทุกโฟลเดอร์ = 2 ไฟล์ (1 คลิป + ซ้ำ 1)
});

test('สำเนาที่อยู่นอกขอบเขตสแกนรอบนี้ ยังถูกจำไว้ ไม่หายไปจากข้อมูลไฟล์ซ้ำ', () => {
  const p = it('v1-d', 'Pictures/Gallery/owner/d.mp4');
  const q = it('v1-d', 'Download/d-copy.mp4');
  const first = reconcile([], [p, q], paths([p, q]), 1).clips;
  assert.equal(first[0].copies.length, 1);
  const locs = (c) => [c.path, ...c.copies.map((x) => x.path)].sort();
  const r = reconcile(first, [p], paths([p, q]), 2); // สแกนเฉพาะ owner แต่ระบบยังเห็นสำเนาใน Download
  assert.deepEqual(locs(r.clips[0]), [p.path, q.path].sort());
  assert.equal(r.stats.moved + r.stats.renamed, 0);
  assert.equal(libraryCounts(r.clips, 'Pictures/Gallery/owner').files, 1); // นับเฉพาะไฟล์ในโฟลเดอร์ที่เลือก
  assert.equal(libraryCounts(r.clips, '').files, 2);
  // ถ้าสำเนาใน Download ถูกลบจริง (ระบบไม่เห็นแล้ว) → เหลือไฟล์เดียว ไม่มีไฟล์ซ้ำ
  const gone = reconcile(r.clips, [p], paths([p]), 3);
  assert.equal(gone.clips[0].copies.length, 0);
  assert.equal(gone.clips[0].path, p.path);
  assert.equal(libraryCounts(gone.clips, 'Pictures/Gallery/owner').files, 1);
  assert.equal(libraryCounts(gone.clips, '').files, 1);
});

test('โหมดรายการไม่ครบ (trustListing=false): ไม่ถือว่าไฟล์ที่ไม่ได้เลือกหาย และเปลี่ยนชื่อยังจับได้', () => {
  const a = it('v1-a', 'a.mp4');
  const first = reconcile([], [a], paths([a]), 1).clips;
  const renamed = it('v1-a', 'a-renamed.mp4');
  const r = reconcile(first, [renamed], paths([renamed]), 2, { trustListing: false });
  assert.equal(r.stats.renamed, 1);
  const none = reconcile(first, [], new Set(), 2, { trustListing: false });
  assert.equal(none.stats.missing, 0);
});

test('หลักพันไฟล์ + ไฟล์ซ้ำ + หลายโฟลเดอร์: ตัวเลขทุกที่ตรงกัน และไม่ช้า', () => {
  const N = 4000, files = [];
  for (let i = 0; i < N; i++) {
    const folder = ['Pictures/Gallery/owner', 'Pictures/Gallery/owner/ep', 'Pictures/Gallery/owner/ep/x', 'Download', 'DCIM/Camera'][i % 5];
    files.push(it(`v1-${i % 3700}`, `${folder}/clip-${i}.mp4`)); // 300 ไฟล์ซ้ำเนื้อหา
  }
  const t0 = Date.now();
  const scope = 'Pictures/Gallery/owner';
  const inFolder = files.filter((f) => inScope(f.path, scope));
  const r = reconcile([], inFolder, paths(files), 1);
  assert.ok(Date.now() - t0 < 2000, 'reconcile ช้าเกินไป');
  const c = libraryCounts(r.clips, scope);
  assert.equal(c.files, inFolder.length);            // ไฟล์ทั้งหมดที่สแกน = คลิป + ซ้ำ
  assert.equal(c.files, c.clips + c.copies);
  assert.equal(c.clips, new Set(inFolder.map((f) => f.fp)).size);
  // รอบสองโดยไม่เปลี่ยนอะไร: ตัวเลขเท่าเดิม ไม่มีอะไรเปลี่ยน
  const r2 = reconcile(r.clips, inFolder, paths(files), 2);
  assert.deepEqual(libraryCounts(r2.clips, scope), c);
  assert.equal(r2.stats.added + r2.stats.renamed + r2.stats.moved + r2.stats.missing, 0);
  // สลับเป็นทุกโฟลเดอร์ แล้วสแกนทั้งหมด: นับไฟล์ครบ ไม่ซ้ำไม่ตก
  const r3 = reconcile(r2.clips, files, paths(files), 3);
  const all = libraryCounts(r3.clips, '');
  assert.equal(all.files, files.length);
  assert.equal(all.clips, new Set(files.map((f) => f.fp)).size);
  assert.equal(scopeClips(r3.clips, scope).length, libraryCounts(r3.clips, scope).clips + libraryCounts(r3.clips, scope).missing);
});

test('สแกนเฉพาะโฟลเดอร์: คลิปที่ซ่อนอยู่ไม่ถูกแตะเลย แม้รายการจากระบบจะไม่ครบ', () => {
  const hidden = it('v1-h', 'Movies/h.mp4');
  const first = reconcile([], [hidden], paths([hidden]), 1).clips.map((c) => ({ ...c, arcId: 'zou' }));
  const scope = 'Pictures/Gallery/owner';
  // รายการจากระบบไม่เห็น Movies/h.mp4 เลย (เช่นการ์ดความจำหลุด) แต่เรากำลังสแกนแค่ owner
  const r = reconcile(first, [], new Set(), 2, { canMarkMissing: (c) => visibleInScope(c, scope) });
  assert.equal(r.stats.missing, 0);
  assert.equal(r.clips[0].status, 'present');
  assert.equal(r.clips[0].arcId, 'zou');
  const viz = it('v1-v', 'Pictures/Gallery/owner/v.mp4');
  const f2 = reconcile(r.clips, [viz], paths([viz]), 3).clips;
  const gone = reconcile(f2, [], new Set(), 4, { canMarkMissing: (c) => visibleInScope(c, scope) });
  assert.equal(gone.stats.missing, 1); // คลิปในโฟลเดอร์ที่เลือกหายจริง = ทำเครื่องหมาย
});

test('path ของเครื่องจริงหลายแบบ', () => {
  for (const p of ['/storage/emulated/0/Pictures/Gallery/owner/a.mp4', '/storage/self/primary/Pictures/Gallery/owner/a.mp4', '/data/media/0/Pictures/Gallery/owner/a.mp4',
    '/mnt/sdcard/Pictures/Gallery/owner/a.mp4', '/mnt/media_rw/1A2B-3C4D/Pictures/Gallery/owner/a.mp4', '/storage/1A2B-3C4D/Pictures/Gallery/owner/a.mp4']) {
    assert.equal(relativeDir(p), 'Pictures/Gallery/owner', p);
  }
});
