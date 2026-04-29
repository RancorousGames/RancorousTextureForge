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

  /**
   * Cleans up blob URLs that are not present in the current active sets.
   */
  garbageCollect(activeAssets: TextureAsset[]) {
    const activeIds = new Set(activeAssets.map(a => a.id));
    const activeUrls = new Set(activeAssets.map(a => a.url).filter(u => u.startsWith('blob:')));
    
    // Also include sourceUrls if they are blobs
    activeAssets.forEach(a => {
      if (a.sourceUrl && a.sourceUrl.startsWith('blob:')) {
        activeUrls.add(a.sourceUrl);
      }
    });

    for (const [id, asset] of this.registry.entries()) {
      if (!activeIds.has(id)) {
        if (asset.url.startsWith('blob:') && !activeUrls.has(asset.url)) {
          console.log(`[Registry] Revoking URL for orphaned asset: ${asset.name} (${id})`);
          URL.revokeObjectURL(asset.url);
        }
        this.registry.delete(id);
      }
    }
  }

  clear() {
    for (const asset of this.registry.values()) {
      if (asset.url.startsWith('blob:')) {
        URL.revokeObjectURL(asset.url);
      }
    }
    this.registry.clear();
  }
}

export const assetRegistry = new AssetRegistry();
export const tileRegistry = assetRegistry; // Alias for backward compatibility if needed, though we should update callers
