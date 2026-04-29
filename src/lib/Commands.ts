import { AppState, TextureAsset, AtlasStatus } from '../types';

export interface Command {
  execute(state: AppState): AppState;
  undo(state: AppState): AppState;
  getAssets(): TextureAsset[];
}

export class PatchCommand implements Command {
  constructor(
    private forward: Partial<AppState>,
    private backward: Partial<AppState>
  ) {}

  execute(state: AppState): AppState {
    return { ...state, ...this.forward };
  }

  undo(state: AppState): AppState {
    return { ...state, ...this.backward };
  }

  getAssets(): TextureAsset[] {
    const assets: TextureAsset[] = [];
    const extract = (obj: any) => {
      if (!obj) return;
      if (obj.id && obj.url) {
        assets.push(obj as TextureAsset);
      } else if (Array.isArray(obj)) {
        obj.forEach(extract);
      } else if (typeof obj === 'object') {
        Object.values(obj).forEach(extract);
      }
    };
    extract(this.forward);
    extract(this.backward);
    return assets;
  }
}

export class MoveTileCommand implements Command {
  constructor(
    private entryId: string,
    private oldPos: { x: number, y: number },
    private newPos: { x: number, y: number }
  ) {}

  execute(state: AppState): AppState {
    return {
      ...state,
      atlasEntries: state.atlasEntries.map(e => e.id === this.entryId ? { ...e, x: this.newPos.x, y: this.newPos.y } : e)
    };
  }

  undo(state: AppState): AppState {
    return {
      ...state,
      atlasEntries: state.atlasEntries.map(e => e.id === this.entryId ? { ...e, x: this.oldPos.x, y: this.oldPos.y } : e)
    };
  }

  getAssets(): TextureAsset[] {
    return [];
  }
}

export class AddTilesCommand implements Command {
  constructor(
    private newEntries: TextureAsset[],
    private replacedEntries: TextureAsset[],
    private oldLastId?: string | null,
    private newLastId?: string | null
  ) {}

  execute(state: AppState): AppState {
    const idsToRemove = new Set([
      ...this.replacedEntries.map(e => e.id),
      ...this.newEntries.map(e => e.id)
    ]);
    return {
      ...state,
      atlasEntries: [...state.atlasEntries.filter(e => !idsToRemove.has(e.id)), ...this.newEntries],
      lastMainAssetId: this.newLastId !== undefined ? this.newLastId : state.lastMainAssetId
    };
  }

  undo(state: AppState): AppState {
    const idsToRevert = new Set(this.newEntries.map(e => e.id));
    return {
      ...state,
      atlasEntries: [...state.atlasEntries.filter(e => !idsToRevert.has(e.id)), ...this.replacedEntries],
      lastMainAssetId: this.oldLastId !== undefined ? this.oldLastId : state.lastMainAssetId
    };
  }

  getAssets(): TextureAsset[] {
    return [...this.newEntries, ...this.replacedEntries];
  }
}

export class RemoveTilesCommand implements Command {
  constructor(private removedEntries: TextureAsset[]) {}

  execute(state: AppState): AppState {
    const idsToRemove = new Set(this.removedEntries.map(e => e.id));
    return {
      ...state,
      atlasEntries: state.atlasEntries.filter(e => !idsToRemove.has(e.id))
    };
  }

  undo(state: AppState): AppState {
    return {
      ...state,
      atlasEntries: [...state.atlasEntries, ...this.removedEntries]
    };
  }

  getAssets(): TextureAsset[] {
    return [...this.removedEntries];
  }
}

export class SetMainTilesCommand implements Command {
  constructor(
    private oldEntries: TextureAsset[],
    private newEntries: TextureAsset[],
    private oldStatus?: AtlasStatus,
    private newStatus?: AtlasStatus,
    private oldLastId?: string | null,
    private newLastId?: string | null
  ) {}

  execute(state: AppState): AppState {
    return { 
      ...state, 
      atlasEntries: this.newEntries,
      atlasStatus: this.newStatus ?? state.atlasStatus,
      lastMainAssetId: this.newLastId !== undefined ? this.newLastId : state.lastMainAssetId
    };
  }

  undo(state: AppState): AppState {
    return { 
      ...state, 
      atlasEntries: this.oldEntries,
      atlasStatus: this.oldStatus ?? state.atlasStatus,
      lastMainAssetId: this.oldLastId !== undefined ? this.oldLastId : state.lastMainAssetId
    };
  }

  getAssets(): TextureAsset[] {
    return [...this.oldEntries, ...this.newEntries];
  }
}

export class UpdateStatusCommand implements Command {
  constructor(private oldStatus: AtlasStatus, private newStatus: AtlasStatus) {}
  execute(state: AppState): AppState { return { ...state, atlasStatus: this.newStatus }; }
  undo(state: AppState): AppState { return { ...state, atlasStatus: this.oldStatus }; }
  getAssets(): TextureAsset[] { return []; }
}

export class ClearCellCommand implements Command {
  constructor(private cellKey: string, private oldStatus: AtlasStatus) {}
  execute(state: AppState): AppState {
    if (state.clearedCells.includes(this.cellKey)) return state;
    return {
      ...state,
      clearedCells: [...state.clearedCells, this.cellKey],
      atlasStatus: 'modified'
    };
  }
  undo(state: AppState): AppState {
    return {
      ...state,
      clearedCells: state.clearedCells.filter(k => k !== this.cellKey),
      atlasStatus: this.oldStatus
    };
  }
  getAssets(): TextureAsset[] { return []; }
}

export class MaterializeCommand implements Command {
  constructor(
    private newEntry: TextureAsset,
    private cellKey: string,
    private oldStatus: AtlasStatus
  ) {}

  execute(state: AppState): AppState {
    const alreadyCleared = state.clearedCells.includes(this.cellKey);
    return {
      ...state,
      atlasEntries: [...state.atlasEntries.filter(e => e.id !== this.newEntry.id), this.newEntry],
      clearedCells: alreadyCleared ? state.clearedCells : [...state.clearedCells, this.cellKey],
      atlasStatus: 'modified'
    };
  }

  undo(state: AppState): AppState {
    return {
      ...state,
      atlasEntries: state.atlasEntries.filter(e => e.id !== this.newEntry.id),
      clearedCells: state.clearedCells.filter(k => k !== this.cellKey),
      atlasStatus: this.oldStatus
    };
  }

  getAssets(): TextureAsset[] {
    return [this.newEntry];
  }
}

export class SetSourceAssetCommand implements Command {
  constructor(
    private oldAsset: TextureAsset | null,
    private newAsset: TextureAsset | null
  ) {}

  execute(state: AppState): AppState {
    return { ...state, currentSourceAsset: this.newAsset };
  }

  undo(state: AppState): AppState {
    return { ...state, currentSourceAsset: this.oldAsset };
  }

  getAssets(): TextureAsset[] {
    const assets: TextureAsset[] = [];
    if (this.oldAsset) assets.push(this.oldAsset);
    if (this.newAsset) assets.push(this.newAsset);
    return assets;
  }
}
