// จับคู่ผลสแกนกับฐานข้อมูล โดยใช้ลายนิ้วมือ (id ของคลิป = fingerprint)
// → ไฟล์ที่เปลี่ยนชื่อ/ย้ายที่ ยังเป็นคลิปเดิม ป้ายที่ติดไว้ไม่หาย · ไม่มีการลบคลิปออกจากฐานข้อมูล แค่ทำเครื่องหมาย "ไฟล์หาย"
export const folderOf = (p) => String(p).slice(0, Math.max(0, String(p).lastIndexOf('/')));
const pickFile = (s) => ({ name: s.name, path: s.path, uri: s.uri || '', folder: folderOf(s.path), size: s.size, mtime: s.mtime || 0, durationMs: s.durationMs || 0, w: s.w || 0, h: s.h || 0 });

/**
 * @param existing  คลิปในฐานข้อมูล
 * @param scanned   ไฟล์ที่สแกนแล้ว [{fp, name, path, uri, size, mtime, ...}]
 * @param listedPaths Set ของ path ทั้งหมดที่ระบบเห็นในเครื่อง (รวมไฟล์ที่ไม่ผ่านตัวกรองชื่อ) — ใช้ตัดสินว่าไฟล์ "หาย" หรือแค่ถูกกรองออก
 */
export function reconcile(existing, scanned, listedPaths, now = Date.now()) {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const out = new Map(byId);
  const groups = new Map();
  const claimed = new Set();
  for (const s of scanned) {
    if (!s.fp) continue;
    claimed.add(s.path);
    if (!groups.has(s.fp)) groups.set(s.fp, []);
    groups.get(s.fp).push(s);
  }
  const stats = { added: 0, renamed: 0, moved: 0, missing: 0, back: 0, unchanged: 0, duplicates: 0 };
  const events = [];

  for (const [fp, items] of groups) {
    items.sort((a, b) => a.path.localeCompare(b.path));
    const old = byId.get(fp);
    const primary = (old && items.find((i) => i.path === old.path)) || items[0];
    const copies = items.filter((i) => i !== primary).map(({ path, name, uri }) => ({ path, name, uri: uri || '' }));
    if (copies.length) stats.duplicates++;
    if (!old) {
      out.set(fp, { id: fp, ...pickFile(primary), status: 'present', firstSeen: now, lastSeen: now, copies, history: [],
        arcId: '', episode: null, characters: [], notes: '', updatedAt: 0 });
      stats.added++;
      events.push({ type: 'added', id: fp, to: primary.path });
      continue;
    }
    const next = { ...old, ...pickFile(primary), status: 'present', lastSeen: now, copies };
    if (old.status === 'missing') stats.back++;
    if (primary.path !== old.path) {
      const type = folderOf(primary.path) === folderOf(old.path) ? 'renamed' : 'moved';
      stats[type]++;
      events.push({ type, id: fp, from: old.path, to: primary.path });
      next.history = [...(old.history || []), { name: old.name, path: old.path, at: now }].slice(-20);
    } else if (old.status !== 'missing') stats.unchanged++;
    out.set(fp, next);
  }

  for (const [id, c] of byId) {
    if (groups.has(id) || c.status === 'missing') continue;
    if (!listedPaths.has(c.path) || claimed.has(c.path)) {
      out.set(id, { ...c, status: 'missing', copies: [] });
      stats.missing++;
      events.push({ type: 'missing', id, from: c.path });
    }
  }
  return { clips: [...out.values()], stats, events };
}

/** กลุ่มไฟล์ที่เนื้อหาเหมือนกันแต่อยู่หลายที่ (ตรวจซ้ำ — ใช้แสดงผลเท่านั้น ไม่มีการลบ) */
export function duplicateGroups(clips) {
  return clips
    .filter((c) => c.status === 'present' && c.copies?.length)
    .map((c) => ({ id: c.id, name: c.name, size: c.size, locations: [{ path: c.path, name: c.name }, ...c.copies] }))
    .sort((a, b) => b.size * b.locations.length - a.size * a.locations.length);
}
