import { openDB, IDBPDatabase } from 'idb';
import { AppState, AppMode, TextureAsset } from '../types';

const DB_NAME = 'TextureForgeDB';
const STORE_NAME = 'assets';
const STATE_KEY = 'app_state_v1';
const MODE_KEY = 'app_mode';

interface ForgeDB {
  assets: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<ForgeDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ForgeDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
}

export async function saveAssetBlob(id: string, blob: Blob) {
  const db = await getDB();
  await db.put(STORE_NAME, blob, id);
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

export async function clearAssetBlobs() {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

export async function cleanupAssetBlobs(activeIds: Set<string>) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const keys = await store.getAllKeys();
  for (const key of keys) {
    if (typeof key === 'string' && !activeIds.has(key)) {
      await store.delete(key);
    }
  }
  await tx.done;
}

/**
 * Persists the core AppState to LocalStorage.
 * Note: atlasEntries in state will have temporary blob URLs.
 * We store the metadata in LocalStorage and the Blobs in IndexedDB.
 */
export async function persistAppState(state: Partial<AppState>) {
  // We only save what was requested: Settings, active page (handled separately), and main atlas state.
  const toSave = {
    gridSettings: state.gridSettings,
    sourceGridSettings: state.sourceGridSettings,
    adjustSettings: state.adjustSettings,
    autoDetectEnabled: state.autoDetectEnabled,
    textureName: state.textureName,
    atlasStatus: state.atlasStatus,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    lastMainAssetId: state.lastMainAssetId,
    lastSourceAssetId: state.lastSourceAssetId,
    clearedCells: state.clearedCells,
    atlasEntries: state.atlasEntries?.map(e => ({ ...e, url: '' })), // Clear URLs, they are transient
    currentSourceAsset: state.currentSourceAsset ? { ...state.currentSourceAsset, url: '' } : null,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(toSave));

  // Save Blobs for atlasEntries and currentSourceAsset
  if (state.atlasEntries) {
    for (const entry of state.atlasEntries) {
      if (entry.url.startsWith('blob:')) {
        const response = await fetch(entry.url);
        const blob = await response.blob();
        await saveAssetBlob(entry.id, blob);
      }
    }
  }
  if (state.currentSourceAsset && state.currentSourceAsset.url.startsWith('blob:')) {
    const response = await fetch(state.currentSourceAsset.url);
    const blob = await response.blob();
    await saveAssetBlob(state.currentSourceAsset.id, blob);
  }
}

export function loadPersistedAppState(): Partial<AppState> | null {
  const saved = localStorage.getItem(STATE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to parse saved state', e);
    return null;
  }
}

export async function restoreAssetUrls(state: Partial<AppState>): Promise<Partial<AppState>> {
  if (state.atlasEntries) {
    const restoredEntries = [];
    for (const entry of state.atlasEntries) {
      const blob = await getAssetBlob(entry.id);
      if (blob) {
        restoredEntries.push({ ...entry, url: URL.createObjectURL(blob) });
      } else {
        restoredEntries.push(entry);
      }
    }
    state.atlasEntries = restoredEntries;
  }

  if (state.currentSourceAsset) {
    const blob = await getAssetBlob(state.currentSourceAsset.id);
    if (blob) {
      state.currentSourceAsset = { ...state.currentSourceAsset, url: URL.createObjectURL(blob) };
    }
  }

  return state;
}

export function persistAppMode(mode: AppMode) {
  localStorage.setItem(MODE_KEY, mode);
}

export function loadAppMode(): AppMode | null {
  return localStorage.getItem(MODE_KEY) as AppMode | null;
}
