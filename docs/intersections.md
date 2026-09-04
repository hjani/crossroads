# Intersections

## Scope

Making roads that cross actually meet: when a section is added, finding
where it crosses the sections already there, and splitting both so they
share a node.

Only the geometry and the edit. What an intersection looks like, or how
traffic would move through one, is not part of this — a junction is an
ordinary node of the network, drawn like any other.

## What a crossing is

Two sections cross where their geometry meets at a point that is not
already shared between them. The point is not special in the model: both
sections are split there, and the node that results is the same kind of
node as any endpoint the user clicked.

Sections that already share a node do not cross at it. A run of roads
drawn end to end, or a new road started from an existing node, is a join
the user made, and nothing is split.

Two collinear sections lying along each other do not meet at a point, and
are not a crossing. A road drawn on top of an existing one stays a second
road on top of it.

## When it is decided

Crossings are resolved as a section is added. There is no pass over the
whole network looking for crossings, because there is no way for one to
appear except by adding a section.

Deciding and doing are two steps, and only the second one touches the
network. The first answers what a section between two points would build —
which sections it cuts, where the junctions land, and whether the result
can be built at all — as a value that stands on its own. The second carries
that answer out. Nothing is decided twice: the second step asks no question
the first did not already settle, so what is built is what was described.

Being able to ask without building is the point of the separation. The same
question serves a section about to be committed and one still being dragged
around, so a tool can show what a click would do before it is made, and the
answer it showed is the one that lands.

The whole edit lands at once or not at all. A section that crosses three
others adds every piece and every junction together; a refused one is
refused before anything is created, so the network is untouched rather than
restored.

## How close is the same place

Two distances decide, both in meters, because both are about the ground
rather than about the view. A crossing that resolves differently depending
on the zoom would place the same click differently, which is the reason
the grid pitch is fixed too.

**The same place — one centimeter.** A crossing that close to an existing
node is that node. Step a centimeter aside while standing in an
intersection and you are still standing in the same intersection; nothing
on the ground separates the two positions. This is what makes a road
ending on another road a T-junction rather than a near miss, and what lets
a road drawn through an existing node use it.

**A road — one meter.** A piece shorter than this is refused. Nothing
that short is a road section; it is an artifact of a click that was
nearly, but not quite, somewhere meaningful. Every piece an edit would
leave is measured, the whole section included when it crosses nothing to
be cut at — otherwise the rule would hold only where roads happen to
meet, and a stub drawn in open ground would stand.

Between the two there is no good answer, and the edit is refused rather
than guessed at: the user is trying to hit something and missing. Refusing
leaves the edit in progress, so the click can be made again.

Both distances stand in for a rule that will be about width. How close two
junctions may sit is a property of how wide the roads are, and once
sections have width these follow from it.

## Relationship to other modules

Lives in `src/core/`, above `RoadNetwork` and outside it: splitting a
section creates a node and two sections and destroys one, which is an edit
spanning several primitives, and the model stores rather than decides. It
reaches the network through the same public API any caller has.

The segment math itself knows nothing about the network — it is points and
distances, so it can be tested and reused as curved sections arrive.

Editing tools call it in place of adding a section directly, and a
refusal is theirs to report. The tool still decides where the endpoints
are; this decides what the network does with the line between them.
