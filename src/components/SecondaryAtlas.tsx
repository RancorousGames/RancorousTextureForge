import React from 'react';
import { TextureTile } from '../types';
import { cn } from '../lib/utils';
import { Sparkles } from 'lucide-react';

interface SecondaryAtlasProps {
  tiles: TextureTile[];
  activeTiles?: TextureTile[];
  onTileClick: (tile: TextureTile) => void;
}

export function SecondaryAtlas({ tiles, activeTiles = [], onTileClick }: SecondaryAtlasProps) {
  const handleDragStart = (e: React.DragEvent, tile: TextureTile) => {
    e.dataTransfer.setData('text/plain', tile.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const TileItem = ({ tile, isActive = false }: { tile: TextureTile, isActive?: boolean }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, tile)}
      className={cn(
        "group relative aspect-square bg-zinc-950 border rounded-md overflow-hidden cursor-pointer transition-all checkerboard",
        isActive ? "border-blue-500/50 ring-1 ring-blue-500/30" : "border-zinc-800 hover:border-blue-500"
      )}
      onClick={() => onTileClick(tile)}
      title={tile.name}
    >
      <div 
        className="w-full h-full p-2"
        style={{
          filter: `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`,
          transform: `scale(${Math.min(1, tile.scale)})`
        }}
      >
        <img
          src={tile.url}
          alt={tile.name}
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] text-zinc-300 truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {tile.name}
      </div>
      <div className="absolute top-1 left-1 bg-black/40 px-1 rounded text-[8px] text-zinc-400 font-mono">
        {tile.width}x{tile.height}
      </div>
      {isActive && (
        <div className="absolute top-1 right-1">
          <Sparkles className="w-3 h-3 text-blue-400" />
        </div>
      )}
    </div>
  );

  return (
    <div className="w-80 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0">
      <div className="p-4 border-b border-zinc-800 bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-200">Asset Browser</h2>
        <p className="text-xs text-zinc-500 mt-1">Drag or click to use assets</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Active Section */}
        {activeTiles.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Active / Modified
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {activeTiles.map((tile) => (
                <TileItem key={`active-${tile.id}`} tile={tile} isActive />
              ))}
            </div>
          </div>
        )}

        {/* Library Section */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            Library
          </h3>
          {tiles.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm py-10">
              No assets loaded.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {tiles.map((tile) => (
                <TileItem key={tile.id} tile={tile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

