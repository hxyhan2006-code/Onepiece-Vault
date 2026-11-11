// ค้นหา Scene ตาม Episode / ตัวละคร / เหตุการณ์ / Timestamp
import { parseTimecode } from './timecode.js';

const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase();

/** รวมรายการ (เช่น ตัวละคร) ที่ไม่ซ้ำและเรียงตามความถี่ */
export function topValues(scenes, field, limit = 12) {
  const count = new Map();
  for (const sc of scenes) for (const v of sc[field] || []) count.set(v, (count.get(v) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([v]) => v);
}

function matchToken(token, scene, episode) {
  const t = norm(token);
  // "ep12" / "ตอน12" -> เลข Episode
  const ep = t.match(/^(?:ep|ตอน)\.?\s*(\d+)$/);
  if (ep) return episode && episode.number === Number(ep[1]);
  // "12:30" -> Timestamp อยู่ในช่วงของ Scene
  if (t.includes(':')) {
    const sec = parseTimecode(t);
    if (sec !== null) {
      const end = scene.end ?? scene.start;
      return sec >= scene.start && sec <= end;
    }
  }
  const hay = [scene.title, scene.notes, ...(scene.characters || []), ...(scene.events || []),
    episode?.title, episode ? `ep${episode.number} ตอน${episode.number}` : '']
    .map(norm).join('\n');
  return hay.includes(t);
}

/**
 * @param {{text?:string, episodeId?:string, character?:string}} q
 * ทุกคำ (คั่นด้วยช่องว่าง) ต้องตรงกัน (AND)
 */
export function searchScenes(scenes, episodes, q = {}) {
  const byId = new Map(episodes.map((e) => [e.id, e]));
  const tokens = String(q.text || '').split(/\s+/).filter(Boolean);
  const out = scenes.filter((sc) => {
    if (q.episodeId && sc.episodeId !== q.episodeId) return false;
    if (q.character && !(sc.characters || []).includes(q.character)) return false;
    const ep = byId.get(sc.episodeId);
    return tokens.every((tk) => matchToken(tk, sc, ep));
  });
  return out.sort((a, b) => {
    const ea = byId.get(a.episodeId)?.number ?? 0;
    const eb = byId.get(b.episodeId)?.number ?? 0;
    return ea - eb || a.start - b.start;
  });
}
