import type { StudioLayer, StudioProject } from './types.js';

const DB_NAME = 'xflip-studio';
const DB_VERSION = 1;
const STORE = 'project';

interface PersistedLayer extends Omit<StudioLayer, 'imageBlob' | 'imageUrl'> {
  imageData: ArrayBuffer;
  imageMime: string;
}

interface PersistedProject extends Omit<StudioProject, 'layers'> {
  layers: PersistedLayer[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project: StudioProject): Promise<void> {
  const db = await openDb();
  const persisted: PersistedProject = {
    ...project,
    layers: await Promise.all(
      project.layers.map(async (l) => {
        const buf = await l.imageBlob.arrayBuffer();
        const p: PersistedLayer = {
          id: l.id,
          name: l.name,
          imageData: buf,
          imageMime: l.imageBlob.type || 'image/png',
          zOrder: l.zOrder,
          opacity: l.opacity,
          blendMode: l.blendMode,
          effectType: l.effectType,
        };
        return p;
      }),
    ),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(persisted, 'current');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadProject(): Promise<StudioProject | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('current');
    req.onsuccess = () => {
      db.close();
      const persisted: PersistedProject | undefined = req.result;
      if (!persisted) {
        resolve(null);
        return;
      }
      const project: StudioProject = {
        ...persisted,
        layers: persisted.layers.map((l) => {
          const blob = new Blob([l.imageData], { type: l.imageMime });
          const url = URL.createObjectURL(blob);
          return {
            id: l.id,
            name: l.name,
            imageBlob: blob,
            imageUrl: url,
            zOrder: l.zOrder,
            opacity: l.opacity,
            blendMode: l.blendMode,
            effectType: l.effectType,
          };
        }),
      };
      resolve(project);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function clearProject(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('current');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
