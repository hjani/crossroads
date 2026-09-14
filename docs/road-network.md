# Road Network Data Model

## Scope

- The graph of nodes and sections that every other module reads or edits.
- Pure logic: no rendering, no input handling, no snapping.
- Automatic intersections must fit without reshaping the model.

## What it holds

- **Node**: an exact position on the XZ ground plane. Knows which sections
  meet at it.
- **Section**: an edge between two nodes, plus its geometry.
- **Geometry**: how a section runs between its nodes: straight, or a
  circular arc.
- Nodes and sections have stable ids, valid for the element's lifetime.

### Arcs

An arc is fixed by a third position it passes through, between its ends.

- 3 points not in a line → exactly one circle through them → that point
  settles:
  - the radius
  - which way the road bends
  - the short or the long way round
- The circle is derived from the three, never stored → a moving node leaves
  nothing out of step.
- The ends already fix all but one degree of freedom → many third points
  describe the same arc.
  - → two sections have the same shape when their circles and ends agree,
    not when their stored points do.

## Rules

- A section joins two distinct, existing nodes.
- An arc's third position is not in line with its ends: no circle through
  them → no arc to build.
- Two nodes may be joined by more than one section.
- Removing a section keeps its end nodes, unless it was a node's last
  section.
- A node is removed only by removing every section meeting it.
  - No way to remove a node on its own, and none to leave one with no
    sections.
- Removing a node can strand the node at a section's far end → that one
  goes too.
  - One step, not a chain: a node stranded that way had only the section
    just removed, so nothing hangs off it in turn.

## Relationship to other modules

- The model answers questions and applies edits; it never decides them.
  - Grid snapping and node welding belong to the editing tools.
- Change detection: a version counter bumped on every mutation.
  - Coarse (any edit invalidates everything), but enough to drive a
    rebuild.
- Storage and invariants live in one place. Geometry math, queries, and
  edits spanning several primitives act on the model from outside → it
  doesn't become the home for everything.
