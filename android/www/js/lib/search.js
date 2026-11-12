// ค้นหาในคลังฟุตเทจ (ชื่อไฟล์ ที่อยู่ ตัวละคร บันทึก Arc/Saga ตอน) · หลายคำ = ต้องตรงทุกคำ
import { findArc } from './taxonomy.js';
const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase();

export function searchClips(clips, tax, q = {}) {
  const tokens = String(q.text || '').split(/\s+/).filter(Boolean).map(norm);
  const out = clips.filter((c) => {
    if (q.status === 'missing' ? c.status !== 'missing' : q.status !== 'all' && c.status === 'missing') return false;
    if (q.tagged === 'no' && c.arcId) return false;
    if (q.tagged === 'yes' && !c.arcId) return false;
    if (q.sagaId || q.arcId) {
      const a = findArc(tax, c.arcId);
      if (!a || (q.arcId && a.arc.id !== q.arcId) || (q.sagaId && a.saga.id !== q.sagaId)) return false;
    }
    if (!tokens.length) return true;
    const a = findArc(tax, c.arcId);
    const hay = norm([c.name, c.path, c.notes, ...(c.characters || []), a?.arc.name, a?.saga.name,
      c.episode != null ? `ep${c.episode} ตอน${c.episode}` : ''].join('\n'));
    return tokens.every((t) => {
      const ep = t.match(/^(?:ep|ตอน)\.?(\d+)$/);
      if (ep) return c.episode === Number(ep[1]);
      return hay.includes(t);
    });
  });
  return out.sort((a, b) => (a.episode ?? 1e9) - (b.episode ?? 1e9) || a.name.localeCompare(b.name));
}

export function topCharacters(clips, limit = 12) {
  const n = new Map();
  for (const c of clips) for (const v of c.characters || []) n.set(v, (n.get(v) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([v]) => v);
}

/** ตัวกรองชื่อไฟล์ตอนสแกน: ไม่สนตัวพิมพ์/ขีด/ขีดล่าง/ช่องว่าง (Screenrecorder-… = screen_recorder …) · ว่าง = เอาทุกไฟล์ */
export const nameMatcher = (filter) => {
  const f = String(filter || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return (name) => !f || String(name).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').includes(f);
};
