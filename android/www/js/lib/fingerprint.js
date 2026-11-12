// ลายนิ้วมือไฟล์ (fingerprint): จำไฟล์จากเนื้อหา ไม่ใช่ชื่อ/ที่อยู่ — เปลี่ยนชื่อหรือย้ายโฟลเดอร์แล้วยังเป็นไฟล์เดิม
// สูตร (ต้องตรงกับ native/java/.../Fingerprint.java ทุกตัวอักษร มีเทสต์เทียบ):
//   SHA-256( "OPV1|<ขนาดไฟล์>|" + ข้อมูล 3 ช่วง ช่วงละ 256 KB: ต้นไฟล์ กลางไฟล์ ท้ายไฟล์ ) · ไฟล์ ≤ 768 KB ใช้ทั้งไฟล์
// อ่านแค่ ~768 KB ต่อไฟล์ จึงสแกนไฟล์เป็นพันได้เร็วโดยไม่อ่านทั้งไฟล์
export const CHUNK = 256 * 1024;
export const PREFIX = 'v1-';

export function sampleRanges(size) {
  if (size <= 0) return [];
  if (size <= CHUNK * 3) return [{ offset: 0, length: size }];
  return [0, Math.floor((size - CHUNK) / 2), size - CHUNK].map((offset) => ({ offset, length: CHUNK }));
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** readRange(offset, length) => Promise<ArrayBuffer|Uint8Array> */
export async function fingerprint(size, readRange) {
  const parts = [new TextEncoder().encode(`OPV1|${size}|`)];
  for (const r of sampleRanges(size)) parts.push(new Uint8Array(await readRange(r.offset, r.length)));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return PREFIX + hex(await crypto.subtle.digest('SHA-256', all));
}

export const fingerprintFile = (file) => fingerprint(file.size, (o, l) => file.slice(o, o + l).arrayBuffer());
