import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { TextureTile, AppMode, GridSettings, ChannelMapping, PBRSet, Layer, AppState, VIRTUAL_MAIN_ATLAS_ID } from './types';
import { MainAtlas } from './components/MainAtlas';
import { SourceAtlas } from './components/SourceAtlas';
import { SecondaryAtlas } from './components/SecondaryAtlas';
import { Toolbox } from './components/Toolbox';
import { ChannelPackerMode } from './components/ChannelPackerMode';
import { LayeringMode } from './components/LayeringMode';
import { AdjustMode } from './components/AdjustMode';
import { FolderOpen, LayoutTemplate, Layers, Palette, SlidersHorizontal, Undo2, Redo2, Plus, Image as ImageIcon, ExternalLink, Type } from 'lucide-react';
import { cn, checkGridDensity } from './lib/utils';
import { useHistory } from './hooks/useHistory';
import { useAtlas } from './hooks/useAtlas';
import { useGridSlice } from './hooks/useGridSlice';
import { useAutoDetect } from './hooks/useAutoDetect';
import { useAtlasOps } from './hooks/useAtlasOps';
import { useAssetLibrary } from './hooks/useAssetLibrary';
import { AddTilesCommand, PatchCommand } from './lib/Commands';
import { tileRegistry } from './lib/TileRegistry';
import { generateId, renderTilesToCanvas } from './lib/canvas';

const initialPackerMapping: ChannelMapping = {
  r: { tile: null, sourceChannel: 'r' },
  g: { tile: null, sourceChannel: 'r' },
  b: { tile: null, sourceChannel: 'r' },
  a: { tile: null, sourceChannel: 'r' },
};

const initialPBRSet: PBRSet = {
  baseColor: { tile: null, active: true },
  normal: { tile: null, active: true },
  orm: { tile: null, active: true },
};

const FORGE_CONFIG_KEY = 'forge_config_v1';

const getInitialState = (): AppState => {
  const baseState: AppState = {
    mainTiles: [],
    secondaryTiles: [],
    modifiedTiles: [],
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
    atlasSwapMode: false,
    atlasStatus: 'parametric',
    canvasWidth: 0,
    canvasHeight: 0,
    adjustSettings: { targetW: 'source', targetH: 'source' },
    lastSourceTileId: null,
    clearedCells: [],
    autoDetectEnabled: false,
    textureName: 'atlas',
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
        autoDetectEnabled: config.autoDetectEnabled ?? false,
        textureName: config.textureName ?? 'atlas',
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

  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevGridModeRef = useRef(state.gridSettings.mode);

  const { canvasWidth, canvasHeight } = state;

  const mainAtlas = useAtlas(state.gridSettings, canvasWidth, canvasHeight, {
    tiles: state.mainTiles,
    setTiles: (newTiles) => {
      const next = typeof newTiles === 'function' ? newTiles(state.mainTiles) : newTiles;
      executeCommand(new AddTilesCommand(next, state.mainTiles));
    },
  });

  const { performGridSlice, handleMaterialize, handleSourceCellClick, handleSourceCellRightClick } =
    useGridSlice(state, canvasWidth, canvasHeight, mainAtlas.geo, selectedCells, set, executeCommand);

  // After auto-detect updates gridSettings, re-slice the current source image so
  // the tiles immediately reflect the newly detected cell size and padding.
  const onAutoDetectSettingsApplied = useCallback((gs: GridSettings) => {
    const sourceTile = [...state.secondaryTiles, ...state.modifiedTiles]
      .find(t => t.id === state.lastSourceTileId);
    if (sourceTile && gs.mode === 'fixed') {
      const validated = checkGridDensity(sourceTile.width, sourceTile.height, gs.cellSize, gs.cellY || gs.cellSize);
      if (!validated) return;
      
      const finalGs = { ...gs, cellSize: validated.cellSize, cellY: validated.cellY };
      set(prev => ({ ...prev, gridSettings: finalGs, mainTiles: [], clearedCells: [], atlasStatus: 'parametric' }));
      performGridSlice(sourceTile, state.canvasWidth, state.canvasHeight, true, finalGs);
    }
  }, [state.secondaryTiles, state.modifiedTiles, state.lastSourceTileId,
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
      const newTile: TextureTile = {
        id: generateId(),
        url: url,
        name: name,
        width: img.width,
        height: img.height,
        x: 0,
        y: 0,
        hue: 0,
        brightness: 100,
        scale: 1,
      };
      set(prev => ({
        ...prev,
        secondaryTiles: [newTile, ...prev.secondaryTiles]
      }));
    };
    img.src = url;
  }, [set, state.textureName]);

  const { handleAutoDetectMainGrid, handleAutoDetectSourceGrid } =
    useAutoDetect(state, canvasWidth, canvasHeight, set, onAutoDetectSettingsApplied);

  const { packAtlas, fixGrid, packElements, exportAtlas, createNewAtlas } =
    useAtlasOps(state, canvasWidth, canvasHeight, mainAtlas.geo, set, executeCommand, () => {
      setSelectedTileId(null);
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
    const sourceTile = state.lastSourceTileId ? state.secondaryTiles.find(t => t.id === state.lastSourceTileId) : null;
    
    // We'll use a data URL for the SVG
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" fill="${bgColor}" />
        ${sourceTile && state.atlasStatus !== 'baked' ? `
          <image href="${sourceTile.sourceUrl || sourceTile.url}" width="${w}" height="${h}" preserveAspectRatio="none" />
          ${state.clearedCells.map(key => {
            const [cx, cy] = key.split(',').map(Number);
            const sw = state.gridSettings.cellSize;
            const sh = state.gridSettings.cellY || sw;
            return `<rect x="${cx * sw}" y="${cy * sh}" width="${sw}" height="${sh}" fill="${bgColor}" />`;
          }).join('')}
        ` : ''}
        ${state.mainTiles.map(t => {
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
  }, [state.mainTiles, state.canvasWidth, state.canvasHeight, state.gridSettings, state.lastSourceTileId, state.secondaryTiles, state.clearedCells, state.atlasStatus]);

  const handleGetMainAtlasSnapshot = useCallback(async () => {
    const sourceTile = state.lastSourceTileId ? state.secondaryTiles.find(t => t.id === state.lastSourceTileId) : null;
    const sw = state.gridSettings.cellSize;
    const sh = state.gridSettings.cellY || sw;
    
    const canvas = await renderTilesToCanvas(
      state.mainTiles,
      state.canvasWidth,
      state.canvasHeight,
      state.gridSettings.clearColor,
      {
        sourceTile,
        clearedCells: state.clearedCells,
        cellW: sw,
        cellH: sh,
        stepX: sw,
        stepY: sh
      }
    );
    return canvas.toDataURL();
  }, [state.mainTiles, state.canvasWidth, state.canvasHeight, state.gridSettings, state.lastSourceTileId, state.secondaryTiles, state.clearedCells]);

  const activeTiles = useMemo(() => {
    // Show the source atlas texture as one item rather than individual slices
    const sourceTile = state.lastSourceTileId
      ? state.secondaryTiles.find(t => t.id === state.lastSourceTileId)
      : null;

    const candidates: TextureTile[] = [
      {
        id: VIRTUAL_MAIN_ATLAS_ID,
        name: 'Main Atlas (Canvas)',
        url: '', // Will be handled specifically
        width: state.canvasWidth,
        height: state.canvasHeight,
        x: 0, y: 0, hue: 0, brightness: 100, scale: 1
      },
      ...(sourceTile ? [sourceTile] : []),
      ...state.modifiedTiles,
      ...state.layeringLayers.map(l => l.tile),
      ...[state.packerMapping.r.tile, state.packerMapping.g.tile,
          state.packerMapping.b.tile, state.packerMapping.a.tile].filter((t): t is TextureTile => t !== null),
      ...[state.pbrSet.baseColor.tile, state.pbrSet.normal.tile,
          state.pbrSet.orm.tile].filter((t): t is TextureTile => t !== null),
    ];
    return candidates.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
  }, [state.lastSourceTileId, state.secondaryTiles, state.modifiedTiles,
      state.layeringLayers, state.packerMapping, state.pbrSet]);

  const selectedTile = useMemo(() => {
    if (selectedCells.length > 0) {
      const [cx, cy] = selectedCells[0].split(',').map(Number);
      return state.mainTiles.find(t => mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy)) ?? null;
    }
    if (selectedTileId) {
      return state.modifiedTiles.find(t => t.id === selectedTileId)
          ?? state.secondaryTiles.find(t => t.id === selectedTileId)
          ?? null;
    }
    return null;
  }, [selectedCells, selectedTileId, state.mainTiles, state.modifiedTiles, state.secondaryTiles, mainAtlas.geo]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const updateTile = useCallback((id: string, updates: Partial<TextureTile>) => {
    set(prev => {
      if (prev.mainTiles.some(t => t.id === id))
        return { ...prev, mainTiles: prev.mainTiles.map(t => t.id === id ? { ...t, ...updates } : t) };
      if (prev.modifiedTiles.some(t => t.id === id))
        return { ...prev, modifiedTiles: prev.modifiedTiles.map(t => t.id === id ? { ...t, ...updates } : t) };
      if (prev.secondaryTiles.some(t => t.id === id)) {
        const tile = prev.secondaryTiles.find(t => t.id === id)!;
        const modified = { ...tile, ...updates, id: generateId() };
        setSelectedTileId(modified.id);
        return { ...prev, modifiedTiles: [...prev.modifiedTiles, modified] };
      }
      return prev;
    });
  }, [set]);

  const handleAssetClick = useCallback(async (tile: TextureTile) => {
    let effectiveTile = tile;
    if (tile.id === VIRTUAL_MAIN_ATLAS_ID) {
      const url = await handleGetMainAtlasSnapshot();
      effectiveTile = { ...tile, url, id: generateId(), name: `Snapshot ${new Date().toLocaleTimeString()}` };
      set(prev => ({ ...prev, modifiedTiles: [...prev.modifiedTiles, effectiveTile] }));
    }

    if (mode === 'atlas') {
      const shouldSlice = state.gridSettings.mode === 'fixed';
      
      // If auto-detect is enabled, we detect settings first then slice
      if (state.autoDetectEnabled && shouldSlice) {
        // Set basic state first so UI updates canvas size
        set(prev => ({
          ...prev,
          canvasWidth: effectiveTile.width, canvasHeight: effectiveTile.height,
          lastSourceTileId: effectiveTile.id, clearedCells: [],
          mainTiles: [],
          atlasStatus: 'parametric'
        }));
        setSelectedTileId(null);
        setSelectedCells([]);

        // Trigger auto-detect for main grid using this tile
        // This will call onAutoDetectSettingsApplied, but we'll also slice here to be sure
        const newMainSettings = await handleAutoDetectMainGrid(effectiveTile);
        await handleAutoDetectSourceGrid(effectiveTile);
        
        if (newMainSettings) {
           const validated = checkGridDensity(effectiveTile.width, effectiveTile.height, newMainSettings.cellSize, newMainSettings.cellY || newMainSettings.cellSize);
           if (!validated) return;
           const finalSettings = { ...newMainSettings, cellSize: validated.cellSize, cellY: validated.cellY };
           
           // Ensure state is updated if guard changed the settings
           if (finalSettings.cellSize !== newMainSettings.cellSize || finalSettings.cellY !== newMainSettings.cellY) {
             set(prev => ({ ...prev, gridSettings: finalSettings }));
           }
           
           performGridSlice(effectiveTile, effectiveTile.width, effectiveTile.height, false, finalSettings);
        }
        return;
      }

      set(prev => ({
        ...prev,
        canvasWidth: effectiveTile.width, canvasHeight: effectiveTile.height,
        mainTiles: shouldSlice ? [] : [{ ...effectiveTile, id: generateId(), x: 0, y: 0 }], 
        lastSourceTileId: effectiveTile.id, clearedCells: [],
      }));
      setSelectedTileId(null);
      setSelectedCells([]);
      
      if (shouldSlice) {
        performGridSlice(effectiveTile, effectiveTile.width, effectiveTile.height, false);
      }
    } else if (mode === 'adjust') {
      setSelectedTileId(effectiveTile.id);
    } else if (mode === 'layering') {
      const newLayer: Layer = {
        id: generateId(), tile: { ...effectiveTile },
        opacity: 1, transparentColor: null, tolerance: 10, visible: true,
      };
      set(prev => ({ ...prev, layeringLayers: [newLayer, ...prev.layeringLayers] }));
    }
  }, [mode, state.secondaryTiles, state.modifiedTiles, state.autoDetectEnabled, state.gridSettings, handleGetMainAtlasSnapshot, handleAutoDetectMainGrid, handleAutoDetectSourceGrid, performGridSlice, set]);

  const handleMainAtlasDrop = useCallback((tileOrId: string | TextureTile, x: number, y: number) => {
    let tile: TextureTile | undefined;
    
    if (typeof tileOrId === 'string') {
      tile = [...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles, ...activeTiles].find(t => t.id === tileOrId);
    } else {
      tile = tileOrId;
    }
    
    if (!tile) return;

    if (state.secondaryTiles.some(t => t.id === tile.id) || tile.id === VIRTUAL_MAIN_ATLAS_ID) {
      handleAssetClick(tile);
      return;
    }

    let finalX = x, finalY = y;
    if (state.gridSettings.mode !== 'packing') {
      const snapped = mainAtlas.geo.snap(x, y);
      finalX = snapped.x; finalY = snapped.y;

      if (x === 0 && y === 0) {
        outer: for (let r = 0; r < mainAtlas.geo.rows; r++) {
          for (let c = 0; c < mainAtlas.geo.cols; c++) {
            if (!state.mainTiles.some(t => mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, c, r))) {
              ({ x: finalX, y: finalY } = mainAtlas.geo.getPosFromCell(c, r));
              break outer;
            }
          }
        }
      }
    }

    const newTile: TextureTile = {
      ...tile,
      id: generateId(),
      x: finalX, y: finalY,
      width: mainAtlas.geo.cellW,
      height: mainAtlas.geo.cellH,
      isCrop: true,
    };
    tileRegistry.register(newTile);
    const { cx, cy } = mainAtlas.geo.getCellAtPos(finalX, finalY);
    const replacedTiles = state.mainTiles.filter(t =>
      mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy)
    );
    executeCommand([
      new AddTilesCommand([newTile], replacedTiles),
      new PatchCommand({ lastSourceTileId: null }, { lastSourceTileId: state.lastSourceTileId }),
    ]);
  }, [state.secondaryTiles, state.modifiedTiles, state.mainTiles, state.gridSettings.mode,
      state.lastSourceTileId, mainAtlas.geo, handleAssetClick, executeCommand]);

  // ── Effects ────────────────────────────────────────────────────────────────

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

    if (mode !== 'atlas' || !state.lastSourceTileId || currentGridMode === prevGridMode) return;
    
    const sourceTile = [...state.secondaryTiles, ...state.modifiedTiles].find(t => t.id === state.lastSourceTileId);
    if (!sourceTile) return;

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
      performGridSlice(sourceTile, state.canvasWidth, state.canvasHeight, true);
    } else if (currentGridMode === 'packing' && wasGridMode) {
      // Revert to full image THEN trigger pack to turn it into islands immediately
      set(prev => ({
        ...prev,
        mainTiles: [{ ...sourceTile, id: generateId(), x: 0, y: 0, isCrop: false }],
        clearedCells: [],
        atlasStatus: 'baked' // Set to baked immediately to hide background
      }));
      // Wait for state to settle then turn into islands
      setTimeout(() => packElements(), 50);
    }
  }, [state.gridSettings.mode, mode, state.lastSourceTileId, state.secondaryTiles, state.modifiedTiles, state.canvasWidth, state.canvasHeight, state.atlasStatus, performGridSlice, packElements, set]);

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
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
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
              placeholder="Texture Name"
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
              selectedTile={selectedTile}
              updateTile={(u) => { if (selectedTile) updateTile(selectedTile.id, u); }}
              onPack={packAtlas}
              onPackElements={packElements}
              onNewAtlas={createNewAtlas}
              onFixGrid={fixGrid}
              onAutoDetect={handleAutoDetectMainGrid}
              onExport={exportAtlas}
              gridSettings={state.gridSettings}
              onGridSettingsChange={(gs) => {
                const needsPrompt = state.atlasStatus === 'modified' || state.atlasStatus === 'baked';
                if (needsPrompt && !confirm('Changing grid settings will revert the atlas to the source image. Manual changes will be lost. Continue?')) return;
                
                // If we have a source tile and are in a grid mode, re-slice.
                const sourceTile = [...state.secondaryTiles, ...state.modifiedTiles].find(t => t.id === state.lastSourceTileId);
                if (sourceTile && gs.mode === 'fixed') {
                   const validated = checkGridDensity(sourceTile.width, sourceTile.height, gs.cellSize, gs.cellY || gs.cellSize);
                   if (!validated) return;
                   
                   const finalGs = { ...gs, cellSize: validated.cellSize, cellY: validated.cellY };
                   set(prev => ({ ...prev, gridSettings: finalGs, mainTiles: [], clearedCells: [], atlasStatus: 'parametric' }));
                   performGridSlice(sourceTile, state.canvasWidth, state.canvasHeight, true, finalGs);
                } else {
                   set(prev => ({ ...prev, gridSettings: gs }));
                }
              }}
              atlasSwapMode={state.atlasSwapMode}
              setAtlasSwapMode={(val) => set(prev => ({ ...prev, atlasSwapMode: val }))}
              autoDetectEnabled={state.autoDetectEnabled}
              onAutoDetectEnabledChange={(enabled) => set(prev => ({ ...prev, autoDetectEnabled: enabled }))}
            />
            <div className="flex-1 flex overflow-hidden" ref={splitPaneRef}>
              <div style={{ flex: canvasWidth > 0 ? splitRatio : 1 }} className="flex overflow-hidden">
                {canvasWidth > 0 ? (
                  <MainAtlas
                    tiles={state.mainTiles}
                    setTiles={(tiles) => {
                      const next = typeof tiles === 'function' ? (tiles as any)(state.mainTiles) : tiles;
                      set(prev => ({ ...prev, mainTiles: next }));
                    }}
                    onRemoveTile={(tile) => set(prev => ({ ...prev, mainTiles: prev.mainTiles.filter(t => t.id !== tile.id) }))}
                    onDrop={handleMainAtlasDrop}
                    gridSettings={state.gridSettings}
                    selectedCells={selectedCells}
                    onSelectedCellsChange={setSelectedCells}
                    atlasSwapMode={state.atlasSwapMode}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    tooltip="L-Click: Select | R-Drag: Move | R-Click: Clear | Ctrl+Z/Y: Undo/Redo"
                    sourceTile={[...state.secondaryTiles, ...state.modifiedTiles].find(t => t.id === state.lastSourceTileId)}
                    clearedCells={state.clearedCells}
                    atlasStatus={state.atlasStatus}
                    onMaterialize={handleMaterialize}
                  />
                ) : (
                  <div
                    className="flex-1 flex flex-col items-center justify-center bg-zinc-950 border-r border-zinc-800"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const tile = state.secondaryTiles.find(t => t.id === e.dataTransfer.getData('text/plain'));
                      if (tile) handleAssetClick(tile);
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
                      onAddTile={(tile) => handleMainAtlasDrop(tile, 0, 0)}
                      gridSettings={state.sourceGridSettings}
                      onGridSettingsChange={(gs) => {
                        const sourceTile = [...state.secondaryTiles, ...state.modifiedTiles].find(t => t.id === state.lastSourceTileId);
                        if (sourceTile) {
                          const validated = checkGridDensity(sourceTile.width, sourceTile.height, gs.cellSize, gs.cellY || gs.cellSize);
                          if (!validated) return;
                          set(prev => ({ ...prev, sourceGridSettings: { ...gs, cellSize: validated.cellSize, cellY: validated.cellY } }));
                        } else {
                          set(prev => ({ ...prev, sourceGridSettings: gs }));
                        }
                      }}
                      onAutoDetectGrid={handleAutoDetectSourceGrid}
                      availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]}
                      onSourceCellClick={handleSourceCellClick}
                      onSourceCellRightClick={handleSourceCellRightClick}
                      mainGridSettings={state.gridSettings}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                      autoDetectEnabled={state.autoDetectEnabled}
                      onAutoDetectEnabledChange={(enabled) => set(prev => ({ ...prev, autoDetectEnabled: enabled }))}
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
              const tile = [...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles, ...activeTiles].find(t => t.id === id);
              if (tile) handleAssetClick(tile);
            }}
          >
            <AdjustMode
              selectedTile={selectedTile}
              updateTile={updateTile}
              onExport={handleResultExport}
              adjustSettings={state.adjustSettings}
              onAdjustSettingsChange={(as) => set(prev => ({ ...prev, adjustSettings: as }))}
            />
          </div>
        )}

        {mode === 'channel-pack' && (
          <ChannelPackerMode
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles, ...activeTiles]}
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
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles, ...activeTiles]}
            layers={state.layeringLayers}
            setLayers={(l) => set(prev => ({ ...prev, layeringLayers: l }))}
            onExport={handleResultExport}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            onGetSnapshot={handleGetMainAtlasSnapshot}
          />
        )}

        <SecondaryAtlas
          tiles={state.secondaryTiles}
          activeTiles={activeTiles}
          onTileClick={handleAssetClick}
          onFilesDrop={addFilesToLibrary}
          onClear={handleClearLibrary}
          onGetSnapshot={handleGetMainAtlasSnapshot}
          virtualMainAtlasPreview={virtualMainAtlasPreview}
        />
      </div>
    </div>
  );
}
