# CrossRoads

Sandbox game for designing road networks (straight/curved sections,
automatic intersections, gridless placement).
See `PROGRESS.md` for current milestone status, and `docs/` for per-subsystem
design notes.

## Tech stack

TypeScript + Three.js + Vite, running in the browser.

## Conventions

- TypeScript strict mode (see `tsconfig.json`). Avoid `any`.
- US English throughout — identifiers, comments and docs (`center`, not
  `centre`).
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
- Coordinate system: Y is up, so the XZ plane is the ground. World units are meters.
- Screen positions are client pixels (`ScreenPoint`, as pointer events
  report them) and never mix with world coordinates. Converting between
  the two is `Viewport`'s job, through names that say which way they go —
  `screenToGround`, `groundToScreen`. Where a name alone could be read as
  either, it carries its unit: `metersPerPixel`, `widthPixels`.
- Data model is gridless at its core — nodes store exact, unsnapped
  positions. Grid snapping (if/when enabled) is applied only at the input
  layer before a position reaches the core model, never baked into the
  model itself.

## Design notes

Non-trivial subsystems get a short design note in `docs/<subsystem>.md`,
written **before** the implementation. These are requirement-focused: what
the thing must do and how it fits the architecture — not how it is coded.
A design note is not a to-do list: leave planned, deferred and
not-yet-built work out of it, `PROGRESS.md` tracks that. Read the relevant
one before working on a subsystem; update it when requirements change.

## Verification

- `npm run dev` — start the Vite dev server.
- `npm run typecheck` — run `tsc --noEmit` as a quick correctness gate.
- `npm test` — run the Vitest suite. Tests live next to the code as
  `*.test.ts`, and cover `src/core/` only: logic with exact expected
  answers and no Three.js in the way. Rendering and input are checked by
  running the app.
