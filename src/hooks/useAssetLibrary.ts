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
    const processedAssets: TextureAsset[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      
      const existing = state.libraryAssets.find(a => a.name === file.name);
      
      const asset = await new Promise<TextureAsset>(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const a = createAssetFromFile(file, url, img);
          if (existing) {
            a.id = existing.id;
            // Revoke old blob URL to prevent memory leaks
            if (existing.url.startsWith('blob:')) {
              URL.revokeObjectURL(existing.url);
            }
          }
          tileRegistry.register(a);
          resolve(a);
        };
        img.src = url;
      });
      processedAssets.push(asset);
    }

    if (processedAssets.length === 0) return;

    set(prev => {
      const libraryAssets = [...prev.libraryAssets];
      const updatedIds = new Set<string>();

      for (const asset of processedAssets) {
        const idx = libraryAssets.findIndex(a => a.name === asset.name);
        if (idx !== -1) {
          libraryAssets[idx] = asset;
          updatedIds.add(asset.id);
        } else {
          libraryAssets.push(asset);
        }
      }

      // Proactively update other state parts if they use these assets by ID
      const updateAsset = (a: TextureAsset) => {
        if (updatedIds.has(a.id)) {
          const replacement = processedAssets.find(pa => pa.id === a.id);
          if (replacement) {
            return {
              ...a,
              url: replacement.url,
              file: replacement.file,
              sourceUrl: replacement.sourceUrl,
              width: replacement.width,
              height: replacement.height,
            };
          }
        }
        return a;
      };

      return {
        ...prev,
        libraryAssets,
        atlasEntries: prev.atlasEntries.map(updateAsset),
        layeringLayers: prev.layeringLayers.map(l => ({ ...l, asset: updateAsset(l.asset) })),
        packerMapping: {
          r: { ...prev.packerMapping.r, asset: prev.packerMapping.r.asset ? updateAsset(prev.packerMapping.r.asset) : null },
          g: { ...prev.packerMapping.g, asset: prev.packerMapping.g.asset ? updateAsset(prev.packerMapping.g.asset) : null },
          b: { ...prev.packerMapping.b, asset: prev.packerMapping.b.asset ? updateAsset(prev.packerMapping.b.asset) : null },
          a: { ...prev.packerMapping.a, asset: prev.packerMapping.a.asset ? updateAsset(prev.packerMapping.a.asset) : null },
        },
        pbrSet: {
          baseColor: { ...prev.pbrSet.baseColor, asset: prev.pbrSet.baseColor.asset ? updateAsset(prev.pbrSet.baseColor.asset) : null },
          normal: { ...prev.pbrSet.normal, asset: prev.pbrSet.normal.asset ? updateAsset(prev.pbrSet.normal.asset) : null },
          orm: { ...prev.pbrSet.orm, asset: prev.pbrSet.orm.asset ? updateAsset(prev.pbrSet.orm.asset) : null },
        },
        currentSourceAsset: prev.currentSourceAsset ? updateAsset(prev.currentSourceAsset) : null
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.libraryAssets, set]);

  const handleOpenDirectory = useCallback(async () => {
    try {
      // @ts-ignore — File System Access API, not yet in TS lib
      const dirHandle = await window.showDirectoryPicker();
      const files: File[] = [];
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file' || !entry.name.match(/\.(png|jpe?g|webp)$/i)) continue;
        files.push(await entry.getFile());
      }
      if (files.length > 0) {
        await addFilesToLibrary(files);
      }
    } catch {
      fileInputRef.current?.click();
    }
  }, [addFilesToLibrary, fileInputRef]);

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
