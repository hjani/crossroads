# Road Network Data Model

## Scope

The road network itself: the graph of nodes and sections that every other
module reads from or edits. Pure logic — no rendering, no input handling, no snapping.

Straight sections only for now, but curved sections and automatically
inserted intersections must fit without reshaping the model.

## What it holds

A **node** is an exact position on the XZ ground plane, and knows which
sections meet at it.

A **section** is an edge between two nodes plus its geometry.

Nodes and sections are addressed by stable ids, valid for the lifetime of
the element.

## Rules

- A section joins two distinct, existing nodes.
- Two nodes may be joined by more than one section.
- Removing a section leaves its endpoint nodes in place, unless it was the last section of the node.

## Relationship to other modules

The model answers questions and applies edits; it never decides them.
Grid snapping and node welding belong to the editing tools.

Consumers detect change through a version counter bumped on every
mutation. Coarse — any edit invalidates everything — but enough to drive a
rebuild.

Storage and invariants live in one place. Geometry math, queries, and
edits spanning several primitives are separate and act on the model from
outside, so it does not become the home for everything.
