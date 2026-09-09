# Smart Arc — brainstorming notes

Not a design note. Nothing here is decided, and none of it is a plan to
build. It is a record of one discussion, kept so the reasoning does not
have to be found again. "Smart arc" is a working name.

## The complaint

The three-point arc tool is exact and is the more powerful of the two,
but it is hard to plan a curve that joins the existing network in a
natural way. Nothing about placing two ends and a position between them
takes any account of the roads already meeting those ends, so the arc
arrives at whatever angle the three points happen to produce. A smooth
join is reachable — there is a control point that gives one — but finding
it means hunting for it by eye, and a kink at the join reads as a bad
road far more than a slightly wrong radius does.

So the question was not how to place an arc more precisely. It was how to
make the join the thing that is given, rather than the thing you hunt
for.

## First idea: guess the circle from the cursor path

Two clicks, as with straights, while the tool watches the cursor between
them and fits a circle to the path it traced. Both ends exact, radius
from the fit, the control point derived and never shown.

The math is easier than it looks. Fixing both ends puts the center on the
perpendicular bisector of the chord, so the fit has one unknown: the
center's offset `s` along that bisector, with the radius forced to
`r² = h² + s²` for a half-chord `h`. Written out, the algebraic residual
for a path sample loses its quadratic term —

    |p − m − s·n|² − (h² + s²)  =  (|p−m|² − h²) − 2s·(n·(p−m))

— so it is linear in `s`, and least squares is one division. A path that
hugs the chord drives the denominator to zero, `s` to infinity, and the
answer to a straight line, which is correct rather than a failure case.

What stopped it is that it does not answer the complaint. A fitted circle
is still a circle that ignores the roads at its ends, so the join is no
more given than before — the tool would only make the same hunt happen
with the hand instead of with a click. It has usability costs of its own
on top: shaping the curve and aiming the endpoint are the same motion, so
a wrong bend cannot be corrected without moving the end, and moving a
mouse in a straight line is the natural way to get from one place to
another, so it would mostly produce straights unless the arc is
consciously performed.

Parked rather than rejected. It is a real tool, and it turned out to own
exactly one case — see below.

## Second idea: take the direction from what is already there

Where a new section starts on an existing node, that node already carries
directions: the ways the sections meeting it run. Fix on one of them and
the whole arc follows from the two endpoints, with nothing left to aim.
Exactly one circle passes through a point with a given direction and
reaches another point, and it falls out of the same cancellation as
above:

    center = P + s·n,   n square to the direction t at P
    s = |d|² / (2·n·d),   d = Q − P

`n·d = 0` means the far end lies along that direction — a straight, which
the existing collinear-via handling already covers.

This answers the complaint directly: the join is no longer something to
hunt for, it is the input the arc is built from. It is not the common
case for the *first* section of a road, which usually starts on empty
ground with no direction to take, but it is the common case for
everything after it — continuing a chain, or branching off a junction
that already exists.

It also depends only on where the cursor is now and not on how it got
there, which matters when planning, since half of moving the cursor is
looking around and reconsidering.

## How much the user still has to supply

An arc between two fixed endpoints has exactly one freedom left — how
much it bends. Every direction taken from an existing node spends that
freedom completely. So the shape of the problem depends on how many of
the two endpoints land on something that already exists:

**Neither.** Nothing spends the freedom, so the user has to supply the
bend some other way. This is the three-point tool's case, and the
path-fitting idea's — a ring road, or any curve floating free of the
network. There is also no join to get right here, which is why the
complaint does not apply to it.

**One.** Each direction available at that end settles the bend on its
own, so the arc is fully determined and needs no further input. This is
the case the tool would exist for.

**Both.** More directions are on offer than there is freedom to spend, so
at most one of them can be honored and the other end will meet its road
at an angle. That is not a defect: continuity is what you want when
*continuing* a road, while arriving at a junction at an angle is what
junctions are for. Making both ends smooth needs two arcs meeting at a
floating joint — the classic biarc — which would be the first time an
edit produced two sections from one gesture. Left alone for now.

## The candidates are arcs

From the user's side there is one gesture: place two endpoints, and get a
set of candidate arcs to choose between. Directions are how the tool
generates that set internally — each direction available at either
endpoint, combined with the two endpoints, produces exactly one arc — but
they are never what is chosen. What is chosen is a road.

Two rules narrow the set.

**Drop the ones that go the wrong way round.** A direction pointing away
from the far end can only be satisfied by an arc sweeping more than half
a circle to get there, and in the exactly-backward case the formula
quietly hands back a straight that does not leave in that direction at
all. So this is load-bearing rather than tidying. With it enforced, every
surviving arc sweeps less than half a circle, by the tangent–chord rule,
and no separate guard on sweep is needed.

**Prefer the least curved.** Of the arcs that remain, the gentlest is
almost always the one meant. Conveniently it is also the cheapest to
find: since every candidate spans the same chord, comparing curvature
`2·|n·d| / |d|²` reduces to comparing `t·d`, so the least curved arc is
the one whose direction is aimed most nearly at the cursor. Point roughly
where you want to go and the tool proposes the road you plausibly meant.

Both rules read the same at either end of the section: keep a direction
whose sense of travel agrees with going from the first point to the
second. At the start that means pointing toward the far end; at the far
end, pointing away from the start.

## Where the directions come from

This part moved the most, and is the part most likely to move again.

**Continuation** — each section at the node contributes the direction it
travels through the node. This is the chaining case and the reason the
tool exists.

**Bisectors** — for a fork, the direction that splits the angular gap
between two neighboring sections. This replaced an earlier suggestion of
offering perpendiculars, and the check that settled it: at a straight
through-node the two gaps are 180° each, so their bisectors *are* the
perpendiculars. The bisector does not contradict the intuition that city
branches leave at a right angle; it gives the same answer where that
intuition is clearly right, and a sensible one where "perpendicular to
what?" has no answer. At a three-way node with sections 120° apart, the
perpendicular to one crowds another at 30° clearance, while the bisector
sits evenly clear of both.

Clearance is not only cosmetic. A branch leaving close to an existing
section tends to run near it and cross it a short way out, which makes a
split and a very short piece right beside the junction — geometry worth
not creating. Bisectors push away from that by construction. The
clearance is local to the node, though: sections are arcs, so two roads
60° apart where they meet can still converge further out, and the preview
is what says whether it worked.

**Perpendiculars, at open ends only** — a node with one section has a
single gap of 360°, whose bisector points back down the road it came
from. So the bisector rule degenerates exactly where a dead end might
still want a square turn, and the perpendiculars fill that hole. The one
exception, with a reason.

**No direction at all** — the plain straight between the two points,
always offered. A fork at an arbitrary angle is a real thing and should
not require leaving the tool.

Duplicates are expected and are a good sign: at a square crossroads a
neighbor's bisector and a section's continuation are the same direction.
Dedupe them.

## Choosing on screen

A candidate is only a concrete arc once the second endpoint is known, so
a literal "show them all and click one" puts the choice after the second
click — three clicks, the same count as the three-point tool. Not a
regression, since picking from a few finished roads is much easier than
aiming a point in open space, but it can usually be skipped.

The shape that seemed best: as the cursor moves toward the second point,
draw the winning arc solid and the next few as thin ghosts. The common
case stays at two clicks, and when the guess is wrong the alternatives
are already on screen, so the second click lands on a ghost instead of on
empty ground. A key to cycle is a shortcut on top; the ghosts are what
makes it discoverable.

Draw only the best few, not the whole set. A three-way junction generates
around nine directions before filtering, and the display should not grow
with the junction.

Whatever it picks has to be visible — which section is being continued,
or which gap bisected. A tool that guesses has to say what it guessed, or
the arc just does inexplicable things.

## The useful structural finding

Several rounds of argument in this discussion changed only *which
directions get generated*. The two narrowing rules, the picker, and the
arc solve never moved. So the set of directions is the cheap part to
change and does not have to be right the first time, while the machinery
around it is the part worth getting right.

## Left open

- Whether directions from the far endpoint earn their place, or are only
  noise. They cost nothing to generate and could be drawn dimmer than the
  start's, on the grounds that you are drawing *from* somewhere *to*
  somewhere.
- Whether joining two existing junctions ever wants both ends smooth,
  which is the biarc and a bigger change than anything else here.
- Whether the path-fitting tool is ever needed, given the three-point
  tool already covers the case it owns.
- How many ghosts is too many.
- Whether nice radii — 25 m, 50 m, 100 m — should pull the result, which
  would compose with any of this and belongs to none of it.
