import React, { useState, useEffect, useCallback } from 'react';

export function DeferredNumberInput({ value, min, onCommit, className, title }: {
  value: number;
  min?: number;
  onCommit: (val: number) => void;
  className?: string;
  title?: string;
}) {
  const [local, setLocal] = useState(String(value));
  const valueRef = React.useRef(value);

  useEffect(() => { 
    setLocal(String(value));
    valueRef.current = value;
  }, [value]);

  const commit = useCallback(() => {
    const parsed = Number(local);
    const safe = isNaN(parsed) ? valueRef.current : parsed;
    const clamped = min !== undefined ? Math.max(min, safe) : safe;
    onCommit(clamped);
    // Force a re-sync with the current prop value in the next tick.
    // This handles cases where onCommit changed the value or rejected it.
    setTimeout(() => {
      setLocal(String(valueRef.current));
    }, 0);
  }, [local, min, onCommit]);

  return (
    <input
      type="number"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }}
      className={className}
      title={title}
    />
  );
}
