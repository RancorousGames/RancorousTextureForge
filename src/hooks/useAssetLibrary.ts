import { useCallback, RefObject } from 'react';
import { AppState, TextureAsset } from '../types';
import { tileRegistry } from '../lib/TileRegistry';
import { generateId } from '../lib/canvas';

function createAssetFromFile(file: File, url: string, img: HTMLImageElement): TextureAsset {
  return {
    id: generateId(),
    file,
    url,
    sourceUrl: url,
    name: file.name,
    width: img.width,
    height: img.height,
    x: 0, y: 0,
    hue: 0, brightness: 100, scale: 1,
  };
}

export function useAssetLibrary(
  state: AppState,
  set: (v: AppState | ((p: AppState) => AppState)) => void,
  fileInputRef: RefObject<HTMLInputElement>
) {
  const addFilesToLibrary = useCallback(async (files: File[]) => {
    const newAssets: TextureAsset[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.libraryAssets.some(a => a.name === file.name)) continue;
      const asset = await new Promise<TextureAsset>(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const a = createAssetFromFile(file, url, img);
          tileRegistry.register(a);
          resolve(a);
        };
        img.src = url;
      });
      newAssets.push(asset);
    }
    set(prev => ({ ...prev, libraryAssets: [...prev.libraryAssets, ...newAssets] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.libraryAssets, set]);

  const handleOpenDirectory = useCallback(async () => {
    try {
      // @ts-ignore — File System Access API, not yet in TS lib
      const dirHandle = await window.showDirectoryPicker();
      const newAssets: TextureAsset[] = [];
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file' || !entry.name.match(/\.(png|jpe?g|webp)$/i)) continue;
        if (state.libraryAssets.some(a => a.name === entry.name)) continue;
        const file = await entry.getFile();
        const asset = await new Promise<TextureAsset>(resolve => {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            const a = createAssetFromFile(file, url, img);
            tileRegistry.register(a);
            resolve(a);
          };
          img.src = url;
        });
        newAssets.push(asset);
      }
      set(prev => ({ ...prev, libraryAssets: [...prev.libraryAssets, ...newAssets] }));
    } catch {
      fileInputRef.current?.click();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.libraryAssets, set, fileInputRef]);

  const handleLoadFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await addFilesToLibrary(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFilesToLibrary, fileInputRef]);

  const handleClearLibrary = useCallback(() => {
    if (confirm('Are you sure you want to clear all loaded assets?')) {
      set(prev => ({ ...prev, libraryAssets: [] }));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [set, fileInputRef]);

  return { addFilesToLibrary, handleOpenDirectory, handleLoadFiles, handleClearLibrary };
}
