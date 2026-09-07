import * as THREE from "three";
import { RoadNetwork } from "./core/RoadNetwork";
import { STRAIGHT } from "./core/types";
import { PanZoomControls } from "./input/PanZoomControls";
import { SelectionTool } from "./input/SelectionTool";
import { StraightSectionTool } from "./input/StraightSectionTool";
import { ToolManager } from "./input/ToolManager";
import { NetworkView } from "./render/NetworkView";
import { Viewport } from "./render/Viewport";
import { ToolPalette } from "./ui/ToolPalette";

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const viewport = new Viewport(renderer.domElement);

function handleResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  viewport.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", handleResize);
handleResize();

const controls = new PanZoomControls(viewport, renderer.domElement, window);

const grid = new THREE.GridHelper(100, 20);
scene.add(grid);

const network = new RoadNetwork();

// Scaffolding: no tool places an arc yet, so building a few here is the only
// way to see one drawn. Goes when the arc tool lands.
//
// Straight to the network rather than through `edits.ts`, so nothing is
// checked for crossings — these are placed clear of each other by hand.
const curve = network.addSection(
  { x: -20, z: 10 },
  { x: 0, z: 10 },
  { kind: "arc", via: { x: -10, z: 4 } },
);
// Carrying on from where the curve ends, so the two kinds of section are
// visible meeting at one node.
network.addSection(curve.to, { x: 12, z: 16 }, STRAIGHT);
// More than half a circle: the via stands further off the chord than the
// radius, which is what sends the arc the long way round.
network.addSection(
  { x: 4, z: -8 },
  { x: 14, z: -8 },
  { kind: "arc", via: { x: 9, z: 2 } },
);

const networkView = new NetworkView(network);
scene.add(networkView.sceneObject);

const tools = new ToolManager(renderer.domElement, window);
scene.add(tools.sceneObject);

// Where the layers meet: the palette names the tools, and this is what the
// names do. A tool is built fresh on every activation, since the manager
// disposes the one it replaces and an instance is single-use. The entry
// with no action is the tool that does not exist yet — arcs, in M4.
const palette = new ToolPalette(document.body, [
  {
    id: "select",
    label: "Select",
    activate: () => tools.setActiveTool(new SelectionTool(network, viewport)),
  },
  {
    id: "straight",
    label: "Straight",
    activate: () =>
      tools.setActiveTool(new StraightSectionTool(network, viewport)),
  },
  { id: "arc", label: "Arc", activate: null },
]);
palette.select("straight");

const timer = new THREE.Timer();
// Suppresses the huge delta after the tab regains focus.
timer.connect(document);

function renderLoop(timestamp: number) {
  timer.update(timestamp);
  controls.update(timer.getDelta());
  networkView.update();
  renderer.render(scene, viewport.camera);
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);
