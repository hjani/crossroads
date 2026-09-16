import * as THREE from "three";
import { RoadNetwork } from "./core/network/RoadNetwork";
import { ArcSectionTool } from "./input/ArcSectionTool";
import { PanZoomControls } from "./input/PanZoomControls";
import { SelectionTool } from "./input/SelectionTool";
import { SmartArcTool } from "./input/SmartArcTool";
import { StraightSectionTool } from "./input/StraightSectionTool";
import { ToolManager } from "./input/ToolManager";
import { NetworkView } from "./render/NetworkView";
import { RoadSurfaceView } from "./render/RoadSurfaceView";
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

const grid = new THREE.GridHelper(1000, 20);
scene.add(grid);

const network = new RoadNetwork();

const roadSurfaceView = new RoadSurfaceView(network);
scene.add(roadSurfaceView.sceneObject);

const networkView = new NetworkView(network);
scene.add(networkView.sceneObject);

const tools = new ToolManager(renderer.domElement, window, viewport);
scene.add(tools.sceneObject);

// Where the layers meet: the palette names the tools, and this is what the
// names do. A tool is built fresh on every activation, since the manager
// disposes the one it replaces and an instance is single-use.
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
  {
    id: "arc",
    label: "Arc",
    activate: () => tools.setActiveTool(new ArcSectionTool(network, viewport)),
  },
  {
    id: "smart-arc",
    label: "Smart Arc",
    activate: () => tools.setActiveTool(new SmartArcTool(network, viewport)),
  },
]);
palette.select("straight");

const timer = new THREE.Timer();
// Suppresses the huge delta after the tab regains focus.
timer.connect(document);

function renderLoop(timestamp: number) {
  timer.update(timestamp);
  controls.update(timer.getDelta());
  roadSurfaceView.update();
  networkView.update();
  renderer.render(scene, viewport.camera);
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);
