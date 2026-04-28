import { AppState, TextureAsset, AtlasStatus } from '../types';

export interface Command {
  execute(state: AppState): AppState;
  undo(state: AppState): AppState;
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
}

export class AddTilesCommand implements Command {
  constructor(private newEntries: TextureAsset[], private replacedEntries: TextureAsset[]) {}

  execute(state: AppState): AppState {
    const idsToRemove = new Set([
      ...this.replacedEntries.map(e => e.id),
      ...this.newEntries.map(e => e.id)
    ]);
    return {
      ...state,
      atlasEntries: [...state.atlasEntries.filter(e => !idsToRemove.has(e.id)), ...this.newEntries]
    };
  }

  undo(state: AppState): AppState {
    const idsToRevert = new Set(this.newEntries.map(e => e.id));
    return {
      ...state,
      atlasEntries: [...state.atlasEntries.filter(e => !idsToRevert.has(e.id)), ...this.replacedEntries]
    };
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
}

export class SetMainTilesCommand implements Command {
  constructor(
    private oldEntries: TextureAsset[],
    private newEntries: TextureAsset[],
    private oldStatus?: AtlasStatus,
    private newStatus?: AtlasStatus
  ) {}

  execute(state: AppState): AppState {
    return { 
      ...state, 
      atlasEntries: this.newEntries,
      atlasStatus: this.newStatus ?? state.atlasStatus
    };
  }

  undo(state: AppState): AppState {
    return { 
      ...state, 
      atlasEntries: this.oldEntries,
      atlasStatus: this.oldStatus ?? state.atlasStatus
    };
  }
}

export class UpdateStatusCommand implements Command {
  constructor(private oldStatus: AtlasStatus, private newStatus: AtlasStatus) {}
  execute(state: AppState): AppState { return { ...state, atlasStatus: this.newStatus }; }
  undo(state: AppState): AppState { return { ...state, atlasStatus: this.oldStatus }; }
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
}
