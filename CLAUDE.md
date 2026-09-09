# CrossRoads

Sandbox game for designing road networks (straight/curved sections,
automatic intersections, gridless placement).
See `PROGRESS.md` for current milestone status, and `docs/` for per-subsystem
design notes.

## Tech stack

TypeScript 7 + Three.js + Vite, running in the browser.

## Conventions

- TypeScript strict mode (see `tsconfig.json`). Avoid `any`.
- Pass a class's collaborators in as constructor parameters — all of them
  the same way, including ambient globals like `window`
  (`PanZoomControls(viewport, domElement, window)`). Don't reach for a
  global from inside a class, and don't have a class fetch one dependency
  out of another when both could be arguments. Wiring belongs at the call
  site, where it's visible.
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
  - `src/ui/` — DOM controls layered over the canvas (currently the tool
    palette). Only the DOM ones: anything drawn in the scene belongs to
    `src/render/`, however much it looks like interface.
  - `src/main.ts` — app entry point.
- Coordinate system: Y is up, so the XZ plane is the ground. World units are meters.
- Screen positions are client pixels (`ScreenPoint`, as pointer events
  report them) and never mix with world coordinates. Converting between
  the two is `Viewport`'s job, through names that say which way they go —
  `screenToGround`, `groundToScreen`. Where a name alone could be read as
  either, it carries its unit: `metersPerPixel`, `widthPixels`.
- Grid snapping is applied at the input layer only — `src/core/` stores
  exact, unsnapped positions.

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
- No linter. `typescript-eslint@8` declares
  `peer typescript ">=4.8.4 <6.1.0"`, so it cannot install on TypeScript 7
  (tried 2026-08-30; `--force` and pinning were judged not worth it).
  It would have gated deprecated API use via
  `@typescript-eslint/no-deprecated` — something `tsc` cannot catch at
  all, so editor strikethrough is currently the only signal.
