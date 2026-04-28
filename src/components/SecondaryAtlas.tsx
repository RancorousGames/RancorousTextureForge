import React, { useState, useRef, useEffect } from 'react';
import { TextureAsset, VIRTUAL_MAIN_ATLAS_ID } from '../types';
import { cn } from '../lib/utils';
import { Sparkles, Search, Trash2, Layout } from 'lucide-react';

interface SecondaryAtlasProps {
  assets: TextureAsset[];
  activeAssets?: TextureAsset[];
  onAssetClick: (asset: TextureAsset) => void;
  onFilesDrop?: (files: File[]) => void;
  onClear?: () => void;
  onGetSnapshot?: () => Promise<string>;
  virtualMainAtlasPreview?: string;
  lastMainAssetId?: string | null;
  lastSourceAssetId?: string | null;
}

export function SecondaryAtlas({ 
  assets, 
  activeAssets = [], 
  onAssetClick, 
  onFilesDrop, 
  onClear,
  onGetSnapshot,
  virtualMainAtlasPreview,
  lastMainAssetId,
  lastSourceAssetId
}: SecondaryAtlasProps) {
  const [search, setSearch] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevAssetsLength = useRef(assets.length);

  useEffect(() => {
    if (assets.length > prevAssetsLength.current) {
      // New asset added (likely to the top)
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    prevAssetsLength.current = assets.length;
  }, [assets.length]);

  const handleDragStart = (e: React.DragEvent, asset: TextureAsset) => {
    e.dataTransfer.setData('text/plain', asset.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onFilesDrop) {
      onFilesDrop(Array.from(e.dataTransfer.files));
    }
  };

  const filteredAssets = assets.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const filteredActive = activeAssets.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const AssetItem = ({ asset, isActive = false }: { asset: TextureAsset, isActive?: boolean }) => {
    const isVirtual = asset.id === VIRTUAL_MAIN_ATLAS_ID;
    const isLastMain = asset.id === lastMainAssetId;
    const isLastSource = asset.id === lastSourceAssetId;
    
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, asset)}
        className={cn(
          "group relative aspect-square bg-zinc-950 border rounded-md overflow-hidden cursor-pointer transition-all checkerboard",
          isActive ? "border-blue-500 ring-2 ring-blue-500/20" : "border-zinc-800 hover:border-blue-500",
          isLastMain && "border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.4)] z-10",
          isLastSource && "border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)] z-10"
        )}
        onClick={() => onAssetClick(asset)}
        title={isVirtual ? "Main Atlas Canvas (Live). Drag into tools to use current layout." : `${asset.name} (${asset.width}x${asset.height}). Drag into the atlas to use.`}
      >
        <div 
          className="w-full h-full p-2"
          style={{
            filter: `hue-rotate(${asset.hue}deg) brightness(${asset.brightness}%)`,
            transform: `scale(${Math.min(1, asset.scale)})`
          }}
        >
          {isVirtual ? (
            virtualMainAtlasPreview ? (
              <img
                src={virtualMainAtlasPreview}
                alt={asset.name}
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
              src={asset.url}
              alt={asset.name}
              className="w-full h-full object-contain"
              draggable={false}
            />
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] text-zinc-300 truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {asset.name}
        </div>
        <div className="absolute top-1 left-1 bg-black/40 px-1 rounded text-[8px] text-zinc-400 font-mono">
          {asset.width}x{asset.height}
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
            <div className="flex gap-2 mt-1">
              <div className="flex items-center gap-1" title="Last asset added as a tile to the Main Atlas">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />
                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-tighter">Main</span>
              </div>
              <div className="flex items-center gap-1" title="Current background source image for the Source Atlas">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-tighter">Source</span>
              </div>
            </div>
          </div>
          {onClear && assets.length > 0 && (
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
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollContainerRef}>
        {/* Active Section */}
        {filteredActive.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Active / Modified
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {filteredActive.map((asset) => (
                <AssetItem key={`active-${asset.id}`} asset={asset} isActive />
              ))}
            </div>
          </div>
        )}

        {/* Library Section */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            Library
          </h3>
          {assets.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm py-10">
              No assets loaded.
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm py-10">
              No assets match your search.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredAssets.map((asset) => (
                <AssetItem key={asset.id} asset={asset} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

