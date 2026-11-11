// ชั้นข้อมูล: IndexedDB (episodes, scenes, videos) — ทุกอย่างเก็บในเครื่องเท่านั้น
const DB_NAME = 'onepiece-vault';
const DB_VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('episodes', { keyPath: 'id' });
      db.createObjectStore('scenes', { keyPath: 'id' }).createIndex('episodeId', 'episodeId');
      db.createObjectStore('videos', { keyPath: 'id' }); // id = episodeId
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
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

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadAll() {
  return run(['episodes', 'scenes'], 'readonly', async (tx) => ({
    episodes: await wrap(tx.objectStore('episodes').getAll()),
    scenes: await wrap(tx.objectStore('scenes').getAll()),
  }));
}

export const saveEpisode = (ep) => run('episodes', 'readwrite', (tx) => wrap(tx.objectStore('episodes').put(ep)));
export const saveScene = (sc) => run('scenes', 'readwrite', (tx) => wrap(tx.objectStore('scenes').put(sc)));
export const deleteScene = (id) => run('scenes', 'readwrite', (tx) => wrap(tx.objectStore('scenes').delete(id)));

export function deleteEpisode(id) {
  return run(['episodes', 'scenes', 'videos'], 'readwrite', async (tx) => {
    const scenes = tx.objectStore('scenes');
    const keys = await wrap(scenes.index('episodeId').getAllKeys(id));
    keys.forEach((k) => scenes.delete(k));
    tx.objectStore('videos').delete(id);
    tx.objectStore('episodes').delete(id);
  });
}

/** บันทึกวิดีโอ (สำเนาเก็บในเครื่อง) และอัปเดตสถานะของ Episode */
export function attachVideo(episode, file) {
  return run(['episodes', 'videos'], 'readwrite', async (tx) => {
    tx.objectStore('videos').put({ id: episode.id, name: file.name, type: file.type, blob: file });
    const next = { ...episode, hasVideo: true, videoName: file.name, videoSize: file.size };
    tx.objectStore('episodes').put(next);
    return next;
  });
}

export function detachVideo(episode) {
  return run(['episodes', 'videos'], 'readwrite', async (tx) => {
    tx.objectStore('videos').delete(episode.id);
    const next = { ...episode, hasVideo: false, videoSize: 0 };
    tx.objectStore('episodes').put(next);
    return next;
  });
}

export const getVideo = (episodeId) => run('videos', 'readonly', (tx) => wrap(tx.objectStore('videos').get(episodeId)));

/** เขียนข้อมูลทั้งชุดทับ (ใช้ตอนนำเข้า JSON) และลบวิดีโอที่ไม่มี Episode แล้ว */
export function writeAll({ episodes, scenes }) {
  return run(['episodes', 'scenes', 'videos'], 'readwrite', async (tx) => {
    const eps = tx.objectStore('episodes');
    const scs = tx.objectStore('scenes');
    eps.clear(); scs.clear();
    episodes.forEach((e) => eps.put(e));
    scenes.forEach((s) => scs.put(s));
    const keep = new Set(episodes.map((e) => e.id));
    const vids = tx.objectStore('videos');
    for (const k of await wrap(vids.getAllKeys())) if (!keep.has(k)) vids.delete(k);
  });
}
