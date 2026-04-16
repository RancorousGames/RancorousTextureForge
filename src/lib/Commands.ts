import { AppState, TextureTile } from '../types';

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
  constructor(private oldTiles: TextureTile[], private newTiles: TextureTile[]) {}

  execute(state: AppState): AppState {
    return { ...state, mainTiles: this.newTiles };
  }

  undo(state: AppState): AppState {
    return { ...state, mainTiles: this.oldTiles };
  }
}
