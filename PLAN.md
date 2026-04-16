# Cleanup Plan — Remaining Mechanical Tasks

The hard architectural work is done. The following tasks are mechanical and low-risk.
Complete them in order. Run `npm run lint` (which runs `tsc --noEmit`) after each section to catch mistakes early.

---

## Section 1 — Remove dead infrastructure

These files and dependencies exist only for a Gemini AI integration and a script-runner
endpoint that were never wired up to the UI. Delete them all.

### 1a. Delete files
- Delete `server.ts` (root of project)
- Delete `.env.example` if it exists (it only contains `GEMINI_API_KEY=`)

### 1b. Update `package.json`

**Change the `name` field:**
```
"name": "react-example"
→
"name": "texture-forge"
```

**Remove from `dependencies`:**
- `"@google/genai"`
- `"express"`
- `"dotenv"`

**Remove from `devDependencies`:**
- `"@types/express"`

**Change the `dev` script:**
```
"dev": "tsx server.ts"
→
"dev": "vite"
```

After editing `package.json`, run:
```
npm install
```
This will update `package-lock.json` to remove the deleted packages.

### 1c. Update `vite.config.ts`

Open `vite.config.ts`. Remove the `define` block that sets `GEMINI_API_KEY`.
The file should look like this when done (keep everything else as-is):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/RancorousTextureForge/',
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```

---

## Section 2 — Remove unused Python/JS test scripts from project root

The following files in the project root are test/debug scripts that should not be in a
public OSS release. Move them somewhere else or delete them if not needed:

- `gen_visual.py`
- `repro_meta.json`
- `repro_output_raw.bin`
- `repro_raw.bin`
- `temp_meta.json`
- `temp_raw.bin`
- `test2_raw.bin`
- Any `*.js` standalone scripts (e.g. `fixgrid_standalone.js`, `analyze_small.py`) 
  that live in the project root

**Do not delete anything inside `src/`.** Only files in the root or a `Testinputs/`
folder that appear to be test artifacts.

If unsure about a file, leave it alone and flag it.

---

## Section 3 — Clean up Toolbox component (remove unused Run Script button)

Open `src/components/Toolbox.tsx`.

Search for any button or UI element that references "Run Script", "runScript", or calls
`onRunScript`. Remove that button/element entirely from the JSX. The prop has already
been removed from the TypeScript interface and the component's destructure — this task
is just finding and deleting the button in the render output.

Run `npm run lint` to confirm no errors.

---

## Section 4 — Verify and clean up `reSliceTimerRef`

Open `src/App.tsx`. Search for `reSliceTimerRef`. It was declared in the old version but
may have been cleaned up already. If it still appears as a `useRef` declaration with no
usages, delete the declaration. Run `npm run lint` to confirm.

---

## Section 5 — Final lint pass

Run `npm run lint` one final time. It should produce zero errors.
If there are errors you cannot fix, document them and stop — do not guess at fixes.

---

## What NOT to touch

- Anything in `src/hooks/` (new files — leave as-is)
- Anything in `src/lib/` (new `canvas.ts` file — leave as-is)
- `src/App.tsx` — already refactored, do not edit
- `src/types.ts` — already updated, do not edit
- `src/components/AtlasCanvas.tsx` — out of scope
- `src/components/SecondaryAtlas.tsx` — out of scope
- Any `.py` files inside `Testinputs/` — out of scope

---

## Acceptance criteria

- `npm run lint` produces zero errors
- `npm run dev` starts a working dev server (no console errors on load)
- The `server.ts` file is gone
- `package.json` `name` is `texture-forge` and `dev` script runs `vite`
- No `@google/genai`, `express`, or `dotenv` in `package.json`
