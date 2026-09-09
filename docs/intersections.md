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

Two sections may cross more than once. A road drawn across a bend meets it
going in and coming out, and two curves can meet twice as well. Each
meeting is a junction of its own, and the section crossed is cut at every
one of them.

Sections that already share a node do not cross there. A run of roads drawn
end to end, or a new road started from an existing node, is a join the user
made, and nothing is split. That settles the shared point and nothing
further: two curves joined at one end can still meet somewhere else, and
that meeting is a crossing like any other.

Two collinear sections lying along each other do not meet at a point, and
are not a crossing. A road drawn on top of an existing one stays a second
road on top of it. A road that only grazes another, on the other hand, does
meet it at a point, and is a crossing — what makes a junction not worth
building is how short the pieces around it come out, not how shallow the
meeting was.

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

A refusal describes the section too. It is a verdict on the whole of what
was asked for, not the point a search gave up at, so it comes back saying
where the section was going and which junctions it was going to make —
none of which will be built. That is what lets a refused edit be shown as
the edit it was, rather than as nothing at all. It is only the buildable
answer that promises anything, and only that one carries the guarantee
that there is a section there to build.

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

## What a split leaves

A section cut in two leaves two of the same kind of road. Splitting a
straight leaves two straights, and splitting an arc leaves two arcs, each
following the shape the original ran in — so a bend that gains a junction
in the middle is still the same bend on either side of it.

Not quite the same circle, though. The node lands where the rules above put
it, which for a crossing that merged onto a neighbor is a little off the
road it was cut from, and each half is then the arc through the ends it
actually got rather than the one it was asked for. The difference is far
below what the length of a road section makes visible, and the alternative
— moving the node to suit the arithmetic — would put the geometry in charge
of where junctions go.

## Relationship to other modules

Lives in `src/core/`, above `RoadNetwork` and outside it: splitting a
section creates a node and two sections and destroys one, which is an edit
spanning several primitives, and the model stores rather than decides. It
reaches the network through the same public API any caller has.

The geometry itself knows nothing about the network — it is points and
distances, whichever shapes are meeting. Which pair of shapes is being
asked about is the only thing that varies; where the answer goes is not.

Editing tools call it in place of adding a section directly, and a
refusal is theirs to report. The tool still decides where the endpoints
are; this decides what the network does with the line between them.
