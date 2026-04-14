import { TextureTile } from '../types';

export type TileChangeListener = (tile: TextureTile) => void;

export class TileRegistry {
  private static instance: TileRegistry;
  private tiles: Map<string, TextureTile> = new Map();
  private listeners: Map<string, Set<TileChangeListener>> = new Map();

  private constructor() {}

  public static getInstance(): TileRegistry {
    if (!TileRegistry.instance) {
      TileRegistry.instance = new TileRegistry();
    }
    return TileRegistry.instance;
  }

  public register(tile: TextureTile): string {
    this.tiles.set(tile.id, tile);
    this.notify(tile.id);
    return tile.id;
  }

  public registerMany(tiles: TextureTile[]): string[] {
    tiles.forEach(t => this.tiles.set(t.id, t));
    tiles.forEach(t => this.notify(t.id));
    return tiles.map(t => t.id);
  }

  public get(id: string): TextureTile | undefined {
    return this.tiles.get(id);
  }

  public update(id: string, updates: Partial<TextureTile>): void {
    const tile = this.tiles.get(id);
    if (tile) {
      const updated = { ...tile, ...updates };
      this.tiles.set(id, updated);
      this.notify(id);
    }
  }

  public subscribe(id: string, listener: TileChangeListener): () => void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }
    this.listeners.get(id)!.add(listener);
    return () => {
      this.listeners.get(id)?.delete(listener);
    };
  }

  private notify(id: string): void {
    const tile = this.tiles.get(id);
    if (tile && this.listeners.has(id)) {
      this.listeners.get(id)!.forEach(l => l(tile));
    }
  }

  /**
   * Helper to ensure a tile object is in the registry and return its ID.
   */
  public ensure(tile: TextureTile): string {
    if (!this.tiles.has(tile.id)) {
      this.register(tile);
    } else {
      // Sync data if already exists but might be newer object
      this.tiles.set(tile.id, { ...this.tiles.get(tile.id)!, ...tile });
    }
    return tile.id;
  }
}

export const tileRegistry = TileRegistry.getInstance();
