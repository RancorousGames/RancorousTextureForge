import React, { useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

interface PBRPreviewProps {
  baseColor?: { url: string; active: boolean };
  normal?: { url: string; active: boolean };
  orm?: { url: string; active: boolean };
  opacityInBaseColor?: boolean;
}

export function PBRPreview({ baseColor, normal, orm, opacityInBaseColor }: PBRPreviewProps) {
  // Use a key to force re-mounting the material when textures change
  const materialKey = useMemo(() => {
    return `${baseColor?.url}-${baseColor?.active}-${normal?.url}-${normal?.active}-${orm?.url}-${orm?.active}-${opacityInBaseColor}`;
  }, [baseColor?.url, baseColor?.active, normal?.url, normal?.active, orm?.url, orm?.active, opacityInBaseColor]);

  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const loadTexture = (url?: string, active?: boolean) => {
      if (!url || !active) return null;
      const tex = loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };

    const loadLinearTexture = (url?: string, active?: boolean) => {
      if (!url || !active) return null;
      const tex = loader.load(url);
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };

    const ormTex = loadLinearTexture(orm?.url, orm?.active);

    return {
      map: loadTexture(baseColor?.url, baseColor?.active),
      normalMap: loadLinearTexture(normal?.url, normal?.active),
      aoMap: ormTex,
      roughnessMap: ormTex,
      metalnessMap: ormTex,
    };
  }, [materialKey]);

  // Cleanup textures on unmount or change
  useEffect(() => {
    return () => {
      Object.values(textures).forEach(t => t?.dispose());
    };
  }, [textures]);

  return (
    <div className="w-full h-full bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 relative">
      <div className="absolute top-2 left-2 z-10 bg-black/50 px-2 py-1 rounded text-xs text-zinc-300 pointer-events-none">
        PBR Preview
      </div>
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 10]} intensity={1} />
        <Environment preset="city" />
        
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <meshStandardMaterial
            key={materialKey}
            map={textures.map || undefined}
            normalMap={textures.normalMap || undefined}
            aoMap={textures.aoMap || undefined}
            roughnessMap={textures.roughnessMap || undefined}
            metalnessMap={textures.metalnessMap || undefined}
            transparent={opacityInBaseColor && !!textures.map}
            alphaTest={opacityInBaseColor ? 0.1 : 0}
          />
        </mesh>
        
        <ContactShadows position={[0, -1.2, 0]} opacity={0.5} scale={10} blur={2} far={4} />
        <OrbitControls autoRotate autoRotateSpeed={1} enablePan={false} />
      </Canvas>
    </div>
  );
}

