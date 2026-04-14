export interface TextureTile {
  id: string;
  file?: File;
  url: string;
  sourceUrl?: string; // Original URL before resampling
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  hue: number;
  brightness: number;
  scale: number;
  isCrop?: boolean;
}

export type AppMode = 'atlas' | 'adjust' | 'channel-pack' | 'layering';
export type GridMode = 'perfect' | 'fixed' | 'packing';

export interface GridSettings {
  mode: GridMode;
  gridX: number;
  gridY: number;
  keepSquare: boolean;
  cellSize: number;
  cellY?: number;
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
  canvasSize: number;
  canvasWidth?: number;
  canvasHeight?: number;
  adjustSettings: AdjustSettings;
  lastSourceTileId: string | null;
}


