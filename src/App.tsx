import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { TextureTile, AppMode, GridSettings, ChannelMapping, PBRSet, Layer, AppState } from './types';
import { MainAtlas } from './components/MainAtlas';
import { SourceAtlas } from './components/SourceAtlas';
import { SecondaryAtlas } from './components/SecondaryAtlas';
import { Toolbox } from './components/Toolbox';
import { ChannelPackerMode } from './components/ChannelPackerMode';
import { LayeringMode } from './components/LayeringMode';
import { AdjustMode } from './components/AdjustMode';
import { FolderOpen, LayoutTemplate, Layers, Palette, SlidersHorizontal, Undo2, Redo2, Plus, Image as ImageIcon } from 'lucide-react';
import { cn } from './lib/utils';
import { useHistory } from './hooks/useHistory';
import { useAtlas } from './hooks/useAtlas';
import { useGridSlice } from './hooks/useGridSlice';
import { useAutoDetect } from './hooks/useAutoDetect';
import { useAtlasOps } from './hooks/useAtlasOps';
import { useAssetLibrary } from './hooks/useAssetLibrary';
import { AddTilesCommand, PatchCommand } from './lib/Commands';
import { tileRegistry } from './lib/TileRegistry';
import { generateId } from './lib/canvas';

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
      gridX: 8, gridY: 8,
      keepSquare: true,
      cellSize: 128, cellY: 128,
      padding: 0,
      clearColor: '#000000',
      clearTolerance: 10,
      packingAlgo: 'potpack',
    },
    sourceGridSettings: {
      mode: 'fixed',
      gridX: 8, gridY: 8,
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
    canvasWidth: 0,
    canvasHeight: 0,
    adjustSettings: { targetW: 'source', targetH: 'source' },
    lastSourceTileId: null,
    clearedCells: [],
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

  const { handleAutoDetectMainGrid, handleAutoDetectSourceGrid } =
    useAutoDetect(state, canvasWidth, canvasHeight, set);

  const { packAtlas, fixGrid, packElements, exportAtlas, createNewAtlas } =
    useAtlasOps(state, canvasWidth, canvasHeight, mainAtlas.geo, set, executeCommand, () => {
      setSelectedTileId(null);
      setSelectedCells([]);
    });

  const { addFilesToLibrary, handleOpenDirectory, handleLoadFiles, handleClearLibrary } =
    useAssetLibrary(state, set, fileInputRef);

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeTiles = useMemo(() => {
    const candidates = [
      ...state.modifiedTiles,
      ...state.mainTiles.filter(t => !t.isCrop),
      ...state.layeringLayers.map(l => l.tile),
      ...[state.packerMapping.r.tile, state.packerMapping.g.tile,
          state.packerMapping.b.tile, state.packerMapping.a.tile].filter((t): t is TextureTile => t !== null),
      ...[state.pbrSet.baseColor.tile, state.pbrSet.normal.tile,
          state.pbrSet.orm.tile].filter((t): t is TextureTile => t !== null),
    ];
    return candidates.filter((v, i, a) =>
      a.findIndex(t => t.url === v.url && t.hue === v.hue && t.brightness === v.brightness && t.scale === v.scale) === i
    );
  }, [state.modifiedTiles, state.mainTiles, state.layeringLayers, state.packerMapping, state.pbrSet]);

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
    if (mode === 'atlas') {
      set(prev => ({
        ...prev,
        canvasWidth: tile.width, canvasHeight: tile.height,
        mainTiles: [], lastSourceTileId: tile.id, clearedCells: [],
      }));
      setSelectedTileId(null);
      setSelectedCells([]);
      setTimeout(() => performGridSlice(tile, tile.width, tile.height, false), 50);
    } else if (mode === 'adjust') {
      if (state.secondaryTiles.some(t => t.id === tile.id)) {
        const existing = state.modifiedTiles.find(t => t.name === tile.name && t.file === tile.file);
        if (existing) {
          setSelectedTileId(existing.id);
        } else {
          const modified = { ...tile, id: generateId() };
          set(prev => ({ ...prev, modifiedTiles: [...prev.modifiedTiles, modified] }));
          setSelectedTileId(modified.id);
        }
      } else {
        setSelectedTileId(tile.id);
      }
    } else if (mode === 'layering') {
      const newLayer: Layer = {
        id: generateId(), tile: { ...tile },
        opacity: 1, transparentColor: null, tolerance: 10, visible: true,
      };
      set(prev => ({ ...prev, layeringLayers: [newLayer, ...prev.layeringLayers] }));
    }
  }, [mode, state.secondaryTiles, state.modifiedTiles, set, performGridSlice]);

  const handleMainAtlasDrop = useCallback((tileOrId: string | TextureTile, x: number, y: number) => {
    const tile = typeof tileOrId === 'string'
      ? [...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles].find(t => t.id === tileOrId)
      : tileOrId;
    if (!tile) return;

    if (state.secondaryTiles.some(t => t.id === tile.id)) {
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
    }));
  }, [state.gridSettings, state.sourceGridSettings, state.adjustSettings]);

  useEffect(() => {
    localStorage.setItem('forge_mode', mode);
  }, [mode]);

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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <LayoutTemplate className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">TextureForge</h1>
          </div>
          <div className="flex items-center bg-zinc-950 rounded-lg p-1 border border-zinc-800">
            {([
              { id: 'atlas', icon: LayoutTemplate, label: 'Atlas' },
              { id: 'adjust', icon: SlidersHorizontal, label: 'Adjust' },
              { id: 'channel-pack', icon: Palette, label: 'Channel Pack' },
              { id: 'layering', icon: Layers, label: 'Layering' },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id as AppMode)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors',
                  mode === m.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <m.icon className="w-4 h-4" />
                {m.label}
              </button>
            ))}
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
          <button onClick={handleOpenDirectory} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium px-3 py-1.5 rounded transition-colors border border-zinc-700">
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
              onGridSettingsChange={(gs) => set(prev => ({ ...prev, gridSettings: gs }))}
              atlasSwapMode={state.atlasSwapMode}
              setAtlasSwapMode={(val) => set(prev => ({ ...prev, atlasSwapMode: val }))}
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
                      onGridSettingsChange={(gs) => set(prev => ({ ...prev, sourceGridSettings: gs }))}
                      onAutoDetectGrid={handleAutoDetectSourceGrid}
                      availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]}
                      onSourceCellClick={handleSourceCellClick}
                      onSourceCellRightClick={handleSourceCellRightClick}
                      mainGridSettings={state.gridSettings}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
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
              const tile = [...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]
                .find(t => t.id === e.dataTransfer.getData('text/plain'));
              if (tile) handleAssetClick(tile);
            }}
          >
            <AdjustMode
              selectedTile={selectedTile}
              updateTile={updateTile}
              onExport={() => {}}
              adjustSettings={state.adjustSettings}
              onAdjustSettingsChange={(as) => set(prev => ({ ...prev, adjustSettings: as }))}
            />
          </div>
        )}

        {mode === 'channel-pack' && (
          <ChannelPackerMode
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]}
            mapping={state.packerMapping}
            setMapping={(m) => set(prev => ({ ...prev, packerMapping: m }))}
            pbrSet={state.pbrSet}
            setPbrSet={(p) => set(prev => ({ ...prev, pbrSet: p }))}
            onExport={() => {}}
          />
        )}

        {mode === 'layering' && (
          <LayeringMode
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]}
            layers={state.layeringLayers}
            setLayers={(l) => set(prev => ({ ...prev, layeringLayers: l }))}
            onExport={() => {}}
          />
        )}

        <SecondaryAtlas
          tiles={state.secondaryTiles}
          activeTiles={activeTiles}
          onTileClick={handleAssetClick}
          onFilesDrop={addFilesToLibrary}
          onClear={handleClearLibrary}
        />
      </div>
    </div>
  );
}
