// Photo storage for coach moments and profile pictures. Records in app
// state only hold the photo id. Connected to the database, photos go to the
// private 'photos' bucket ({org}/{athlete}/{id}.jpg) so every device sees
// them; this browser's IndexedDB keeps a copy. Without the database, the
// IndexedDB copy is the only one.
import { useEffect, useState } from "react";
import {
  remote,
  uploadPhoto,
  signedPhotoUrl,
  downloadPhoto,
  removePhoto,
} from "./sync/photos.js";

const DB = "lab-photos";
const STORE = "photos";
let opening;

function db() {
  if (typeof indexedDB === "undefined")
    return Promise.reject(Error("Photo storage is unavailable here."));
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function tx(mode, run) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const t = conn.transaction(STORE, mode);
    const result = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Scales an image to fit `max` px on its long edge and re-encodes as JPEG.
async function scaled(source, max, quality) {
  const bitmap =
    source instanceof Blob ? await createImageBitmap(source) : source;
  const w = bitmap.width ?? bitmap.videoWidth;
  const h = bitmap.height ?? bitmap.videoHeight;
  const k = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Could not encode the photo."))),
      "image/jpeg",
      quality,
    ),
  );
}

// Stores a full image (1600 px) and a thumbnail (480 px); returns the id.
// childId says whose photo it is, for the shared copy.
export async function savePhoto(source, childId) {
  const [full, thumb] = await Promise.all([
    scaled(source, 1600, 0.85),
    scaled(source, 480, 0.8),
  ]);
  const id = crypto.randomUUID();
  if (remote) await uploadPhoto(id, childId, full, thumb);
  await tx("readwrite", (s) =>
    s.put({ full, thumb, at: Date.now() }, id),
  ).catch((e) => {
    if (!remote) throw e;
  });
  return id;
}

export const deletePhoto = async (id) => {
  if (remote) await removePhoto(id);
  await tx("readwrite", (s) => s.delete(id)).catch(() => {});
};
export const clearPhotos = () => tx("readwrite", (s) => s.clear());

const urls = new Map();
async function photoURL(id, size) {
  const k = `${id}:${size}`;
  if (urls.has(k)) return urls.get(k);
  const row = await tx("readonly", (s) => s.get(id)).catch(() => null);
  if (!row) {
    if (!remote) return null;
    // Taken on another device: a short-lived link to the shared copy.
    const url = await signedPhotoUrl(id, size);
    if (url) urls.set(k, url);
    return url;
  }
  const url = URL.createObjectURL(row[size]);
  urls.set(k, url);
  return url;
}

export async function photoBlob(id) {
  const row = await tx("readonly", (s) => s.get(id)).catch(() => null);
  if (row?.full) return row.full;
  return remote ? downloadPhoto(id) : null;
}

// Object URL for a stored photo, or null while loading / when missing.
export function usePhoto(id, size = "thumb") {
  const [url, setUrl] = useState(() => urls.get(`${id}:${size}`) ?? null);
  useEffect(() => {
    let live = true;
    if (!id) return setUrl(null);
    photoURL(id, size)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [id, size]);
  return url;
}
