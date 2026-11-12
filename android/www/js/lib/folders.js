// ตัวกรองโฟลเดอร์ (แยกจากตัวกรองชื่อไฟล์) + ตัวนับคลิป/ไฟล์ซ้ำที่ใช้ร่วมกันทุกหน้า
// ขอบเขตโฟลเดอร์ = path แบบสัมพัทธ์จากที่เก็บข้อมูล เช่น "Pictures/Gallery/owner" (รวมโฟลเดอร์ย่อยทั้งหมดเสมอ) · ว่าง = ทุกโฟลเดอร์
export const DEFAULT_SCOPE = 'Pictures/Gallery/owner';

const stripRoot = (p) => String(p).replace(/\\/g, '/').replace(/^web:/, '').replace(/^\/(?:storage\/(?:emulated\/\d+|self\/primary|[^/]+)|data\/media\/\d+|mnt\/media_rw\/[^/]+|mnt\/sdcard|sdcard)\//, '').replace(/^\/+/, '');

/** โฟลเดอร์ของไฟล์ แบบสัมพัทธ์ ("Pictures/Gallery/owner/a") · ไฟล์ที่ไม่มีโฟลเดอร์ = "" */
export function relativeDir(path) {
  const p = stripRoot(path);
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

/** ทำความสะอาดข้อความที่ผู้ใช้พิมพ์/เลือก: ตัดคำนำหน้า /storage/emulated/0/ และ / หัวท้าย */
export const normScope = (s) => stripRoot(String(s ?? '').trim()).replace(/\/+$/, '');

/** ไฟล์นี้อยู่ในขอบเขตไหม (รวมโฟลเดอร์ย่อย · ไม่สนตัวพิมพ์) */
export function inScope(path, scope) {
  const sc = normScope(scope).toLowerCase();
  if (!sc) return true;
  const d = relativeDir(path).toLowerCase();
  return d === sc || d.startsWith(`${sc}/`);
}

export const locationsOf = (c) => [{ path: c.path, name: c.name }, ...(c.copies || [])];

/** คลิปนี้เห็นในขอบเขตไหม: ตัวหลักหรือสำเนาตัวใดตัวหนึ่งอยู่ในโฟลเดอร์ที่เลือก */
export const visibleInScope = (c, scope) => !normScope(scope) || locationsOf(c).some((l) => inScope(l.path, scope));
export const scopeClips = (clips, scope) => clips.filter((c) => visibleInScope(c, scope));

/** ไฟล์ของคลิปที่อยู่ในโฟลเดอร์ที่เลือกจริง (ตัวหลัก + สำเนา) */
export const locationsInScope = (c, scope) => locationsOf(c).filter((l) => inScope(l.path, scope));

/**
 * ตัวนับกลาง (หน้าคลัง/ตรวจซ้ำ/ตั้งค่า/สรุปสแกน ใช้ชุดเดียวกัน → ตัวเลขต้องตรงกัน)
 * นับเฉพาะไฟล์ที่อยู่ในโฟลเดอร์ที่เลือกจริง:  ไฟล์ = คลิป + ไฟล์ซ้ำเกิน  (นับเฉพาะคลิปที่ไฟล์ยังอยู่)
 */
export function libraryCounts(clips, scope) {
  const visible = scopeClips(clips, scope);
  const present = visible.filter((c) => c.status === 'present');
  const files = present.reduce((n, c) => n + Math.max(1, locationsInScope(c, scope).length), 0);
  return {
    clips: present.length, copies: files - present.length, files,
    dupGroups: present.filter((c) => locationsInScope(c, scope).length > 1).length,
    missing: visible.length - present.length,
    hidden: clips.length - visible.length, // อยู่นอกโฟลเดอร์ที่เลือก (ซ่อน ไม่ได้ลบ)
    total: clips.length,
  };
}

/** กลุ่มไฟล์เนื้อหาเดียวกันตั้งแต่ 2 ที่ขึ้นไปภายในโฟลเดอร์ที่เลือก (ดูอย่างเดียว ไม่มีการลบ) */
export function scopedDuplicateGroups(clips, scope) {
  return scopeClips(clips, scope)
    .filter((c) => c.status === 'present')
    .map((c) => ({ id: c.id, name: c.name, size: c.size, locations: locationsInScope(c, scope) }))
    .filter((g) => g.locations.length > 1)
    .sort((a, b) => b.size * b.locations.length - a.size * a.locations.length);
}

/** ต้นไม้โฟลเดอร์จากรายการ path: [{dir, depth, own, total}] — total รวมโฟลเดอร์ย่อย */
export function folderTree(paths) {
  const map = new Map();
  const bump = (dir, own) => { const e = map.get(dir) || { dir, own: 0, total: 0 }; e.total++; if (own) e.own++; map.set(dir, e); };
  for (const p of paths) {
    const d = relativeDir(p);
    if (!d) continue;
    const parts = d.split('/');
    for (let i = 1; i <= parts.length; i++) bump(parts.slice(0, i).join('/'), i === parts.length);
  }
  return [...map.values()].map((e) => ({ ...e, depth: e.dir.split('/').length - 1 }))
    .sort((a, b) => a.dir.toLowerCase().localeCompare(b.dir.toLowerCase()));
}
