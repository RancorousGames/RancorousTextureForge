import React, { useState } from 'react';
import { TextureTile, VIRTUAL_MAIN_ATLAS_ID } from '../types';
import { cn } from '../lib/utils';
import { Sparkles, Search, Trash2, Layout } from 'lucide-react';

interface SecondaryAtlasProps {
  tiles: TextureTile[];
  activeTiles?: TextureTile[];
  onTileClick: (tile: TextureTile) => void;
  onFilesDrop?: (files: File[]) => void;
  onClear?: () => void;
  onGetSnapshot?: () => Promise<string>;
  virtualMainAtlasPreview?: string;
}

export function SecondaryAtlas({ 
  tiles, 
  activeTiles = [], 
  onTileClick, 
  onFilesDrop, 
  onClear,
  onGetSnapshot,
  virtualMainAtlasPreview
}: SecondaryAtlasProps) {
  const [search, setSearch] = useState('');

  const handleDragStart = (e: React.DragEvent, tile: TextureTile) => {
    e.dataTransfer.setData('text/plain', tile.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onFilesDrop) {
      onFilesDrop(Array.from(e.dataTransfer.files));
    }
  };

  const filteredTiles = tiles.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const filteredActive = activeTiles.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const TileItem = ({ tile, isActive = false }: { tile: TextureTile, isActive?: boolean }) => {
    const isVirtual = tile.id === VIRTUAL_MAIN_ATLAS_ID;
    
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, tile)}
        className={cn(
          "group relative aspect-square bg-zinc-950 border rounded-md overflow-hidden cursor-pointer transition-all checkerboard",
          isActive ? "border-blue-500/50 ring-1 ring-blue-500/30" : "border-zinc-800 hover:border-blue-500"
        )}
        onClick={() => onTileClick(tile)}
        title={isVirtual ? "Main Atlas Canvas (Live). Drag into tools to use current layout." : `${tile.name} (${tile.width}x${tile.height}). Drag into the atlas to use.`}
      >
        <div 
          className="w-full h-full p-2"
          style={{
            filter: `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`,
            transform: `scale(${Math.min(1, tile.scale)})`
          }}
        >
          {isVirtual ? (
            virtualMainAtlasPreview ? (
              <img
                src={virtualMainAtlasPreview}
                alt={tile.name}
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900 rounded">
                <Layout className="w-8 h-8 text-zinc-700" />
              </div>
            )
          ) : (
            <img
              src={tile.url}
              alt={tile.name}
              className="w-full h-full object-contain"
              draggable={false}
            />
          )}
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
  };

  return (
    <div 
      className="w-80 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      title="Asset Browser: Drag and drop files here to load into the library"
    >
      <div className="p-4 border-b border-zinc-800 bg-zinc-950 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Asset Browser</h2>
            <p className="text-xs text-zinc-500 mt-1">Drag files here to load</p>
          </div>
          {onClear && tiles.length > 0 && (
            <button 
              onClick={onClear}
              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
              title="Clear all assets from the library"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
            title="Filter assets by name"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Active Section */}
        {filteredActive.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Active / Modified
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {filteredActive.map((tile) => (
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
          ) : filteredTiles.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm py-10">
              No assets match your search.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredTiles.map((tile) => (
                <TileItem key={tile.id} tile={tile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

