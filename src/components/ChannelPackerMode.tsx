import React, { useState } from 'react';
import { TextureAsset, ChannelMapping, PBRSet, VIRTUAL_MAIN_ATLAS_ID } from '../types';
import { PBRPreview } from './PBRPreview';
import { Download, Layers, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateId } from '../lib/canvas';

interface ChannelPackerModeProps {
  availableAssets: TextureAsset[];
  mapping: ChannelMapping;
  setMapping: (mapping: ChannelMapping) => void;
  pbrSet: PBRSet;
  setPbrSet: (pbrSet: PBRSet) => void;
  onExport: (url: string, filename: string) => void;
  onGetSnapshot?: () => Promise<string>;
}

export function ChannelPackerMode({ availableAssets, mapping, setMapping, pbrSet, setPbrSet, onExport, onGetSnapshot }: ChannelPackerModeProps) {
  const [useAlpha, setUseAlpha] = useState(false);
  const [packedUrl, setPackedUrl] = useState<string | null>(null);

  // Auto-pack when mapping changes
  React.useEffect(() => {
    const hasAssets = [mapping.r.asset, mapping.g.asset, mapping.b.asset, mapping.a.asset].some(Boolean);
    if (hasAssets) {
      generatePackedTexture();
    } else {
      setPackedUrl(null);
    }
  }, [mapping.r.asset, mapping.g.asset, mapping.b.asset, mapping.a.asset, mapping.r.sourceChannel, mapping.g.sourceChannel, mapping.b.sourceChannel, mapping.a.sourceChannel]);

  const handleDrop = async (channel: keyof ChannelMapping | keyof PBRSet, e: React.DragEvent) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('text/plain');
    let asset = availableAssets.find(t => t.id === assetId);
    if (!asset) return;

    if (asset.id === VIRTUAL_MAIN_ATLAS_ID && onGetSnapshot) {
      const url = await onGetSnapshot();
      asset = { ...asset, url, id: generateId(), name: `Snapshot ${new Date().toLocaleTimeString()}` };
    }

    if (['r', 'g', 'b', 'a'].includes(channel)) {
      setMapping({ ...mapping, [channel]: { ...mapping[channel as keyof ChannelMapping], asset } });
    } else {
      setPbrSet({ ...pbrSet, [channel]: { ...pbrSet[channel as keyof PBRSet], asset } });
    }
  };

  const generatePackedTexture = async () => {
    const canvas = document.createElement('canvas');
    const assets = [mapping.r.asset, mapping.g.asset, mapping.b.asset, mapping.a.asset].filter(Boolean) as TextureAsset[];
    if (assets.length === 0) return;

    const width = Math.max(...assets.map(t => t.width));
    const height = Math.max(...assets.map(t => t.height));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const getChannelData = async (m: { asset: TextureAsset | null; sourceChannel: 'r' | 'g' | 'b' | 'a' }, defaultVal: number) => {
      if (!m.asset) return new Uint8ClampedArray(width * height).fill(defaultVal);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tempCtx) return new Uint8ClampedArray(width * height);

      const img = new Image();
      img.src = m.asset.url;
      await new Promise(resolve => { img.onload = resolve; });
      tempCtx.drawImage(img, 0, 0, width, height);
      
      const imgData = tempCtx.getImageData(0, 0, width, height);
      const result = new Uint8ClampedArray(width * height);
      const channelOffset = { r: 0, g: 1, b: 2, a: 3 }[m.sourceChannel];

      for (let i = 0; i < imgData.data.length; i += 4) {
        result[i / 4] = imgData.data[i + channelOffset];
      }
      return result;
    };

    const [rData, gData, bData, aData] = await Promise.all([
      getChannelData(mapping.r, 0),
      getChannelData(mapping.g, 0),
      getChannelData(mapping.b, 0),
      getChannelData(mapping.a, 255)
    ]);

    const finalImageData = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      finalImageData.data[i * 4] = rData[i];
      finalImageData.data[i * 4 + 1] = gData[i];
      finalImageData.data[i * 4 + 2] = bData[i];
      finalImageData.data[i * 4 + 3] = aData[i];
    }

    ctx.putImageData(finalImageData, 0, 0);
    const url = canvas.toDataURL('image/png');
    setPackedUrl(url);
    
    // Auto-assign to ORM preview
    setPbrSet({ ...pbrSet, orm: { ...pbrSet.orm, asset: { id: 'packed', url, name: 'Packed ORM', width, height, x:0, y:0, hue:0, brightness:100, scale:1 } } });
  };

  const PackerSlot = ({ label, channel, m }: { label: string, channel: keyof ChannelMapping, m: { asset: TextureAsset | null; sourceChannel: 'r' | 'g' | 'b' | 'a' } }) => (
    <div 
      className="flex flex-col gap-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(channel, e)}
      title={`Channel: ${label}. Drag an asset here to assign.`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold text-zinc-500 uppercase">{label}</div>
        <select 
          value={m.sourceChannel}
          onChange={(e) => setMapping({ ...mapping, [channel]: { ...m, sourceChannel: e.target.value as any } })}
          className="bg-zinc-800 text-[10px] text-zinc-300 border-none rounded px-1 outline-none"
          title={`Select which source channel (R, G, B, or A) to extract from the assigned texture`}
        >
          <option value="r">R</option>
          <option value="g">G</option>
          <option value="b">B</option>
          <option value="a">A</option>
        </select>
      </div>
      <div className="aspect-square bg-zinc-950 border border-zinc-800 rounded-md flex items-center justify-center overflow-hidden relative group">
        {m.asset ? (
          <>
            <img src={m.asset.url} alt={label} className="w-full h-full object-contain" title={m.asset.name} />
            <button 
              className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded opacity-0 group-hover:opacity-100"
              onClick={() => setMapping({ ...mapping, [channel]: { ...m, asset: null } })}
              title="Clear this channel"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        ) : (
          <span className="text-zinc-700 text-[10px] text-center px-1">Drag here</span>
        )}
      </div>
    </div>
  );

  const PBRSlot = ({ label, channel, p }: { label: string, channel: keyof PBRSet, p: { asset: TextureAsset | null, active: boolean } }) => (
    <div 
      className="flex flex-col gap-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(channel, e)}
      title={`Preview Slot: ${label}. Drag an asset here to preview it in the 3D scene.`}
    >
      <div className="flex items-center gap-2">
        <div className="text-[10px] font-bold text-zinc-500 uppercase">{label}</div>
        <input 
          type="checkbox" 
          checked={p.active} 
          onChange={(e) => setPbrSet({ ...pbrSet, [channel]: { ...p, active: e.target.checked } })}
          className="w-3 h-3 rounded bg-zinc-800 border-zinc-700 text-blue-500"
          title={`Toggle visibility of the ${label} map in the preview`}
        />
      </div>
      <div className="aspect-square bg-zinc-950 border border-zinc-800 rounded-md flex items-center justify-center overflow-hidden relative group">
        {p.asset ? (
          <>
            <img src={p.asset.url} alt={label} className="w-full h-full object-contain" title={p.asset.name} />
            {channel !== 'orm' && (
              <button 
                className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded opacity-0 group-hover:opacity-100"
                onClick={() => setPbrSet({ ...pbrSet, [channel]: { ...p, asset: null } })}
                title="Clear this preview slot"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </>
        ) : (
          <span className="text-zinc-700 text-[10px] text-center px-1">Drag here</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex h-full bg-zinc-900 overflow-hidden">
      <div className="w-72 p-4 flex flex-col gap-4 border-r border-zinc-800 overflow-y-auto bg-zinc-950">
        <div title="Composite RGBA channels from multiple textures">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Channel Packer
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3" title="Map source textures to RGBA channels">
          <PackerSlot label="Red" channel="r" m={mapping.r} />
          <PackerSlot label="Green" channel="g" m={mapping.g} />
          <PackerSlot label="Blue" channel="b" m={mapping.b} />
          <PackerSlot label="Alpha" channel="a" m={mapping.a} />
        </div>

        <button
          onClick={generatePackedTexture}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-xs font-medium transition-colors"
          title="Combine the assigned channel textures into a single output image"
        >
          Pack Texture
        </button>

        <div className="pt-4 border-t border-zinc-800 space-y-3" title="Preview the result in a PBR material">
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">PBR Preview</h2>
          <div className="grid grid-cols-3 gap-2">
            <PBRSlot label="BC" channel="baseColor" p={pbrSet.baseColor} />
            <PBRSlot label="N" channel="normal" p={pbrSet.normal} />
            <PBRSlot label="ORM" channel="orm" p={pbrSet.orm} />
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="useAlpha" 
              checked={useAlpha} 
              onChange={(e) => setUseAlpha(e.target.checked)}
              className="w-3 h-3 rounded bg-zinc-800 border-zinc-700 text-blue-500"
              title="Use the packed alpha channel for material transparency"
            />
            <label htmlFor="useAlpha" className="text-[10px] text-zinc-400" title="Enable transparency testing in the 3D preview">Use Alpha for Opacity</label>
          </div>
        </div>

        {packedUrl && (
          <button
            onClick={() => onExport(packedUrl, 'packed_texture.png')}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-2 rounded text-xs font-medium transition-colors mt-auto"
            title="Download the final channel-packed PNG"
          >
            <Download className="w-4 h-4" />
            Export Packed Texture
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex">
          <div className="flex-1 border-r border-zinc-800 flex flex-col bg-zinc-950">
            <div className="p-2 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Packed Result</span>
              {packedUrl && (
                <a href={packedUrl} download="packed.png" className="text-blue-500 hover:text-blue-400">
                  <Download className="w-4 h-4" />
                </a>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center p-4 checkerboard">
              {packedUrl ? (
                <img src={packedUrl} className="max-w-full max-h-full shadow-lg" alt="Packed" />
              ) : (
                <div className="text-zinc-700 text-xs">Pack to see result</div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-zinc-950">
            <PBRPreview 
              baseColor={pbrSet.baseColor.asset ? { url: pbrSet.baseColor.asset.url, active: pbrSet.baseColor.active } : undefined}
              normal={pbrSet.normal.asset ? { url: pbrSet.normal.asset.url, active: pbrSet.normal.active } : undefined}
              orm={pbrSet.orm.asset ? { url: pbrSet.orm.asset.url, active: pbrSet.orm.active } : undefined}
              opacityInBaseColor={useAlpha}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

