// แปลงเวลา <-> วินาที  (รองรับ "90", "1:30", "01:02:03")

/** @returns {number|null} วินาที หรือ null ถ้ารูปแบบไม่ถูกต้อง */
export function parseTimecode(input) {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.floor(input) : null;
  const text = String(input ?? '').trim();
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p.trim()))) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.length > 1 && nums.slice(1).some((n) => n > 59)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatTimecode(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
