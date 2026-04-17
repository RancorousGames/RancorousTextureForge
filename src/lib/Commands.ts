import { AppState, TextureTile, AtlasStatus } from '../types';

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
    private tileId: string,
    private oldPos: { x: number, y: number },
    private newPos: { x: number, y: number }
  ) {}

  execute(state: AppState): AppState {
    return {
      ...state,
      mainTiles: state.mainTiles.map(t => t.id === this.tileId ? { ...t, x: this.newPos.x, y: this.newPos.y } : t)
    };
  }

  undo(state: AppState): AppState {
    return {
      ...state,
      mainTiles: state.mainTiles.map(t => t.id === this.tileId ? { ...t, x: this.oldPos.x, y: this.oldPos.y } : t)
    };
  }
}

export class AddTilesCommand implements Command {
  constructor(private newTiles: TextureTile[], private replacedTiles: TextureTile[]) {}

  execute(state: AppState): AppState {
    const idsToRemove = new Set(this.replacedTiles.map(t => t.id));
    return {
      ...state,
      mainTiles: [...state.mainTiles.filter(t => !idsToRemove.has(t.id)), ...this.newTiles]
    };
  }

  undo(state: AppState): AppState {
    const idsToRemove = new Set(this.newTiles.map(t => t.id));
    return {
      ...state,
      mainTiles: [...state.mainTiles.filter(t => !idsToRemove.has(t.id)), ...this.replacedTiles]
    };
  }
}

export class RemoveTilesCommand implements Command {
  constructor(private removedTiles: TextureTile[]) {}

  execute(state: AppState): AppState {
    const idsToRemove = new Set(this.removedTiles.map(t => t.id));
    return {
      ...state,
      mainTiles: state.mainTiles.filter(t => !idsToRemove.has(t.id))
    };
  }

  undo(state: AppState): AppState {
    return {
      ...state,
      mainTiles: [...state.mainTiles, ...this.removedTiles]
    };
  }
}

export class SetMainTilesCommand implements Command {
  constructor(
    private oldTiles: TextureTile[],
    private newTiles: TextureTile[],
    private oldStatus?: AtlasStatus,
    private newStatus?: AtlasStatus
  ) {}

  execute(state: AppState): AppState {
    return { 
      ...state, 
      mainTiles: this.newTiles,
      atlasStatus: this.newStatus ?? state.atlasStatus
    };
  }

  undo(state: AppState): AppState {
    return { 
      ...state, 
      mainTiles: this.oldTiles,
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
    private newTile: TextureTile,
    private cellKey: string,
    private oldStatus: AtlasStatus
  ) {}

  execute(state: AppState): AppState {
    const alreadyCleared = state.clearedCells.includes(this.cellKey);
    return {
      ...state,
      mainTiles: [...state.mainTiles, this.newTile],
      clearedCells: alreadyCleared ? state.clearedCells : [...state.clearedCells, this.cellKey],
      atlasStatus: 'modified'
    };
  }

  undo(state: AppState): AppState {
    return {
      ...state,
      mainTiles: state.mainTiles.filter(t => t.id !== this.newTile.id),
      clearedCells: state.clearedCells.filter(k => k !== this.cellKey),
      atlasStatus: this.oldStatus
    };
  }
}
