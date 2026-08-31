import * as THREE from "three";
import { RoadNetwork } from "./core/RoadNetwork";
import { PanZoomControls } from "./input/PanZoomControls";
import { StraightSectionTool } from "./input/StraightSectionTool";
import { ToolManager } from "./input/ToolManager";
import { NetworkView } from "./render/NetworkView";
import { Viewport } from "./render/Viewport";

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

const networkView = new NetworkView(network);
scene.add(networkView.sceneObject);

const tools = new ToolManager(renderer.domElement, window);
scene.add(tools.sceneObject);
tools.setActiveTool(new StraightSectionTool(network, viewport));

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
