# Rancorous Texture Forge

Browser-based texture manipulation and atlas management suite focused on assisting with best practice texture management for Unreal Engine (and any other PBR/atlas engines). 
It is not a replacement for photoshop/generators for creating and fine tuning icons but it will help you layout / pack / align and basic resizing textures you already have.
Check out my Unreal Engine plugin with similar features: https://www.fab.com/listings/9b4a13ba-d6d9-4811-b993-4d628edf9d0c

## Core Features

### Advanced Atlas Management
- **Intelligent Slicing:** Automatically detect and slice sprites from existing sheets using color-key tolerance.
- **Parametric Grids:** Flexible "Fixed Cell" and "Atlas Packing" modes.
- **Grid Fixing:** One-click "Fix Grid" to automatically center detected islands into the nearest grid cells.
- **Island Detection:** High-performance flood-fill algorithms with median filtering to isolate sprites from backgrounds.

### Adjust & Resample
- **High-Quality Scaling:** Powered by the Pica library for superior downscaling and resampling.
- **Color Correction:** Real-time hue shifting and brightness adjustments.
- **Non-Destructive Workflow:** Adjustments are tracked and can be modified or undone at any time.

### Channel Packer
- **Multi-Channel Mapping:** Map individual RGBA channels from different source textures.
- **ORM Workflow:** Specialized presets for Ambient Occlusion, Roughness, and Metallic (ORM) packing.
- **Real-time 3D Preview:** Validate your packed textures immediately on a PBR sphere with Orbit controls.

### Compositing & Layering
- **Layer Stack:** Reorder, hide, and adjust opacity of multiple texture layers.
- **Transparency Keys:** Apply chroma-key transparency to layers with adjustable tolerance.

## Technical Architecture

- **Framework:** [React](https://reactjs.org/) with [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [Lucide React](https://lucide.dev/) icons
- **3D Rendering:** [Three.js](https://threejs.org/) via [@react-three/fiber](https://github.com/pmndrs/react-three-fiber)
- **State Engine:** Custom Command-pattern implementation for robust multi-step Undo/Redo history.
- **Image Processing:** High-performance Canvas API utilization with parallel asset loading.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Latest LTS recommended)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/rancorous-texture-forge.git
   cd rancorous-texture-forge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   OR simply run start-desktop.py to run the app locally on windows.


## Controls & Shortcuts
- **Ctrl + Z / Y:** Undo / Redo
- **Ctrl + Scroll:** Zoom Canvas
- **Right-Click & Drag:** Move tiles in Atlas mode
- **Right-Click:** Clear cell or remove tile
- **Left-Click & Drag:** Custom box selection in Source mode

---

*Part of the Rancorous Toolset.*
