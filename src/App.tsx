import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { TextureAsset, AppMode, GridSettings, ChannelMapping, PBRSet, Layer, AppState, VIRTUAL_MAIN_ATLAS_ID, ResizeMode, initialPackerMapping, initialPBRSet } from './types';
import { MainAtlas } from './components/MainAtlas';
import { SourceAtlas } from './components/SourceAtlas';
import { SecondaryAtlas } from './components/SecondaryAtlas';
import { Toolbox } from './components/Toolbox';
import { ChannelPackerMode } from './components/ChannelPackerMode';
import { LayeringMode } from './components/LayeringMode';
import { AdjustMode } from './components/AdjustMode';
import { FolderOpen, LayoutTemplate, Layers, Palette, SlidersHorizontal, Undo2, Redo2, Plus, Image as ImageIcon, ExternalLink, Type } from 'lucide-react';
import { cn, checkGridDensity, hexToRgb } from './lib/utils';
import { useHistory } from './hooks/useHistory';
import { useAtlas } from './hooks/useAtlas';
import { useGridSlice } from './hooks/useGridSlice';
import { useAutoDetect } from './hooks/useAutoDetect';
import { useAtlasOps } from './hooks/useAtlasOps';
import { useAssetLibrary } from './hooks/useAssetLibrary';
import { AddTilesCommand, PatchCommand, SetMainTilesCommand, RemoveTilesCommand } from './lib/Commands';
import potpack from 'potpack';
import { tileRegistry } from './lib/TileRegistry';
import { generateId, renderTilesToCanvas, applyAlphaKey, loadImage } from './lib/canvas';

const FORGE_CONFIG_KEY = 'forge_config_v1';

const getInitialState = (): AppState => {
  const baseState: AppState = {
    atlasEntries: [],
    libraryAssets: [],
    modifiedAssets: [],
    gridSettings: {
      mode: 'fixed',
      keepSquare: true,
      cellSize: 128, cellY: 128,
      padding: 0,
      clearColor: '#000000',
      clearTolerance: 10,
      packingAlgo: 'potpack',
    },
    sourceGridSettings: {
      mode: 'fixed',
      keepSquare: true,
      cellSize: 128, cellY: 128,
      padding: 0,
      clearColor: '#000000',
      clearTolerance: 10,
    },
    packerMapping: initialPackerMapping,
    pbrSet: initialPBRSet,
    layeringLayers: [],
    dragMode: 'replace',
    resizeMode: 'fill',
    addMode: 'replace-bg',
    atlasStatus: 'parametric',
    canvasWidth: 0,
    canvasHeight: 0,
    adjustSettings: { targetW: 'source', targetH: 'source' },
    lastSourceAssetId: null,
    clearedCells: [],
    autoDetectEnabled: false,
    debugIslands: [],
    debugIslandDetection: false,
    textureName: 'T_Texture_BC',
  };

  try {
    const saved = localStorage.getItem(FORGE_CONFIG_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      return {
        ...baseState,
        gridSettings: { ...baseState.gridSettings, ...config.gridSettings },
        sourceGridSettings: { ...baseState.sourceGridSettings, ...config.sourceGridSettings },
        adjustSettings: { ...baseState.adjustSettings, ...config.adjustSettings },
        resizeMode: config.resizeMode ?? 'fill',
        autoDetectEnabled: config.autoDetectEnabled ?? false,
        textureName: config.textureName ?? 'T_Texture_BC',
      };
    }
  } catch (e) {
    console.error('Failed to load forge config', e);
  }
  return baseState;
};

export default function App() {
  const [mode, setMode] = useState<AppMode>(() => (localStorage.getItem('forge_mode') as AppMode) || 'atlas');
  const { state, set, executeCommand, undo, redo, canUndo, canRedo } = useHistory<AppState>(getInitialState());

  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isResizing, setIsResizing] = useState(false);
  const splitPaneRef = useRef<HTMLDivElement>(null);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevGridModeRef = useRef(state.gridSettings.mode);

  const { canvasWidth, canvasHeight } = state;

  const mainAtlas = useAtlas(state.gridSettings, canvasWidth, canvasHeight, {
    entries: state.atlasEntries,
    setEntries: (newEntries) => {
      const next = typeof newEntries === 'function' ? newEntries(state.atlasEntries) : newEntries;
      executeCommand(new SetMainTilesCommand(state.atlasEntries, next));
    },
  });

  const { performGridSlice, handleMaterialize, handleSourceCellClick, handleSourceCellRightClick } =
    useGridSlice(state, canvasWidth, canvasHeight, mainAtlas.geo, selectedCells, set, executeCommand);

  // After auto-detect updates gridSettings, re-slice the current source image so
  // the entries immediately reflect the newly detected cell size and padding.
  const onAutoDetectSettingsApplied = useCallback((gs: GridSettings) => {
    const sourceAsset = [...state.libraryAssets, ...state.modifiedAssets]
      .find(t => t.id === state.lastSourceAssetId);
    if (sourceAsset && gs.mode === 'fixed') {
      const validated = checkGridDensity(sourceAsset.width, sourceAsset.height, gs.cellSize, gs.cellY || gs.cellSize);
      if (!validated) return;
      
      const finalGs = { ...gs, cellSize: validated.cellSize, cellY: validated.cellY };
      set(prev => ({ ...prev, gridSettings: finalGs, atlasEntries: [], clearedCells: [], atlasStatus: 'parametric' }));
      performGridSlice(sourceAsset, state.canvasWidth, state.canvasHeight, true, finalGs);
    }
  }, [state.libraryAssets, state.modifiedAssets, state.lastSourceAssetId,
      state.canvasWidth, state.canvasHeight, set, performGridSlice]);

  const handleResultExport = useCallback((url: string, name: string) => {
    let finalName = name;
    if (state.textureName) {
      const ext = name.split('.').pop() || 'png';
      if (name.startsWith('adjusted_')) {
        finalName = `${state.textureName}_adjusted.${ext}`;
      } else if (name === 'packed_texture.png') {
        finalName = `${state.textureName}_packed.${ext}`;
      } else if (name === 'layered_texture.png') {
        finalName = `${state.textureName}_layered.${ext}`;
      } else {
        // Fallback or other cases
        finalName = `${state.textureName}.${ext}`;
      }
    }

    const link = document.createElement('a');
    link.download = finalName;
    link.href = url;
    link.click();

    // Add to library
    const img = new Image();
    img.onload = () => {
      const newAsset: TextureAsset = {
        id: generateId(),
        url: url,
        name: finalName,
        width: img.naturalWidth,
        height: img.naturalHeight,
        x: 0,
        y: 0,
        hue: 0,
        brightness: 100,
        scale: 1,
      };
      set(prev => ({
        ...prev,
        libraryAssets: [newAsset, ...prev.libraryAssets]
      }));
    };
    img.src = url;
  }, [set, state.textureName]);

  const { handleAutoDetectMainGrid, handleAutoDetectSourceGrid } =
    useAutoDetect(state, canvasWidth, canvasHeight, set, onAutoDetectSettingsApplied);

  const { packAtlas, fixGrid, packElements, exportAtlas, exportGridZip, createNewAtlas, addToLibrary } =
    useAtlasOps(state, canvasWidth, canvasHeight, mainAtlas.geo, set, executeCommand, () => {
      setSelectedAssetId(null);
      setSelectedCells([]);
    });

  const { addFilesToLibrary, handleOpenDirectory, handleLoadFiles, handleClearLibrary } =
    useAssetLibrary(state, set, fileInputRef);

  // ── Derived state ──────────────────────────────────────────────────────────

  const virtualMainAtlasPreview = useMemo(() => {
    // Generate a lightweight SVG preview of the current main atlas
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    const bgColor = state.gridSettings.clearColor;
    const sourceAsset = state.lastSourceAssetId ? state.libraryAssets.find(t => t.id === state.lastSourceAssetId) : null;
    
    // We'll use a data URL for the SVG
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" fill="${bgColor}" />
        ${sourceAsset && state.atlasStatus !== 'baked' ? `
          <image href="${sourceAsset.sourceUrl || sourceAsset.url}" width="${w}" height="${h}" preserveAspectRatio="none" />
          ${state.clearedCells.map(key => {
            const [cx, cy] = key.split(',').map(Number);
            const sw = state.gridSettings.cellSize;
            const sh = state.gridSettings.cellY || sw;
            return `<rect x="${cx * sw}" y="${cy * sh}" width="${sw}" height="${sh}" fill="${bgColor}" />`;
          }).join('')}
        ` : ''}
        ${state.atlasEntries.map(t => {
          const sX = t.scaleX ?? t.scale;
          const sY = t.scaleY ?? t.scale;
          return `
            <g filter="hue-rotate(${t.hue}deg) brightness(${t.brightness}%)">
              <image href="${t.url}" x="${t.x}" y="${t.y}" width="${t.width * sX}" height="${t.height * sY}" preserveAspectRatio="none" />
            </g>
          `;
        }).join('')}
      </svg>
    `.replace(/\n/g, '').replace(/>\s+</g, '><');
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }, [state.atlasEntries, state.canvasWidth, state.canvasHeight, state.gridSettings, state.lastSourceAssetId, state.libraryAssets, state.clearedCells, state.atlasStatus]);

  const handleGetMainAtlasSnapshot = useCallback(async () => {
    const sourceAsset = state.lastSourceAssetId ? state.libraryAssets.find(t => t.id === state.lastSourceAssetId) : null;
    const sw = state.gridSettings.cellSize;
    const sh = state.gridSettings.cellY || sw;
    
    const canvas = await renderTilesToCanvas(
      state.atlasEntries,
      state.canvasWidth,
      state.canvasHeight,
      state.gridSettings.clearColor,
      {
        sourceAsset,
        clearedCells: state.clearedCells,
        cellW: sw,
        cellH: sh,
        stepX: sw,
        stepY: sh
      }
    );
    return canvas.toDataURL();
  }, [state.atlasEntries, state.canvasWidth, state.canvasHeight, state.gridSettings, state.lastSourceAssetId, state.libraryAssets, state.clearedCells]);

  const activeAssets = useMemo(() => {
    // Show the source atlas texture as one item rather than individual slices
    const sourceAsset = state.lastSourceAssetId
      ? state.libraryAssets.find(t => t.id === state.lastSourceAssetId)
      : null;

    const candidates: TextureAsset[] = [
      {
        id: VIRTUAL_MAIN_ATLAS_ID,
        name: 'Main Atlas (Canvas)',
        url: '', // Will be handled specifically
        width: state.canvasWidth,
        height: state.canvasHeight,
        x: 0, y: 0, hue: 0, brightness: 100, scale: 1
      },
      ...(sourceAsset ? [sourceAsset] : []),
      ...state.modifiedAssets,
      ...state.layeringLayers.map(l => l.asset),
      ...[state.packerMapping.r.asset, state.packerMapping.g.asset,
          state.packerMapping.b.asset, state.packerMapping.a.asset].filter((t): t is TextureAsset => t !== null),
      ...[state.pbrSet.baseColor.asset, state.pbrSet.normal.asset,
          state.pbrSet.orm.asset].filter((t): t is TextureAsset => t !== null),
    ];
    return candidates.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
  }, [state.lastSourceAssetId, state.libraryAssets, state.modifiedAssets,
      state.layeringLayers, state.packerMapping, state.pbrSet]);

  const selectedAsset = useMemo(() => {
    if (mode === 'atlas' && selectedCells.length > 0) {
      const [cx, cy] = selectedCells[0].split(',').map(Number);
      return state.atlasEntries.find(t => mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy)) ?? null;
    }
    if (selectedAssetId) {
      return state.modifiedAssets.find(t => t.id === selectedAssetId)
          ?? state.libraryAssets.find(t => t.id === selectedAssetId)
          ?? state.atlasEntries.find(t => t.id === selectedAssetId)
          ?? null;
    }
    return null;
  }, [mode, selectedCells, selectedAssetId, state.atlasEntries, state.modifiedAssets, state.libraryAssets, mainAtlas.geo]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const updateAsset = useCallback((id: string, updates: Partial<TextureAsset>) => {
    set(prev => {
      if (prev.atlasEntries.some(t => t.id === id))
        return { ...prev, atlasEntries: prev.atlasEntries.map(t => t.id === id ? { ...t, ...updates } : t) };
      if (prev.modifiedAssets.some(t => t.id === id))
        return { ...prev, modifiedAssets: prev.modifiedAssets.map(t => t.id === id ? { ...t, ...updates } : t) };
      if (prev.libraryAssets.some(t => t.id === id)) {
        const asset = prev.libraryAssets.find(t => t.id === id)!;
        const modified = { ...asset, ...updates, id: generateId() };
        setSelectedAssetId(modified.id);
        return { ...prev, modifiedAssets: [...prev.modifiedAssets, modified] };
      }
      return prev;
    });
  }, [set]);

  const handleAssetClick = useCallback(async (asset: TextureAsset) => {
    let effectiveAsset = asset;
    if (asset.id === VIRTUAL_MAIN_ATLAS_ID) {
      const url = await handleGetMainAtlasSnapshot();
      effectiveAsset = { ...asset, url, id: generateId(), name: `Snapshot ${new Date().toLocaleTimeString()}` };
      set(prev => ({ ...prev, modifiedAssets: [...prev.modifiedAssets, effectiveAsset] }));
    }

    if (mode === 'atlas') {
      const shouldSlice = state.gridSettings.mode === 'fixed';
      
      // If auto-detect is enabled, we detect settings first then slice
      if (state.autoDetectEnabled && shouldSlice) {
        // Set basic state first so UI updates canvas size
        set(prev => ({
          ...prev,
          canvasWidth: effectiveAsset.width, canvasHeight: effectiveAsset.height,
          lastSourceAssetId: effectiveAsset.id, clearedCells: [],
          atlasEntries: [],
          atlasStatus: 'parametric'
        }));
        setSelectedAssetId(null);
        setSelectedCells([]);

        // Trigger auto-detect for main grid using this asset
        // This will call onAutoDetectSettingsApplied, but we'll also slice here to be sure
        const newMainSettings = await handleAutoDetectMainGrid(effectiveAsset);
        await handleAutoDetectSourceGrid(effectiveAsset);
        
        if (newMainSettings) {
           const validated = checkGridDensity(effectiveAsset.width, effectiveAsset.height, newMainSettings.cellSize, newMainSettings.cellY || newMainSettings.cellSize);
           if (!validated) return;
           const finalSettings = { ...newMainSettings, cellSize: validated.cellSize, cellY: validated.cellY };
           
           // Ensure state is updated if guard changed the settings
           if (finalSettings.cellSize !== newMainSettings.cellSize || finalSettings.cellY !== newMainSettings.cellY) {
             set(prev => ({ ...prev, gridSettings: finalSettings }));
           }
           
           performGridSlice(effectiveAsset, effectiveAsset.width, effectiveAsset.height, false, finalSettings);
        }
        return;
      }

      set(prev => ({
        ...prev,
        canvasWidth: effectiveAsset.width, canvasHeight: effectiveAsset.height,
        atlasEntries: shouldSlice ? [] : [{ ...effectiveAsset, id: generateId(), x: 0, y: 0 }], 
        lastSourceAssetId: effectiveAsset.id, clearedCells: [],
      }));
      setSelectedAssetId(null);
      setSelectedCells([]);
      
      if (shouldSlice) {
        performGridSlice(effectiveAsset, effectiveAsset.width, effectiveAsset.height, false);
      }
    } else if (mode === 'adjust') {
      if (state.libraryAssets.some(a => a.id === effectiveAsset.id) || effectiveAsset.id === VIRTUAL_MAIN_ATLAS_ID) {
        const existing = state.modifiedAssets.find(a => a.name === effectiveAsset.name && (effectiveAsset.file ? a.file === effectiveAsset.file : a.url === effectiveAsset.url));
        if (existing) {
          setSelectedAssetId(existing.id);
        } else {
          const modified = { ...effectiveAsset, id: generateId() };
          set(prev => ({ ...prev, modifiedAssets: [...prev.modifiedAssets, modified] }));
          setSelectedAssetId(modified.id);
        }
      } else {
        setSelectedAssetId(effectiveAsset.id);
      }
    } else if (mode === 'layering') {
      const newLayer: Layer = {
        id: generateId(), asset: { ...effectiveAsset },
        opacity: 1, transparentColor: null, tolerance: 10, visible: true,
      };
      set(prev => ({ ...prev, layeringLayers: [newLayer, ...prev.layeringLayers] }));
    }
  }, [mode, state.libraryAssets, state.modifiedAssets, state.autoDetectEnabled, state.gridSettings, handleGetMainAtlasSnapshot, handleAutoDetectMainGrid, handleAutoDetectSourceGrid, performGridSlice, set]);

  const handleMainAtlasDrop = useCallback(async (assetOrId: string | TextureAsset, x: number, y: number) => {
    console.log(`[Forge] handleMainAtlasDrop: assetOrId=${typeof assetOrId === 'string' ? assetOrId : assetOrId.id}, x=${x}, y=${y}`);
    let asset: TextureAsset | undefined;
    
    if (typeof assetOrId === 'string') {
      asset = [...state.libraryAssets, ...state.modifiedAssets, ...state.atlasEntries, ...activeAssets].find(t => t.id === assetOrId);
    } else {
      asset = assetOrId;
    }
    
    if (!asset) {
      console.warn(`[Forge] Drop failed: Asset not found.`);
      return;
    }

    if (state.libraryAssets.some(t => t.id === asset!.id) || 
        state.modifiedAssets.some(t => t.id === asset!.id) || 
        asset.id === VIRTUAL_MAIN_ATLAS_ID) {
      console.log(`[Forge] Browser/Virtual asset dropped. Triggering handleAssetClick (Replace Source mode).`);
      handleAssetClick(asset);
      return;
    }

    let finalX = x, finalY = y;
    if (state.gridSettings.mode !== 'packing') {
      const snapped = mainAtlas.geo.snap(x, y);
      finalX = snapped.x; finalY = snapped.y;
      console.log(`[Forge] Grid Snap: Original(${x},${y}) -> Snapped(${finalX},${finalY})`);

      if (x === 0 && y === 0) {
        console.log(`[Forge] Detected drop at (0,0). Searching for first empty cell...`);
        outer: for (let r = 0; r < mainAtlas.geo.rows; r++) {
          for (let c = 0; c < mainAtlas.geo.cols; c++) {
            if (!state.atlasEntries.some(t => mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, c, r))) {
              ({ x: finalX, y: finalY } = mainAtlas.geo.getPosFromCell(c, r));
              console.log(`[Forge] Teleporting to first empty cell at (${c},${r}) -> pos(${finalX},${finalY})`);
              break outer;
            }
          }
        }
      }
    } else if (x === 0 && y === 0) {
      // Packing mode: find an empty spot by scanning the canvas
      console.log(`[Forge] Packing mode auto-placement for drop at (0,0).`);
      const padding = state.gridSettings.padding || 2;
      const aw = asset.width * (asset.scaleX ?? asset.scale ?? 1);
      const ah = asset.height * (asset.scaleY ?? asset.scale ?? 1);
      
      let found = false;
      const step = 8;
      // Search for the first spot that doesn't collide with existing entries
      outer: for (let py = padding; py <= state.canvasHeight - ah - padding; py += step) {
        for (let px = padding; px <= state.canvasWidth - aw - padding; px += step) {
          const collision = state.atlasEntries.some(e => {
            const ew = e.width * (e.scaleX ?? e.scale);
            const eh = e.height * (e.scaleY ?? e.scale);
            return px < e.x + ew + padding && px + aw + padding > e.x &&
                   py < e.y + eh + padding && py + ah + padding > e.y;
          });
          if (!collision) {
            finalX = px; finalY = py;
            found = true;
            break outer;
          }
        }
      }
      if (!found) {
        console.warn("[Forge] No empty space found in canvas for new element.");
        finalX = padding; finalY = padding;
      }
      console.log(`[Forge] Auto-placed new entry at (${finalX}, ${finalY})`);
    }

    const isPacking = state.gridSettings.mode === 'packing';
    let entryW = asset.width;
    let entryH = asset.height;
    let entryX = finalX;
    let entryY = finalY;
    let entryScale = asset.scale || 1;
    let sourceX: number | undefined;
    let sourceY: number | undefined;
    let sourceW: number | undefined;
    let sourceH: number | undefined;

    if (!isPacking) {
      const cellW = mainAtlas.geo.cellW;
      const cellH = mainAtlas.geo.cellH;
      
      if (state.resizeMode === 'fill') {
        entryW = cellW;
        entryH = cellH;
        entryScale = 1;
      } else if (state.resizeMode === 'fit') {
        // Scale to fit while maintaining aspect ratio (allows upscaling)
        entryScale = Math.min(cellW / asset.width, cellH / asset.height);
        entryW = asset.width;
        entryH = asset.height;
        entryX = finalX + (cellW - asset.width * entryScale) / 2;
        entryY = finalY + (cellH - asset.height * entryScale) / 2;
      } else if (state.resizeMode === 'crop') {
        entryW = Math.min(asset.width, cellW);
        entryH = Math.min(asset.height, cellH);
        entryScale = 1;
        entryX = finalX + Math.max(0, (cellW - asset.width) / 2);
        entryY = finalY + Math.max(0, (cellH - asset.height) / 2);
        
        sourceX = Math.max(0, (asset.width - cellW) / 2);
        sourceY = Math.max(0, (asset.height - cellH) / 2);
        sourceW = entryW;
        sourceH = entryH;
      }
    }

    let finalUrl = asset.url;
    let isKeyed = asset.isKeyed || false;
    if (state.dragMode === 'overlay') {
      console.log(`[Forge] Overlay mode drop: applying alpha key to ${asset.name}`);
      const img = await loadImage(asset.url);
      const tolerance = state.gridSettings.clearTolerance;
      const keyColor = hexToRgb(state.gridSettings.clearColor);
      finalUrl = applyAlphaKey(img, keyColor, tolerance);
      isKeyed = true;
    }

    const newEntry: TextureAsset = {
      ...asset,
      id: generateId(),
      url: finalUrl,
      x: entryX, 
      y: entryY,
      width: entryW,
      height: entryH,
      scale: entryScale,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      isCrop: state.resizeMode === 'crop',
      isKeyed
    };
    tileRegistry.register(newEntry);
    
    let replacedEntries: TextureAsset[] = [];
    let cellKey: string | null = null;

    if (state.gridSettings.mode !== 'packing') {
      const { cx, cy } = mainAtlas.geo.getCellAtPos(finalX, finalY);
      console.log(`[Forge] Placing Entry: id=${newEntry.id}, cell=(${cx},${cy}), pos=(${finalX},${finalY})`);

      replacedEntries = state.dragMode === 'overlay' ? [] : state.atlasEntries.filter(t =>
        mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy)
      );
      cellKey = `${cx},${cy}`;
    }

    const nextClearedCells = (cellKey && !state.clearedCells.includes(cellKey))
      ? [...state.clearedCells, cellKey]
      : state.clearedCells;

    executeCommand([
      new AddTilesCommand([newEntry], replacedEntries),
      new PatchCommand(
        { lastSourceAssetId: null, clearedCells: nextClearedCells }, 
        { lastSourceAssetId: state.lastSourceAssetId, clearedCells: state.clearedCells }
      ),
    ]);
  }, [state.libraryAssets, state.modifiedAssets, state.atlasEntries, state.gridSettings, state.dragMode, state.resizeMode, state.clearedCells, state.lastSourceAssetId, state.canvasHeight, state.canvasWidth, mainAtlas.geo, executeCommand, handleAssetClick]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (state.dragMode !== 'overlay') return;
    
    const unkeyed = state.atlasEntries.filter(t => !t.isKeyed);
    if (unkeyed.length === 0) return;

    const process = async () => {
      console.log(`[Forge] Auto-keying ${unkeyed.length} unkeyed entries for Overlay mode`);
      const keyColor = hexToRgb(state.gridSettings.clearColor);
      const tolerance = state.gridSettings.clearTolerance;
      
      const updates: Record<string, string> = {};
      for (const t of unkeyed) {
        try {
          const img = await loadImage(t.url);
          updates[t.id] = applyAlphaKey(img, keyColor, tolerance);
        } catch (e) {
          console.error(`[Forge] Auto-key failed for ${t.id}`, e);
        }
      }

      if (Object.keys(updates).length > 0) {
        set(prev => ({
          ...prev,
          atlasEntries: prev.atlasEntries.map(t => updates[t.id] 
            ? { ...t, url: updates[t.id], isKeyed: true } 
            : t
          )
        }));
      }
    };

    process();
  }, [state.dragMode, state.atlasEntries, state.gridSettings.clearColor, state.gridSettings.clearTolerance, set]);

  useEffect(() => {
    localStorage.setItem(FORGE_CONFIG_KEY, JSON.stringify({
      gridSettings: state.gridSettings,
      sourceGridSettings: state.sourceGridSettings,
      adjustSettings: state.adjustSettings,
      autoDetectEnabled: state.autoDetectEnabled,
      textureName: state.textureName,
    }));
  }, [state.gridSettings, state.sourceGridSettings, state.adjustSettings, state.autoDetectEnabled, state.textureName]);

  useEffect(() => {
    localStorage.setItem('forge_mode', mode);
  }, [mode]);

  // Handle auto-slicing ONLY when switching grid modes
  useEffect(() => {
    const currentGridMode = state.gridSettings.mode;
    const prevGridMode = prevGridModeRef.current;
    prevGridModeRef.current = currentGridMode;

    if (mode !== 'atlas' || !state.lastSourceAssetId || currentGridMode === prevGridMode) return;
    
    const sourceAsset = [...state.libraryAssets, ...state.modifiedAssets].find(t => t.id === state.lastSourceAssetId);
    if (!sourceAsset) return;

    const isGridMode = currentGridMode === 'fixed';
    const wasGridMode = prevGridMode === 'fixed';
    
    // Guard: entering packing mode while dirty
    if (currentGridMode === 'packing' && wasGridMode && state.atlasStatus === 'modified') {
      if (!confirm('Switching to packing mode will "freeze" your manual moves. Continue?')) {
         // Revert the setting change - this is slightly messy without a controlled component but works for this architecture
         set(prev => ({ ...prev, gridSettings: { ...prev.gridSettings, mode: prevGridMode } }));
         prevGridModeRef.current = prevGridMode;
         return;
      }
    }

    // Only trigger if we are moving between "Slicing" and "Non-Slicing" states
    if (isGridMode && !wasGridMode) {
      set(prev => ({ ...prev, atlasStatus: 'parametric' }));
      performGridSlice(sourceAsset, state.canvasWidth, state.canvasHeight, true);
    } else if (currentGridMode === 'packing' && wasGridMode) {
      // Revert to full image THEN trigger pack to turn it into islands immediately
      set(prev => ({
        ...prev,
        atlasEntries: [{ ...sourceAsset, id: generateId(), x: 0, y: 0, isCrop: false }],
        clearedCells: [],
        atlasStatus: 'baked' // Set to baked immediately to hide background
      }));
      // Wait for state to settle then turn into islands
      setTimeout(() => packElements(), 50);
    }
  }, [state.gridSettings.mode, mode, state.lastSourceAssetId, state.libraryAssets, state.modifiedAssets, state.canvasWidth, state.canvasHeight, state.atlasStatus, performGridSlice, packElements, set]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: PointerEvent) => {
      if (!splitPaneRef.current) return;
      const rect = splitPaneRef.current.getBoundingClientRect();
      setSplitRatio(Math.min(Math.max(0.1, (e.clientX - rect.left) / rect.width), 0.9));
    };
    const handleUp = () => setIsResizing(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isResizing]);

  useEffect(() => {
   const handleKeyDown = (e: KeyboardEvent) => {
     if (e.altKey && e.key.toLowerCase() === 'd') {
       e.preventDefault();
       set(prev => ({
         ...prev,
         debugIslandDetection: !prev.debugIslandDetection,
         debugIslands: !prev.debugIslandDetection ? prev.debugIslands : []
       }));
       return;
     }
     if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }

      else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') {
        setSelectedCells([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-200 overflow-hidden">
      <header className="h-14 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2" title="Rancorous Texture Forge - Professional Texture Management">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <LayoutTemplate className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">TextureForge</h1>
          </div>
          <div className="flex items-center bg-zinc-950 rounded-lg p-1 border border-zinc-800" title="Select application mode">
            {([
              { id: 'atlas', icon: LayoutTemplate, label: 'Atlas', tooltip: 'Atlas Layout Mode: Slice, pack, and arrange textures' },
              { id: 'adjust', icon: SlidersHorizontal, label: 'Adjust', tooltip: 'Adjust Mode: Resample, hue-shift, and brightness correction' },
              { id: 'channel-pack', icon: Palette, label: 'Channel Pack', tooltip: 'Channel Packer: Composite individual RGBA channels' },
              { id: 'layering', icon: Layers, label: 'Layering', tooltip: 'Layering Mode: Composite multiple textures with transparency' },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id as AppMode)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors',
                  mode === m.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                )}
                title={m.tooltip}
              >
                <m.icon className="w-4 h-4" />
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-l border-zinc-800 pl-4">
            <Type className="w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={state.textureName}
              onChange={(e) => set(prev => ({ ...prev, textureName: e.target.value }))}
              placeholder="T_Texture_BC"
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 w-32 focus:outline-none focus:border-blue-500 transition-colors"
              title="Set the name used when exporting the texture"
            />
          </div>
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-4">
            <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-400" title="Undo (Ctrl+Z)">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-400" title="Redo (Ctrl+Y)">
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleLoadFiles} />
          <a
            href="https://www.fab.com/listings/9b4a13ba-d6d9-4811-b993-4d628edf9d0c"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium px-3 py-1.5 rounded transition-colors border border-zinc-700"
            title="Unreal Plugin"
          >
            <ExternalLink className="w-4 h-4" />
            Unreal Plugin
          </a>
          <button onClick={handleOpenDirectory} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium px-3 py-1.5 rounded transition-colors border border-zinc-700" title="Load images or directories into the asset library">
            <FolderOpen className="w-4 h-4" />
            Load Assets
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {mode === 'atlas' && (
          <>
            <Toolbox
              selectedAsset={selectedAsset}
              updateAsset={(u) => { if (selectedAsset) updateAsset(selectedAsset.id, u); }}
              onPack={packAtlas}
              onPackElements={packElements}
              onNewAtlas={createNewAtlas}
              onFixGrid={fixGrid}
              onAutoDetect={handleAutoDetectMainGrid}
              onExport={exportAtlas}
              onAddToLibrary={addToLibrary}
              onExportZip={exportGridZip}
              gridSettings={state.gridSettings}

              onGridSettingsChange={(gs) => {
                const prev = state.gridSettings;
                const isModeSwitch = gs.mode !== prev.mode;
                const isStructuralChange = 
                  gs.cellSize !== prev.cellSize ||
                  gs.cellY !== prev.cellY ||
                  gs.padding !== prev.padding ||
                  gs.keepSquare !== prev.keepSquare ||
                  gs.packingAlgo !== prev.packingAlgo;

                const hasContent = state.atlasEntries.length > 0 || state.clearedCells.length > 0;
                const needsPrompt = (state.atlasStatus === 'modified' || state.atlasStatus === 'baked' || hasContent) && isStructuralChange;

                if (isModeSwitch || needsPrompt) {
                  const message = isModeSwitch 
                    ? `Switching to ${gs.mode === 'packing' ? 'Packing' : 'Grid'} mode will reset the canvas. Continue?`
                    : 'Changing grid settings will revert the atlas to the source image. Manual changes will be lost. Continue?';
                  
                  if (!confirm(message)) return;
                }
                
                // If we have a source asset and are in a grid mode, re-slice if structural or mode switch.
                const sourceAsset = [...state.libraryAssets, ...state.modifiedAssets].find(t => t.id === state.lastSourceAssetId);
                
                if (sourceAsset && gs.mode === 'fixed' && (isModeSwitch || isStructuralChange)) {
                   const validated = checkGridDensity(sourceAsset.width, sourceAsset.height, gs.cellSize, gs.cellY || gs.cellSize);
                   if (!validated) return;
                   
                   const finalGs = { ...gs, cellSize: validated.cellSize, cellY: validated.cellY };
                   set(prev => ({ ...prev, gridSettings: finalGs, atlasEntries: [], clearedCells: [], atlasStatus: 'parametric' }));
                   performGridSlice(sourceAsset, state.canvasWidth, state.canvasHeight, true, finalGs);
                } else {
                   // If switching TO packing mode, or no source asset, just reset entries
                   if (isModeSwitch) {
                     set(prev => ({ ...prev, gridSettings: gs, atlasEntries: [], clearedCells: [], atlasStatus: 'parametric' }));
                   } else {
                     set(prev => ({ ...prev, gridSettings: gs }));
                   }
                }
              }}
              dragMode={state.dragMode}
              setDragMode={(val) => set(prev => ({ ...prev, dragMode: val }))}
              resizeMode={state.resizeMode}
              onResizeModeChange={(rm) => set(prev => ({ ...prev, resizeMode: rm }))}
              addMode={state.addMode}
              onAddModeChange={(am) => set(prev => ({ ...prev, addMode: am }))}
              autoDetectEnabled={state.autoDetectEnabled}
              onAutoDetectEnabledChange={(val) => set(prev => ({ ...prev, autoDetectEnabled: val }))}
              debugIslandDetection={state.debugIslandDetection}
              onDebugIslandDetectionChange={(val) => set(prev => ({ ...prev, debugIslandDetection: val, debugIslands: val ? prev.debugIslands : [] }))}
              />

            <div className="flex-1 flex overflow-hidden" ref={splitPaneRef}>
              <div style={{ flex: canvasWidth > 0 ? splitRatio : 1 }} className="flex overflow-hidden">
                {canvasWidth > 0 ? (
                  <MainAtlas
                    entries={state.atlasEntries}
                    setEntries={(entries) => {
                      const next = typeof entries === 'function' ? (entries as any)(state.atlasEntries) : entries;
                      executeCommand(new SetMainTilesCommand(state.atlasEntries, next));
                    }}
                    onRemoveEntry={(entry) => executeCommand(new RemoveTilesCommand([entry]))}
                    onDrop={handleMainAtlasDrop}
                    gridSettings={state.gridSettings}
                    selectedCells={selectedCells}
                    onSelectedCellsChange={setSelectedCells}
                    dragMode={state.dragMode}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    tooltip="MMB: Pan | L-Click: Select | R-Drag: Move | R-Click: Clear | Ctrl+Z/Y: Undo/Redo"
                    sourceAsset={[...state.libraryAssets, ...state.modifiedAssets].find(t => t.id === state.lastSourceAssetId)}
                    clearedCells={state.clearedCells}
                    atlasStatus={state.atlasStatus}
                    onMaterialize={handleMaterialize}
                    debugIslands={state.debugIslands}
                  />
                ) : (
                  <div
                    className="flex-1 flex flex-col items-center justify-center bg-zinc-950 border-r border-zinc-800"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const asset = state.libraryAssets.find(t => t.id === e.dataTransfer.getData('text/plain'));
                      if (asset) handleAssetClick(asset);
                    }}
                  >
                    <div className="p-12 border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center gap-6 max-w-lg text-center">
                      <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800 shadow-inner">
                        <ImageIcon className="w-10 h-10 text-zinc-600" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-zinc-200 tracking-tight">Create atlas or drag in existing one</h3>
                        <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto leading-relaxed">
                          Start fresh with a specific resolution or drag a texture from the Asset Browser to automatically slice it into tiles.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
                        {[1024, 2048, 4096, 0].map(size => (
                          <button
                            key={size}
                            onClick={() => createNewAtlas(size)}
                            className={cn(
                              'flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border',
                              size === 0
                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                                : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                            )}
                          >
                            {size === 0 ? <Plus className="w-4 h-4" /> : null}
                            {size === 0 ? 'Custom Size...' : `${size}x${size}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {canvasWidth > 0 && (
                <>
                  <div
                    className={cn('w-1 bg-zinc-800 hover:bg-blue-500 cursor-col-resize transition-colors z-50', isResizing && 'bg-blue-600 w-1.5')}
                    onPointerDown={(e) => { setIsResizing(true); e.preventDefault(); }}
                  />
                  <div style={{ flex: 1 - splitRatio }} className="flex overflow-hidden">
                    <SourceAtlas
                      onAddAsset={(asset) => handleMainAtlasDrop(asset, 0, 0)}
                      gridSettings={state.sourceGridSettings}
                      onGridSettingsChange={(gs) => {
                        const sourceAsset = [...state.libraryAssets, ...state.modifiedAssets].find(t => t.id === state.lastSourceAssetId);
                        if (sourceAsset) {
                          const validated = checkGridDensity(sourceAsset.width, sourceAsset.height, gs.cellSize, gs.cellY || gs.cellSize);
                          if (!validated) return;
                          set(prev => ({ ...prev, sourceGridSettings: { ...gs, cellSize: validated.cellSize, cellY: validated.cellY } }));
                        } else {
                          set(prev => ({ ...prev, sourceGridSettings: gs }));
                        }
                      }}
                      onAutoDetectGrid={handleAutoDetectSourceGrid}
                      availableAssets={[...state.libraryAssets, ...state.modifiedAssets, ...state.atlasEntries]}
                      onSourceCellClick={handleSourceCellClick}
                      onSourceCellRightClick={handleSourceCellRightClick}
                      mainGridSettings={state.gridSettings}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                      autoDetectEnabled={state.autoDetectEnabled}
                      onAutoDetectEnabledChange={(enabled) => set(prev => ({ ...prev, autoDetectEnabled: enabled }))}
                      resizeMode={state.resizeMode}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {mode === 'adjust' && (
          <div
            className="flex-1 flex overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              const asset = [...state.libraryAssets, ...state.modifiedAssets, ...state.atlasEntries, ...activeAssets].find(t => t.id === id);
              if (asset) handleAssetClick(asset);
            }}
          >
            <AdjustMode
              selectedAsset={selectedAsset}
              updateAsset={updateAsset}
              onExport={handleResultExport}
              adjustSettings={state.adjustSettings}
              onAdjustSettingsChange={(as) => set(prev => ({ ...prev, adjustSettings: as }))}
            />
          </div>
        )}

        {mode === 'channel-pack' && (
          <ChannelPackerMode
            availableAssets={[...state.libraryAssets, ...state.modifiedAssets, ...state.atlasEntries, ...activeAssets]}
            mapping={state.packerMapping}
            setMapping={(m) => set(prev => ({ ...prev, packerMapping: m }))}
            pbrSet={state.pbrSet}
            setPbrSet={(p) => set(prev => ({ ...prev, pbrSet: p }))}
            onExport={handleResultExport}
            onGetSnapshot={handleGetMainAtlasSnapshot}
          />
        )}

        {mode === 'layering' && (
          <LayeringMode
            availableAssets={[...state.libraryAssets, ...state.modifiedAssets, ...state.atlasEntries, ...activeAssets]}
            layers={state.layeringLayers}
            setLayers={(l) => set(prev => ({ ...prev, layeringLayers: l }))}
            onExport={handleResultExport}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            onGetSnapshot={handleGetMainAtlasSnapshot}
          />
        )}

        <SecondaryAtlas
          assets={state.libraryAssets}
          activeAssets={activeAssets}
          onAssetClick={handleAssetClick}
          onFilesDrop={addFilesToLibrary}
          onClear={handleClearLibrary}
          onGetSnapshot={handleGetMainAtlasSnapshot}
          virtualMainAtlasPreview={virtualMainAtlasPreview}
        />
      </div>
    </div>
  );
}
