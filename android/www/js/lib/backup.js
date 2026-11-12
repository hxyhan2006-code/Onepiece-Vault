// สำรอง/กู้คืนป้ายและรายการคลิป (JSON) — ไม่รวมวิดีโอและภาพตัวอย่าง · ไฟล์สำรองกู้คืนแล้วจะจับคู่กับไฟล์จริงด้วยลายนิ้วมือตอนสแกนครั้งถัดไป
export const APP_ID = 'onepiece-vault-android';
export const BACKUP_VERSION = 1;
const str = (v, n = 2000) => String(v ?? '').slice(0, n);

export function buildBackup(clips, now = new Date()) {
  return { app: APP_ID, version: BACKUP_VERSION, exportedAt: now.toISOString(),
    clips: clips.map(({ id, name, path, size, durationMs, w, h, arcId, episode, characters, notes, updatedAt, history, firstSeen }) =>
      ({ id, name, path, size, durationMs, w, h, arcId, episode, characters, notes, updatedAt, history, firstSeen })) };
}

export function validateBackup(raw) {
  let d = raw;
  if (typeof raw === 'string') { try { d = JSON.parse(raw); } catch { throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'); } }
  if (!d || d.app !== APP_ID) throw new Error('ไฟล์นี้ไม่ใช่ข้อมูลสำรองของ Onepiece Vault (แอนดรอยด์)');
  if (d.version > BACKUP_VERSION) throw new Error('ไฟล์สำรองมาจากเวอร์ชันที่ใหม่กว่า กรุณาอัปเดตแอป');
  if (!Array.isArray(d.clips)) throw new Error('โครงสร้างข้อมูลสำรองไม่ครบ');
  const clips = [];
  const seen = new Set();
  for (const c of d.clips) {
    if (!c || typeof c.id !== 'string' || !c.id.startsWith('v1-') || seen.has(c.id)) continue;
    seen.add(c.id);
    const ep = c.episode === null || c.episode === undefined || c.episode === '' ? null : Number(c.episode);
    clips.push({ id: c.id, name: str(c.name, 300), path: str(c.path, 1000), size: Number(c.size) || 0, durationMs: Number(c.durationMs) || 0,
      w: Number(c.w) || 0, h: Number(c.h) || 0, arcId: str(c.arcId, 100), episode: Number.isInteger(ep) && ep >= 0 ? ep : null,
      characters: Array.isArray(c.characters) ? c.characters.map((x) => str(x, 200).trim()).filter(Boolean) : [],
      notes: str(c.notes, 5000), updatedAt: Number(c.updatedAt) || 0, firstSeen: Number(c.firstSeen) || 0,
      history: Array.isArray(c.history) ? c.history.slice(-20).map((h) => ({ name: str(h?.name, 300), path: str(h?.path, 1000), at: Number(h?.at) || 0 })) : [] });
  }
  return clips;
}

/** รวมข้อมูลสำรองเข้าฐานข้อมูลปัจจุบัน: คลิปที่ยังไม่มีเข้ามาเป็น "ไฟล์หาย" (จะกลับเป็นปกติเมื่อสแกนเจอไฟล์) · คลิปที่มีแล้วเอาป้ายที่ใหม่กว่า */
export function mergeBackup(existing, incoming, now = Date.now()) {
  const byId = new Map(existing.map((c) => [c.id, c]));
  let added = 0, updated = 0;
  for (const b of incoming) {
    const cur = byId.get(b.id);
    if (!cur) {
      byId.set(b.id, { ...b, uri: '', folder: b.path.slice(0, Math.max(0, b.path.lastIndexOf('/'))), mtime: 0, status: 'missing', lastSeen: 0, copies: [], firstSeen: b.firstSeen || now });
      added++;
    } else if (b.updatedAt > (cur.updatedAt || 0)) {
      byId.set(b.id, { ...cur, arcId: b.arcId, episode: b.episode, characters: b.characters, notes: b.notes, updatedAt: b.updatedAt });
      updated++;
    }
  }
  return { clips: [...byId.values()], added, updated };
}
