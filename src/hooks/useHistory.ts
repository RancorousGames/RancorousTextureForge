import { useState, useCallback } from 'react';

export function useHistory<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const set = useCallback((newValues: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof newValues === 'function' ? (newValues as any)(prev) : newValues;
      // Simple reference check is often enough if we follow immutable patterns
      if (prev === next) return prev;
      
      setPast((p) => [...p, prev].slice(-50)); // Limit history to 50 steps
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    setFuture((f) => [state, ...f]);
    setPast(newPast);
    setState(previous);
  }, [past, state]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    
    setPast((p) => [...p, state]);
    setFuture(newFuture);
    setState(next);
  }, [future, state]);

  return { state, set, setState, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
