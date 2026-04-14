import { useState, useCallback } from 'react';
import { Command } from '../lib/Commands';

export function useHistory<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const [past, setPast] = useState<Command[][]>([]);
  const [future, setFuture] = useState<Command[][]>([]);

  const executeCommand = useCallback((commands: Command | Command[]) => {
    const cmdArray = Array.isArray(commands) ? commands : [commands];
    setState(prev => {
      let next = prev;
      for (const cmd of cmdArray) {
        next = cmd.execute(next as any) as any;
      }
      setPast(p => [...p, cmdArray].slice(-50));
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const commands = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    setState(current => {
      let next = current;
      // Undo in reverse order
      for (let i = commands.length - 1; i >= 0; i--) {
        next = commands[i].undo(next as any) as any;
      }
      setFuture(f => [commands, ...f]);
      setPast(newPast);
      return next;
    });
  }, [past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const commands = future[0];
    const newFuture = future.slice(1);
    
    setState(current => {
      let next = current;
      for (const cmd of commands) {
        next = cmd.execute(next as any) as any;
      }
      setPast(p => [...p, commands]);
      setFuture(newFuture);
      return next;
    });
  }, [future]);

  // For non-undoable state updates (like grid settings change)
  const set = useCallback((newValues: T | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof newValues === 'function' ? (newValues as any)(prev) : newValues;
      if (prev === next) return prev;
      return next;
    });
  }, []);

  return { state, set, executeCommand, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
