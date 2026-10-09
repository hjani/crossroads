# Ring union

## Scope

- The ground covered by any of several shapes, as one outline.
- Built for junctions, whose ground is put together from overlapping shapes
  (`docs/road-layout.md`).
- Pure geometry: knows nothing of roads.

## Rings

![Four panels on three rings A, B and C. 1: the rings, each running counterclockwise; B overlaps A and shares part of its bottom edge, C sits left of A and shares its left edge. 2: the points where the pieces are cut. 3: which parts are kept and which dropped. 4: the chained result](images/ring-union.svg)

- **Ring**: a closed line around an area, given as a list of pieces.
- **Piece**: where it ends, and how it gets there from the piece before:
  - straight, or round an arc through a given point (its `via`)
  - no start of its own: it starts where the piece before ends, the first
    where the last ends → a ring is always closed
- Runs counterclockwise: walking along it, the area is on the left.
- Doesn't cross itself.
- Each piece carries a **tag**: what it borders. The union carries tags
  through without reading them.
  - A junction's outline is a ring; its tags say curb or roadway end
    (`docs/road-layout.md`, Outline).

## The union

- One ring around the ground that at least one input ring covers.
- Every piece of it is part of an input piece:
  - with that piece's tag
  - arcs stay arcs: part of an arc is an arc on the same circle, never
    chords
  - except an arc within `SAME_POINT_METERS` of its chord: straight at that
    tolerance, and taken as straight
    - a circle through three points so nearly in line is fitted poorly →
      two copies of one curb would come out as different circles, crossing
      each other at random places along it
- Where two rings share a stretch, the caller's merge rule picks its tag.
- Only the outer ring:
  - a hole, enclosed but covered by no ring → comes back covered, and is
    logged
  - ground in separate pieces → logged, and only one comes back
- Same place: within `SAME_POINT_METERS`, as everywhere in the geometry.

## How

Three steps; the picture follows them on rings `A`, `B`, `C`.

1. **Split** each piece wherever a piece of another ring crosses it or ends
   on it.
   - ends too, not just crossings → a stretch two rings share comes out as
     the same part in both
   - an arc is cut into arcs: same circle, `via` halfway along each part
2. **Keep or drop** each part:
   - another ring has the same part (same ends, same middle) → a shared
     stretch:
     - both run the same way → both areas on the same side → outline: keep
       one
     - opposite ways → the two areas meet there → a seam: drop both
     - direction tells the side because every ring runs counterclockwise,
       area on the left
     - the same part, not just one nearby: a short part beside a crossing
       runs close to the other ring without sharing it
   - otherwise, by its middle point: inside another ring → drop, outside
     every other ring → keep
3. **Chain** the kept parts end to end, from any one round to it again.
   - each kept part ends where exactly one other starts
   - except where two rings only touch at a point: take the part that turns
     furthest right → stays on the outside

- Inside: counted along a ray, even–odd, each arc by its true circle —
  as picking a junction does.
- Every piece is tested against every other: a junction has only a handful.

## Relationship to other modules

- In `src/core/geometry/`: no network, no layout, no Three.js.
- The caller builds the rings and supplies the merge rule.
