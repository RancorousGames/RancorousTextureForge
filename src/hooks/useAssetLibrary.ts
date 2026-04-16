import { useCallback, RefObject } from 'react';
import { AppState, TextureTile } from '../types';
import { tileRegistry } from '../lib/TileRegistry';
import { generateId } from '../lib/canvas';

function createTileFromFile(file: File, url: string, img: HTMLImageElement): TextureTile {
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
    const newTiles: TextureTile[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.secondaryTiles.some(t => t.name === file.name)) continue;
      const tile = await new Promise<TextureTile>(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const t = createTileFromFile(file, url, img);
          tileRegistry.register(t);
          resolve(t);
        };
        img.src = url;
      });
      newTiles.push(tile);
    }
    set(prev => ({ ...prev, secondaryTiles: [...prev.secondaryTiles, ...newTiles] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.secondaryTiles, set]);

  const handleOpenDirectory = useCallback(async () => {
    try {
      // @ts-ignore — File System Access API, not yet in TS lib
      const dirHandle = await window.showDirectoryPicker();
      const newTiles: TextureTile[] = [];
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file' || !entry.name.match(/\.(png|jpe?g|webp)$/i)) continue;
        if (state.secondaryTiles.some(t => t.name === entry.name)) continue;
        const file = await entry.getFile();
        const tile = await new Promise<TextureTile>(resolve => {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            const t = createTileFromFile(file, url, img);
            tileRegistry.register(t);
            resolve(t);
          };
          img.src = url;
        });
        newTiles.push(tile);
      }
      set(prev => ({ ...prev, secondaryTiles: [...prev.secondaryTiles, ...newTiles] }));
    } catch {
      fileInputRef.current?.click();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.secondaryTiles, set, fileInputRef]);

  const handleLoadFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await addFilesToLibrary(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFilesToLibrary, fileInputRef]);

  const handleClearLibrary = useCallback(() => {
    if (confirm('Are you sure you want to clear all loaded assets?')) {
      set(prev => ({ ...prev, secondaryTiles: [] }));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [set, fileInputRef]);

  return { addFilesToLibrary, handleOpenDirectory, handleLoadFiles, handleClearLibrary };
}
