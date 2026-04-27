export const VIRTUAL_MAIN_ATLAS_ID = 'virtual-main-atlas';

export interface TextureAsset {
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
export type ResizeMode = 'fill' | 'fit' | 'crop';

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
  asset: TextureAsset;
  opacity: number;
  transparentColor: string | null; // hex color like #ff00ff
  tolerance: number; // 0-255
  visible: boolean;
}


export interface ChannelMapping {
  r: { asset: TextureAsset | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
  g: { asset: TextureAsset | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
  b: { asset: TextureAsset | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
  a: { asset: TextureAsset | null; sourceChannel: 'r' | 'g' | 'b' | 'a' };
}

export interface PBRSet {
  baseColor: { asset: TextureAsset | null; active: boolean };
  normal: { asset: TextureAsset | null; active: boolean };
  orm: { asset: TextureAsset | null; active: boolean };
}

export interface AdjustSettings {
  targetW: number | 'source';
  targetH: number | 'source';
}

export type AtlasStatus = 'parametric' | 'modified' | 'baked';

export interface AppState {
  atlasEntries: TextureAsset[];
  libraryAssets: TextureAsset[];
  modifiedAssets: TextureAsset[];
  gridSettings: GridSettings;
  sourceGridSettings: GridSettings;
  packerMapping: ChannelMapping;
  pbrSet: PBRSet;
  layeringLayers: Layer[];
  atlasSwapMode: boolean;
  resizeMode: ResizeMode;
  atlasStatus: AtlasStatus;
  canvasWidth: number;
  canvasHeight: number;
  adjustSettings: AdjustSettings;
  lastSourceAssetId: string | null;
  clearedCells: string[];
  autoDetectEnabled: boolean;
  debugIslands: { x: number; y: number; w: number; h: number }[];
  debugIslandDetection: boolean;
  textureName: string;
}


