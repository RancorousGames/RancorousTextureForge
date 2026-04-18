import { TextureAsset } from '../types';

class AssetRegistry {
  private registry = new Map<string, TextureAsset>();

  register(asset: TextureAsset) {
    this.registry.set(asset.id, asset);
  }

  registerMany(assets: TextureAsset[]) {
    assets.forEach(t => this.register(t));
  }

  get(id: string): TextureAsset | undefined {
    return this.registry.get(id);
  }

  clear() {
    this.registry.clear();
  }
}

export const assetRegistry = new AssetRegistry();
export const tileRegistry = assetRegistry; // Alias for backward compatibility if needed, though we should update callers
