import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { biarc } from "./biarc";
import { clearanceRules } from "./clearanceRules";
import { connector } from "./connector";
import { junctionAnatomy } from "./junctionAnatomy";
import { junctionBiarc } from "./junctionBiarc";
import { junctionJoins } from "./junctionJoins";
import { junctionPairs } from "./junctionPairs";
import { junctionTessellation } from "./junctionTessellation";
import { laneConnectionShape } from "./laneConnectionShape";
import { laneConnections } from "./laneConnections";
import { roadMarkings } from "./roadMarkings";
import { roadwayTessellation } from "./roadwayTessellation";
import { smartArc } from "./smartArc";

/**
 * Writes every documentation picture into docs/images/, drawn by the
 * project's own code. `npm run docs:images`, after changing what a picture
 * shows.
 */

const PICTURES: Record<string, () => string> = {
  "biarc.svg": biarc,
  "clearance-rules.svg": clearanceRules,
  "connector.svg": connector,
  "junction-anatomy.svg": junctionAnatomy,
  "junction-biarc.svg": junctionBiarc,
  "junction-joins.svg": junctionJoins,
  "junction-pairs.svg": junctionPairs,
  "junction-tessellation.svg": junctionTessellation,
  "lane-connection-shape.svg": laneConnectionShape,
  "lane-connections.svg": laneConnections,
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
