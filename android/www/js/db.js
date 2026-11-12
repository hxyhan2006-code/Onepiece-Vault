// ชั้นข้อมูลทั้งหมด (IndexedDB 'opv-android'): clips (id = ลายนิ้วมือไฟล์), thumbs (Blob ภาพตัวอย่าง), meta (ตั้งค่า)
// ไม่เก็บวิดีโอ — วิดีโอยังอยู่ที่เดิมในเครื่อง ไม่มีการคัดลอกซ้ำ
const NAME = 'opv-android';
const VERSION = 2; // v2: เพิ่ม store fpcache (จำลายนิ้วมือที่อ่านแล้ว ใช้สแกนต่อจากที่ค้าง) — ข้อมูลเดิมไม่ถูกแตะ
let dbp;

function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [name, keyPath] of [['clips', 'id'], ['thumbs', 'id'], ['meta', 'key'], ['fpcache', 'key']]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); };
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function run(stores, mode, fn) {
  const db = await open();
  const tx = db.transaction(stores, mode);
  const done = new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  const out = await fn(tx);
  await done;
  return out;
}

export const allClips = () => run('clips', 'readonly', (tx) => wrap(tx.objectStore('clips').getAll()));
export const getClip = (id) => run('clips', 'readonly', (tx) => wrap(tx.objectStore('clips').get(id)));
export const putClips = (list) => run('clips', 'readwrite', (tx) => { const s = tx.objectStore('clips'); list.forEach((c) => s.put(c)); });
/** แก้คลิปเดียวแบบอ่านค่าล่าสุด+เขียนในทรานแซกชันเดียว (กันเขียนทับค่าที่เพิ่งเปลี่ยน) · คลิปไม่มีแล้ว = ข้าม ไม่สร้างระเบียนเสีย */
export const patchClip = (id, fn) => run('clips', 'readwrite', async (tx) => {
  const s = tx.objectStore('clips');
  const cur = await wrap(s.get(id));
  if (cur) s.put({ ...cur, ...fn(cur) });
});
export const putThumb = (id, blob) => run('thumbs', 'readwrite', (tx) => { tx.objectStore('thumbs').put({ id, blob }); });
export const getThumb = (id) => run('thumbs', 'readonly', (tx) => wrap(tx.objectStore('thumbs').get(id))).then((r) => r?.blob || null);
export const thumbIds = () => run('thumbs', 'readonly', (tx) => wrap(tx.objectStore('thumbs').getAllKeys()));
export const getMeta = (key, def) => run('meta', 'readonly', (tx) => wrap(tx.objectStore('meta').get(key))).then((r) => (r ? r.value : def));
export const setMeta = (key, value) => run('meta', 'readwrite', (tx) => { tx.objectStore('meta').put({ key, value }); });
/** ที่จำลายนิ้วมือ: key = path|ขนาด|เวลาแก้ไข → fp (อ่านไฟล์ซ้ำเฉพาะที่เปลี่ยน · สแกนที่ถูกหยุด/แอปปิดกลางคัน ทำต่อได้) */
export const getFpCache = () => run('fpcache', 'readonly', (tx) => wrap(tx.objectStore('fpcache').getAll())).then((rows) => new Map(rows.map((r) => [r.key, r.fp])));
export const putFpCache = (rows) => run('fpcache', 'readwrite', (tx) => { const s = tx.objectStore('fpcache'); rows.forEach((r) => s.put(r)); });
export const pruneFpCache = (keep) => run('fpcache', 'readwrite', async (tx) => {
  const s = tx.objectStore('fpcache');
  for (const k of await wrap(s.getAllKeys())) if (!keep.has(k)) s.delete(k);
});
/** ล้างรายการในแอป (ไม่แตะวิดีโอ) */
export const clearIndex = () => run(['clips', 'thumbs', 'fpcache'], 'readwrite', (tx) => { tx.objectStore('clips').clear(); tx.objectStore('thumbs').clear(); tx.objectStore('fpcache').clear(); });
