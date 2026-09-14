// A separate, deliberate asset library from file-registry.js's `files`
// (which stays exactly as it is - transient, OS-picker-based, gone on
// reload). Anything saved here via the storage portal (ui/storage-
// portal.js) is backed by IndexedDB, so it survives a reload or a
// shared patch URL opened on another device - `get('name')` (registered
// as a global in project-loader.js) just needs to already be in the
// `assets` Map by the time a node's code() runs, which restoreAssets()
// below guarantees by loading everything back BEFORE the initial patch
// is sent (see main.js's startup sequence).
//
// IndexedDB (not localStorage, which is text-only and ~5-10MB) - it
// stores real File/Blob objects natively via structured clone (.type
// included), with a much larger quota, appropriate for video.

const DB_NAME = 'synus-assets';
const STORE_NAME = 'assets';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// assets - the in-memory name -> File map get() reads from directly.
// Kept in sync with IndexedDB by every function below that touches it -
// nothing else should mutate this Map directly.
export const assets = new Map();

// restoreAssets() - called once at startup (see main.js), before the
// initial patch is sent, so a patch referencing get('name') has it
// available on its very first tick.
export async function restoreAssets() {
  const records = await dbGetAll();
  for (const { name, file } of records) assets.set(name, file);
}

// get(name) - the actual global exposed to project code (see
// project-loader.js). A plain synchronous Map lookup - the async
// IndexedDB calls only ever happen on the save/remove path below (from
// the storage portal), never here, so a node's code() calling this
// every tick costs nothing more than files.get() already does.
export function get(name) {
  return assets.get(name);
}

// saveAssetNamed(name, file) - used by ui/storage-portal.js. Updates the
// in-memory Map immediately (so get(name) works the instant Save is
// clicked, no need to wait on IndexedDB) and persists in the
// background; returns { ok: true } or { ok: false, error } (a quota
// error on a large video is a real possibility) so the portal can show
// it instead of silently pretending the save worked.
export async function saveAssetNamed(name, file) {
  assets.set(name, file);
  try {
    await dbPut({ name, file });
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function removeAsset(name) {
  assets.delete(name);
  try {
    await dbDelete(name);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
