// สำรอง/กู้คืนข้อมูล JSON (เฉพาะ metadata — ไม่รวมไฟล์วิดีโอ)
export const APP_ID = 'onepiece-vault';
export const BACKUP_VERSION = 1;

const str = (v, max = 2000) => String(v ?? '').slice(0, max);
const list = (v) => (Array.isArray(v) ? v.map((x) => str(x, 200).trim()).filter(Boolean) : []);

export function buildBackup(episodes, scenes, now = new Date()) {
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    episodes: episodes.map(({ id, number, title, videoName }) => ({ id, number, title, videoName: videoName || '' })),
    scenes: scenes.map((s) => ({ ...s })),
  };
}

/** ตรวจและทำความสะอาดข้อมูลที่นำเข้า — โยน Error ภาษาไทยถ้าไฟล์ไม่ถูกต้อง */
export function validateBackup(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'); }
  }
  if (!data || data.app !== APP_ID) throw new Error('ไฟล์นี้ไม่ใช่ข้อมูลสำรองของ Onepiece Vault');
  if (data.version > BACKUP_VERSION) throw new Error('ไฟล์สำรองมาจากเวอร์ชันที่ใหม่กว่า กรุณาอัปเดตแอป');
  if (!Array.isArray(data.episodes) || !Array.isArray(data.scenes)) throw new Error('โครงสร้างข้อมูลสำรองไม่ครบ');

  const episodes = [];
  const ids = new Set();
  for (const e of data.episodes) {
    if (!e || !e.id || ids.has(e.id)) continue;
    const number = Number(e.number);
    if (!Number.isInteger(number) || number < 0) continue;
    ids.add(e.id);
    episodes.push({ id: str(e.id, 100), number, title: str(e.title, 200), videoName: str(e.videoName, 300) });
  }
  const scenes = [];
  const sceneIds = new Set();
  for (const s of data.scenes) {
    if (!s || !s.id || sceneIds.has(s.id) || !ids.has(s.episodeId)) continue;
    const start = Number(s.start);
    if (!Number.isFinite(start) || start < 0) continue;
    const end = s.end === null || s.end === undefined || s.end === '' ? null : Number(s.end);
    sceneIds.add(s.id);
    scenes.push({
      id: str(s.id, 100), episodeId: s.episodeId, start: Math.floor(start),
      end: Number.isFinite(end) && end >= start ? Math.floor(end) : null,
      title: str(s.title, 200), characters: list(s.characters), events: list(s.events),
      notes: str(s.notes, 5000), updatedAt: Number(s.updatedAt) || 0,
    });
  }
  return { episodes, scenes };
}

/**
 * รวมข้อมูลนำเข้ากับข้อมูลปัจจุบัน
 * mode 'merge' = id เดียวกันใช้ของที่นำเข้าทับ, 'replace' = แทนที่ทั้งหมด
 * Episode ที่ id ตรงกับของเดิมจะคงสถานะวิดีโอ (hasVideo/videoSize) ไว้
 */
export function applyImport(current, incoming, mode = 'merge') {
  const prev = new Map(current.episodes.map((e) => [e.id, e]));
  const withVideo = (e) => {
    const old = prev.get(e.id);
    return { ...e, hasVideo: !!old?.hasVideo, videoSize: old?.videoSize || 0, videoName: old?.hasVideo ? old.videoName : e.videoName };
  };
  const inEps = incoming.episodes.map(withVideo);
  if (mode === 'replace') return { episodes: inEps, scenes: incoming.scenes.slice() };

  const eps = new Map(current.episodes.map((e) => [e.id, e]));
  for (const e of inEps) eps.set(e.id, e);
  const scs = new Map(current.scenes.map((s) => [s.id, s]));
  for (const s of incoming.scenes) scs.set(s.id, s);
  return { episodes: [...eps.values()], scenes: [...scs.values()] };
}
