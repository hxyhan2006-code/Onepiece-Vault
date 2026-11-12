// สะพานไปยังเนทีฟ Android (ปลั๊กอิน OPVault) · นอก APK (เบราว์เซอร์/ทดสอบ) ใช้โหมดสำรอง: เลือกไฟล์เองด้วยตัวเลือกไฟล์
// ทุกอย่างอ่านอย่างเดียว ไม่มีฟังก์ชันย้าย/ลบไฟล์
import { fingerprintFile } from './lib/fingerprint.js';

const cap = globalThis.Capacitor;
const plugin = cap?.isNativePlatform?.() ? cap.Plugins?.OPVault : null;
export const isNative = !!plugin;

const webFiles = new Map(); // path -> File (โหมดเบราว์เซอร์ ค้างอยู่แค่ในหน้านี้)

export async function ensureAccess() {
  if (!isNative) return true;
  if ((await plugin.hasAccess()).granted) return true;
  return (await plugin.requestAccess()).granted;
}

/** รายการวิดีโอทั้งหมดในเครื่อง (native) หรือไฟล์ที่เพิ่งเลือก (เบราว์เซอร์) */
export async function listVideos(pickedFiles) {
  if (isNative) return (await plugin.listVideos()).items;
  return [...pickedFiles].map((f) => {
    const path = `web:${f.webkitRelativePath || f.name}`;
    webFiles.set(path, f);
    return { uri: path, name: f.name, path, size: f.size, mtime: f.lastModified, durationMs: 0, w: 0, h: 0, file: f };
  });
}

export async function fingerprintOf(item) {
  if (isNative) return (await plugin.fingerprint({ uri: item.uri })).fp;
  return fingerprintFile(item.file || webFiles.get(item.path));
}

function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type });
}

async function webThumb(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('เปิดวิดีโอไม่ได้')); setTimeout(() => rej(new Error('ช้าเกินไป')), 15000); });
    await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(1, (v.duration || 1) / 3); });
    const c = document.createElement('canvas');
    c.width = 240; c.height = Math.max(1, Math.round(240 * v.videoHeight / v.videoWidth));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.72));
    return { blob, durationMs: Math.round((v.duration || 0) * 1000), w: v.videoWidth, h: v.videoHeight };
  } finally { URL.revokeObjectURL(url); }
}

/** คืน { blob, durationMs?, w?, h? } — ภาพตัวอย่างสร้างในเครื่อง ไม่ส่งออกไปไหน */
export async function makeThumb(clip) {
  if (isNative) return { blob: b64ToBlob((await plugin.thumbnail({ uri: clip.uri, durationMs: clip.durationMs })).data, 'image/jpeg') };
  const f = webFiles.get(clip.path);
  if (!f) throw new Error('ไฟล์ไม่ได้อยู่ในหน้านี้แล้ว');
  return webThumb(f);
}

/** ลิงก์เล่นวิดีโอ (null = เล่นไม่ได้ในตอนนี้) */
export function playUrl(clip) {
  if (isNative) return cap.convertFileSrc(`file://${clip.path}`);
  const f = webFiles.get(clip.path);
  return f ? URL.createObjectURL(f) : null;
}

export const openExternal = (clip) => (isNative ? plugin.openExternal({ uri: clip.uri }) : Promise.reject(new Error('ใช้ได้เฉพาะในแอปแอนดรอยด์')));

/** ส่งข้อความเป็นไฟล์ออกไป (APK: หน้าต่างแชร์ · เบราว์เซอร์: ดาวน์โหลด) */
export async function shareText(name, text, mime = 'application/json') {
  if (isNative) return plugin.shareFile({ name, text, mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
