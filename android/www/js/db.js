// ชั้นข้อมูลทั้งหมด (IndexedDB 'opv-android'): clips (id = ลายนิ้วมือไฟล์), thumbs (Blob ภาพตัวอย่าง), meta (ตั้งค่า)
// ไม่เก็บวิดีโอ — วิดีโอยังอยู่ที่เดิมในเครื่อง ไม่มีการคัดลอกซ้ำ
const NAME = 'opv-android';
const VERSION = 1;
let dbp;

function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('clips', { keyPath: 'id' });
      db.createObjectStore('thumbs', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
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
export const putThumb = (id, blob) => run('thumbs', 'readwrite', (tx) => { tx.objectStore('thumbs').put({ id, blob }); });
export const getThumb = (id) => run('thumbs', 'readonly', (tx) => wrap(tx.objectStore('thumbs').get(id))).then((r) => r?.blob || null);
export const thumbIds = () => run('thumbs', 'readonly', (tx) => wrap(tx.objectStore('thumbs').getAllKeys()));
export const getMeta = (key, def) => run('meta', 'readonly', (tx) => wrap(tx.objectStore('meta').get(key))).then((r) => (r ? r.value : def));
export const setMeta = (key, value) => run('meta', 'readwrite', (tx) => { tx.objectStore('meta').put({ key, value }); });
/** ล้างรายการในแอป (ไม่แตะวิดีโอ) */
export const clearIndex = () => run(['clips', 'thumbs'], 'readwrite', (tx) => { tx.objectStore('clips').clear(); tx.objectStore('thumbs').clear(); });
