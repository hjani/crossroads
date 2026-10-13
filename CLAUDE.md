# CrossRoads

Sandbox game for designing road networks (straight/curved sections,
automatic intersections, gridless placement).
See `PROGRESS.md` for current milestone status, and `docs/` for per-subsystem
design notes.

## Tech stack

TypeScript 7 + Three.js + Vite, running in the browser.

## Conventions

- TypeScript strict mode (see `tsconfig.json`). Avoid `any`.
- use of globals like `window`
  (`PanZoomControls(viewport, domElement, window)`): Don't reach for a
  global from inside a class.
- US English throughout — identifiers, comments and docs (`center`, not
  `centre`).
- Namespace-import Three.js as `THREE` (`import * as THREE from "three"`),
  matching the library's own convention — not a general project rule, just
  matches how all Three.js docs/examples name it.
- Directory layout:
  - `src/core/` — pure logic, no Three.js/rendering dependency. The following
    layers, each importing only the ones before it:
    - `geometry/` — plane geometry on the ground: `Vec2`, segments, arcs,
      the shapes a line runs in (`LineGeometry`) and where two of them
      cross. Knows nothing of the network.
    - `network/` — the road network data model (nodes, sections), and
      the queries and edits on it.
    - `layout/` — the network as it lies on the ground: junctions and
      roadways (`docs/road-layout.md`).
    - `lanes/` — where cars drive: lanes along roadways, connections
      across junctions (`docs/lanes.md`).
  - `src/render/` — Three.js scene setup; converts core data into
    renderable geometry.
  - `src/input/` — camera pan/zoom, click/drag handling, tool-mode manager.
  - `src/ui/` — DOM controls layered over the canvas (currently the tool
    palette). Only the DOM ones: anything drawn in the scene belongs to
    `src/render/`, however much it looks like interface.
  - `src/main.ts` — app entry point.
  - `scripts/` — Node scripts run by hand, outside the app (currently the
    documentation pictures).
- Coordinate system: Y is up, so the XZ plane is the ground. World units are meters.
- Screen positions are client pixels (`ScreenPoint`, as pointer events
  report them) and never mix with world coordinates. Converting between
  the two is `Viewport`'s job, through names that say which way they go —
  `screenToGround`, `groundToScreen`. Where a name alone could be read as
  either, it carries its unit: `metersPerPixel`, `widthPixels`.
- Grid snapping is applied at the input layer only — `src/core/` stores
  exact, unsnapped positions.
- Math-heavy functions (a closed-form result, a formula that can't be
  recognized from the code) get a doc comment that derives it in math
  notation — symbols, equations and short bullets, not prose. The math is
  easier to follow than English sentences about it. This is the one place
  where a long comment is preferred over a short one:
  - what it returns, in plain words, and when there is no answer
  - the symbols, named once (`d = to − from`, θ the angle between …)
  - the derivation as short steps, naming any theorem used
  - the final formula on its own indented line, matching the code
  - what follows from it: what is never computed, what input needn't be
    normalized, how the edge cases come out
  `arcViaLeaving` in `src/core/geometry/arc.ts` is the reference example.

## Design notes

Non-trivial subsystems get a short design note in `docs/<subsystem>.md`,
written **before** the implementation. These are requirement-focused: what
the thing must do and how it fits the architecture — not how it is coded.
A design note is not a to-do list: leave planned, deferred and
not-yet-built work out of it, `PROGRESS.md` tracks that. Read the relevant
one before working on a subsystem; update it when requirements change.

Brainstorming notes live in `docs/ideas/`: options explored, not decisions.
They are not specifications. A chosen option is settled as a requirement in
the design note, never in the idea note.

Written as terse bullets, not prose: one fact per bullet, `→` for a
consequence, a nested bullet for its reason or exception. A sentence only
where a list can't carry it. `docs/intersections.md` is the reference
example.

Where a picture helps understanding, add an SVG illustration in
`docs/images/` and embed it in the note. A picture of the project's own
geometry (a layout, a tessellation) is drawn by the project's code, not by
hand: one module per picture in `scripts/docs-images/`, registered in its
`main.ts`, written by `npm run docs:images`. Rerun it after changing what a
picture shows. A sketch of an idea, with no code behind it, can be drawn by
hand.

## Verification

- `npm run dev` — start the Vite dev server.
- `npm run typecheck` — run `tsc --noEmit` as a quick correctness gate,
  once for `src/` and once for `scripts/`, which has its own
  `tsconfig.json`: Node's types there, the browser's in `src/`.
- `npm run format` — Prettier over `src/` and `scripts/`, with its default
  settings. Run it at the end of every increment, before handing it back.
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
