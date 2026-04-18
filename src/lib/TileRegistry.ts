import { TextureTile } from '../types';

class TileRegistry {
  private registry = new Map<string, TextureTile>();

  register(tile: TextureTile) {
    this.registry.set(tile.id, tile);
  }

  registerMany(tiles: TextureTile[]) {
    tiles.forEach(t => this.register(t));
  }

  get(id: string): TextureTile | undefined {
    return this.registry.get(id);
  }

  clear() {
    this.registry.clear();
  }
}

export const tileRegistry = new TileRegistry();
