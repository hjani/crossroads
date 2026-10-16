# Part States

## Scope

- How the road surface shows what a tool says about its parts: aimed,
  selected, planned, refused.
- How a plan's layout is shown in place of the live one.
- Out of scope: which parts a tool marks, and when (`docs/tools.md`).

## One state shown per part

- A part: a junction (by node id) or a roadway (by section id).
- A part can be in several states at once:

      aimed, selected, planned, refused, hidden

- It shows one: the highest.

      hidden > refused > planned > selected > aimed

  - → the order a tool sets them in doesn't matter
  - → a plan always wins over hover and selection
  - → taking a state off leaves the ones under it showing
- A tool sets a state for all parts at once: exactly these parts are in it,
  every other part isn't.
  - → each state changes on its own schedule: aimed with the cursor,
    selected with a click
  - → a state set again to the same parts is no change → nothing redrawn

## Drawn by the surface

- The state is painted by the surface shader, not by a mesh over it.
  - → two tints can't stack: a part has one color
- Each vertex carries its part's state.
  - A state change rewrites that value only → the surface geometry is still
    rebuilt on an edit and on nothing else.
- A state is a tint: its color (`STATE_COLOR`) mixed over the finished
  surface, markings included.
- `hidden` → the part isn't drawn at all.
- Turn arrows, meshes of their own (`docs/road-markings.md`), show their
  roadway's state: its tint mixed into their white, as into the painted
  marks; hidden with it.
  - They cover the surface rather than tint over it → still one color per
    pixel.
- The live surface keeps its states across a rebuild. Ids no longer in the
  network are dropped.

## A plan in place of the live layout

- With a speculation (`docs/intersections.md`): the parts the edit changes
  or that are in violation are drawn from the speculative layout, the rest
  from the live one.
  - plan surface: the speculative changed and violating nodes and sections
  - live surface: the same ids hidden, plus `removedSections`
- A layout tiles the ground → the two surfaces share edges and never
  overlap.
  - → no height offset or draw order between them → a tilted camera needs
    no change
  - → what is shown is the road after the click
- Tinted: only the planned road (`plannedRoadNodes`, `plannedRoadSections`)
  and the violations. The rest of the region is plain asphalt.
- Cost follows the edit, not the network: the same split clearance measures
  on.

### Removed sections

The live sections the edit takes away: the ones it cuts.

    removedSections = { s ∈ live.sectionsAt(n) : s ∉ speculative.sectionsAt(n) },  n ∈ changedNodes

- Complete: a cut section is replaced end to end by new pieces → both its
  live ends get a new section → both are in `changedNodes`.
- An edit never removes a node: a cut adds its pieces before removing the
  section.
- A new node isn't in the live network → `live.sectionsAt(n)` is empty.

### Without a speculation

- Always a refusal made before speculating → no layout to swap in.
- A translucent band along the centerline, over the live surface.

## Relationship to other modules

- States and their priority, the surface shader: `src/render/`.
- `removedSections`: on the speculation, in `src/core/layout/`.
- The states are kept by a tracker of their own: tools write it, the
  surface reads it. `main.ts` makes it and hands it to both.
  - The surface learns of changes from its version, as from the network's.
  - A tool resets it when constructed → nothing of the tool before it
    lingers.
