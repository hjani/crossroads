# CrossRoads

Sandbox game for designing road networks (straight/curved sections,
automatic intersections, gridless placement).
See `PROGRESS.md` for current milestone status, and `docs/` for per-subsystem
design notes.

## Tech stack

TypeScript + Three.js + Vite, running in the browser.

## Conventions

- TypeScript strict mode (see `tsconfig.json`). Avoid `any`.
- Namespace-import Three.js as `THREE` (`import * as THREE from "three"`),
  matching the library's own convention — not a general project rule, just
  matches how all Three.js docs/examples name it.
- Directory layout:
  - `src/core/` — road network data model (nodes, edges/sections). Pure
    logic, no Three.js/rendering dependency.
  - `src/render/` — Three.js scene setup; converts core data into
    renderable geometry.
  - `src/input/` — camera pan/zoom, click/drag handling, tool-mode manager.
    Also where an optional grid-snap toggle lives.
  - `src/main.ts` — app entry point.
- Coordinate system: Y is up, roads live on the XZ ground plane. Units are
  meters.
- Data model is gridless at its core — nodes store exact, unsnapped
  positions. Grid snapping (if/when enabled) is applied only at the input
  layer before a position reaches the core model, never baked into the
  model itself.

## Design notes

Non-trivial subsystems get a short design note in `docs/<subsystem>.md`.
These are requirement-focused: what the thing must do, how it fits the architecture, and what was deliberately deferred — not how it is coded.
Read the relevant one before working on a subsystem; update it when
requirements change.

## Verification

- `npm run dev` — start the Vite dev server.
- `npm run typecheck` — run `tsc --noEmit` as a quick correctness gate.
