import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clearanceRules } from "./clearanceRules";
import { junctionAnatomy } from "./junctionAnatomy";
import { junctionJoins } from "./junctionJoins";
import { junctionPairs } from "./junctionPairs";
import { junctionTessellation } from "./junctionTessellation";
import { roadMarkings } from "./roadMarkings";
import { roadwayTessellation } from "./roadwayTessellation";
import { smartArc } from "./smartArc";

/**
 * Writes every documentation picture into docs/images/, drawn by the
 * project's own code. `npm run docs:images`, after changing what a picture
 * shows.
 */

const PICTURES: Record<string, () => string> = {
  "clearance-rules.svg": clearanceRules,
  "junction-anatomy.svg": junctionAnatomy,
  "junction-joins.svg": junctionJoins,
  "junction-pairs.svg": junctionPairs,
  "junction-tessellation.svg": junctionTessellation,
  "roadway-tessellation.svg": roadwayTessellation,
  "road-markings.svg": roadMarkings,
  "smart-arc.svg": smartArc,
};

const folder = join("docs", "images");
mkdirSync(folder, { recursive: true });
for (const [name, draw] of Object.entries(PICTURES)) {
  writeFileSync(join(folder, name), draw());
  console.log(`wrote ${join(folder, name)}`);
}
