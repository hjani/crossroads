import * as THREE from "three";
import { RoadLayout } from "./core/layout/RoadLayout";
import { RoadNetwork } from "./core/network/RoadNetwork";
import { ArcSectionTool } from "./input/ArcSectionTool";
import { ConnectorTool } from "./input/ConnectorTool";
import { InspectTool } from "./input/InspectTool";
import { PanZoomControls } from "./input/PanZoomControls";
import { SectionSettings } from "./input/SectionSettings";
import { SmartArcTool } from "./input/SmartArcTool";
import { StraightSectionTool } from "./input/StraightSectionTool";
import { ToolManager } from "./input/ToolManager";
import { LiveRoadLayoutView } from "./render/LiveRoadLayoutView";
//import { NetworkView } from "./render/NetworkView";
import { PartStates } from "./render/PartStates";
import { Viewport } from "./render/Viewport";
import { InspectPanel } from "./ui/InspectPanel";
import { SectionSettingsPanel } from "./ui/SectionSettingsPanel";
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

const layout = new RoadLayout(network);

// What the tools say about the parts of the layout, and the surface shows.
const partStates = new PartStates();

const liveRoadLayoutView = new LiveRoadLayoutView(network, layout, partStates);
scene.add(liveRoadLayoutView.sceneObject);

// const networkView = new NetworkView(network);
// scene.add(networkView.sceneObject);

const tools = new ToolManager(renderer.domElement, window, viewport);
scene.add(tools.sceneObject);

// Global settings for section tools.
const sectionSettings = new SectionSettings();

// Where the layers meet: the palette names the tools, and this is what the
// names do. A tool is built fresh on every activation, since the manager
// disposes the one it replaces and an instance is single-use.
const palette = new ToolPalette(document.body, [
  {
    id: "inspect",
    label: "Inspect",
    activate: () =>
      tools.setActiveTool(
        new InspectTool(
          network,
          layout,
          viewport,
          partStates,
          new InspectPanel(document.body),
        ),
      ),
  },
  {
    id: "straight",
    label: "Straight",
    activate: () =>
      tools.setActiveTool(
        new StraightSectionTool(
          network,
          layout,
          viewport,
          partStates,
          sectionSettings,
          new SectionSettingsPanel(document.body, sectionSettings),
        ),
      ),
  },
  {
    id: "arc",
    label: "Arc (legacy)",
    activate: () =>
      tools.setActiveTool(
        new ArcSectionTool(
          network,
          layout,
          viewport,
          partStates,
          sectionSettings,
          new SectionSettingsPanel(document.body, sectionSettings),
        ),
      ),
  },
  {
    id: "smart-arc",
    label: "Smart Arc",
    activate: () =>
      tools.setActiveTool(
        new SmartArcTool(
          network,
          layout,
          viewport,
          partStates,
          sectionSettings,
          new SectionSettingsPanel(document.body, sectionSettings),
        ),
      ),
  },
  {
    id: "connector",
    label: "Connector",
    activate: () =>
      tools.setActiveTool(
        new ConnectorTool(
          network,
          layout,
          viewport,
          partStates,
          sectionSettings,
          new SectionSettingsPanel(document.body, sectionSettings),
        ),
      ),
  },
]);
palette.select("straight");

const timer = new THREE.Timer();
// Suppresses the huge delta after the tab regains focus.
timer.connect(document);

function renderLoop(timestamp: number) {
  timer.update(timestamp);
  controls.update(timer.getDelta());
  liveRoadLayoutView.update();
  //networkView.update();
  renderer.render(scene, viewport.camera);
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);
