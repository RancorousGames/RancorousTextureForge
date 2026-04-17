export interface TextureTile {
  id: string;
  file?: File;
  url: string;
  sourceUrl?: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  hue: number;
  brightness: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  isCrop?: boolean;
  sourceX?: number;
  sourceY?: number;
  sourceW?: number;
  sourceH?: number;
}

export type AppMode = 'atlas' | 'adjust' | 'channel-pack' | 'layering';
export type GridMode = 'fixed' | 'packing';

export interface GridSettings {
  mode: GridMode;
  keepSquare: boolean;
  cellSize: number;
  cellY: number;
  padding: number;
  clearColor: string;
  clearTolerance: number;
  packingAlgo?: string;
}


export interface Layer {
  id: string;
  tile: TextureTile;
  opacity: number;
  transparentColor: string | null; // hex color like #ff00ff
  tolerance: number; // 0-255
  visible: boolean;
}


export interface ChannelMapping {
  r: { tile: TextureTile | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
  g: { tile: TextureTile | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
  b: { tile: TextureTile | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
  a: { tile: TextureTile | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
}

export interface PBRSet {
  baseColor: { tile: TextureTile | null; active: boolean };
  normal: { tile: TextureTile | null; active: boolean };
  orm: { tile: TextureTile | null; active: boolean };
}

export interface AdjustSettings {
  targetW: number | 'source';
  targetH: number | 'source';
}

export type AtlasStatus = 'parametric' | 'modified' | 'baked';

export interface AppState {
  mainTiles: TextureTile[];
  secondaryTiles: TextureTile[];
  modifiedTiles: TextureTile[];
  gridSettings: GridSettings;
  sourceGridSettings: GridSettings;
  packerMapping: ChannelMapping;
  pbrSet: PBRSet;
  layeringLayers: Layer[];
  atlasSwapMode: boolean;
  atlasStatus: AtlasStatus;
  canvasWidth: number;
  canvasHeight: number;
  adjustSettings: AdjustSettings;
  lastSourceTileId: string | null;
  clearedCells: string[];
}


