import type { Engine } from "@babylonjs/core";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import {
  ArcRotateCamera,
  Color3,
  Color4,
  CreateCylinder,
  CreateGround,
  CreateSphere,
  CreateTorus,
  HemisphericLight,
  Mesh,
  Scene,
  StandardMaterial,
  Vector3,
} from "../app/babylon";
import type { GameConfig } from "../config";
import type { CombatLoadoutEntry, CombatSimulation } from "../game/battle/combat/CombatSimulation";
import type { GeneratedMap, Vec2 } from "../game/battle/map/MapGenerator";
import type { EventBus } from "../game/events/EventBus";
import { addCombatLayer } from "./combatLayer";
import { canvasToWorld } from "./mapping";

type SceneConfig = GameConfig["visual"]["scene"];

export function createBattleScene(
  engine: Engine,
  deps: {
    config: GameConfig;
    map: GeneratedMap;
    simulation?: CombatSimulation;
    bus?: EventBus;
    loadout?: readonly CombatLoadoutEntry[];
  },
): Scene {
  const { config, map } = deps;
  const scene = new Scene(engine);
  const visualScene = config.visual.scene;
  const paperColor = colorFromConfig(config.visual.palette.surface.paper);
  const inkColor = colorFromConfig(config.visual.palette.ink.main);

  scene.clearColor = Color4.FromColor3(paperColor);

  const paperMaterial = createMaterial(scene, "paper-material", paperColor);
  const inkMaterial = createMaterial(scene, "ink-material", inkColor);
  const paperSize = paperWorldSize(config.maps.canvas, visualScene);
  const paper = CreateGround("paper", { width: paperSize.width, height: paperSize.height }, scene);
  paper.material = paperMaterial;

  addPaperBorder(scene, inkMaterial, visualScene, paperSize);
  addRoutes(scene, inkMaterial, map, config);
  addCore(scene, inkMaterial, map, config);
  addOpenSlots(scene, inkMaterial, map, config);
  if (deps.simulation !== undefined && deps.bus !== undefined && deps.loadout !== undefined) {
    addCombatLayer(scene, {
      config,
      map,
      simulation: deps.simulation,
      bus: deps.bus,
      loadout: deps.loadout,
    });
  }
  addCamera(scene, visualScene);
  new HemisphericLight("light", new Vector3(0, 1, 0), scene);

  return scene;
}

function addCamera(scene: Scene, visualScene: SceneConfig): void {
  const camera = new ArcRotateCamera(
    "camera",
    toRadians(visualScene.camera.alphaDeg),
    toRadians(visualScene.camera.betaDeg),
    visualScene.camera.radiusWorldUnits,
    Vector3.Zero(),
    scene,
  );
  camera.setTarget(Vector3.Zero());
}

function addRoutes(scene: Scene, material: StandardMaterial, map: GeneratedMap, config: GameConfig): void {
  const radius = (config.visual.scene.routeWidthCanvasUnits * config.visual.scene.worldUnitsPerCanvasUnit) / 2;

  map.routes.forEach((route, index) => {
    const path = route.map((point) => canvasPointToVector(point, config, radius));
    const mesh = CreateTube(
      `route-${index}`,
      {
        path,
        radius,
        tessellation: 12,
        cap: Mesh.CAP_ALL,
      },
      scene,
    );
    mesh.material = material;
    mesh.metadata = { points: route };
  });
}

function addCore(scene: Scene, material: StandardMaterial, map: GeneratedMap, config: GameConfig): void {
  const firstRoute = map.routes[0];
  const end = firstRoute[firstRoute.length - 1];
  const radius = config.visual.scene.coreRadiusCanvasUnits * config.visual.scene.worldUnitsPerCanvasUnit;
  const routeRadius = (config.visual.scene.routeWidthCanvasUnits * config.visual.scene.worldUnitsPerCanvasUnit) / 2;
  const position = canvasPointToVector(end, config, routeRadius + radius / 2);

  const core = CreateTorus(
    "core",
    {
      diameter: radius * 2,
      thickness: routeRadius,
      tessellation: 48,
    },
    scene,
  );
  core.position = position;
  core.rotation.x = Math.PI / 2;
  core.material = material;

  const coreCenter = CreateSphere(
    "core-ink",
    {
      diameter: radius,
      segments: 24,
    },
    scene,
  );
  coreCenter.position = position.clone();
  coreCenter.position.y += routeRadius;
  coreCenter.material = material;
}

function addOpenSlots(scene: Scene, inkMaterial: StandardMaterial, map: GeneratedMap, config: GameConfig): void {
  const slotRadius = config.visual.scene.slotRadiusCanvasUnits * config.visual.scene.worldUnitsPerCanvasUnit;
  const routeRadius = (config.visual.scene.routeWidthCanvasUnits * config.visual.scene.worldUnitsPerCanvasUnit) / 2;

  for (const slot of map.openSlots) {
    const palette = config.visual.palette.elements[slot.element];
    if (palette === undefined) {
      throw new Error(`visual.palette.elements missing "${slot.element}"`);
    }

    const slotMaterial = createMaterial(scene, `slot-${slot.slotTypeId}-material`, colorFromConfig(palette.primary));
    const slotMesh = CreateCylinder(
      `slot-${slot.slotTypeId}`,
      {
        diameter: slotRadius * 2,
        height: routeRadius,
        tessellation: 40,
      },
      scene,
    );
    slotMesh.position = canvasPointToVector(slot.position, config, routeRadius / 2);
    slotMesh.material = slotMaterial;
    slotMesh.metadata = {
      slotTypeId: slot.slotTypeId,
      element: slot.element,
    };

    const ring = CreateTorus(
      `slot-${slot.slotTypeId}-ring`,
      {
        diameter: slotRadius * 2,
        thickness: routeRadius / 2,
        tessellation: 40,
      },
      scene,
    );
    ring.position = canvasPointToVector(slot.position, config, routeRadius);
    ring.rotation.x = Math.PI / 2;
    ring.material = inkMaterial;

    addSlotGlyph(scene, inkMaterial, slotMesh.position, slot.slotTypeId, slotRadius, routeRadius);
  }
}

function addSlotGlyph(
  scene: Scene,
  material: StandardMaterial,
  center: Vector3,
  slotTypeId: string,
  slotRadius: number,
  routeRadius: number,
): void {
  const y = center.y + routeRadius;
  const strokeRadius = routeRadius / 4;
  const strokeLength = slotRadius;
  const strokes = [
    [
      new Vector3(center.x - strokeLength / 2, y, center.z),
      new Vector3(center.x + strokeLength / 2, y, center.z),
    ],
    [
      new Vector3(center.x, y, center.z - strokeLength / 2),
      new Vector3(center.x, y, center.z + strokeLength / 2),
    ],
  ];

  strokes.forEach((path, index) => {
    const stroke = CreateTube(
      `slot-${slotTypeId}-glyph-${index}`,
      {
        path,
        radius: strokeRadius,
        tessellation: 8,
        cap: Mesh.CAP_ALL,
      },
      scene,
    );
    stroke.material = material;
  });
}

function addPaperBorder(
  scene: Scene,
  material: StandardMaterial,
  visualScene: SceneConfig,
  paperSize: { width: number; height: number },
): void {
  const halfWidth = paperSize.width / 2;
  const halfHeight = paperSize.height / 2;
  const y = visualScene.routeWidthCanvasUnits * visualScene.worldUnitsPerCanvasUnit;
  const radius = y / 4;
  const corners = [
    new Vector3(-halfWidth, y, halfHeight),
    new Vector3(halfWidth, y, halfHeight),
    new Vector3(halfWidth, y, -halfHeight),
    new Vector3(-halfWidth, y, -halfHeight),
  ];

  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    const border = CreateTube(
      `paper-border-${index}`,
      {
        path: [corner, next],
        radius,
        tessellation: 8,
        cap: Mesh.CAP_ALL,
      },
      scene,
    );
    border.material = material;
  });
}

function canvasPointToVector(point: Vec2, config: GameConfig, y: number): Vector3 {
  const mapped = canvasToWorld(point, {
    canvas: config.maps.canvas,
    worldUnitsPerCanvasUnit: config.visual.scene.worldUnitsPerCanvasUnit,
  });

  return new Vector3(mapped.x, y, mapped.z);
}

function paperWorldSize(canvas: GameConfig["maps"]["canvas"], visualScene: SceneConfig): { width: number; height: number } {
  const margin = visualScene.paperMarginCanvasUnits * 2;
  const units = visualScene.worldUnitsPerCanvasUnit;

  return {
    width: (canvas.widthUnits + margin) * units,
    height: (canvas.heightUnits + margin) * units,
  };
}

function createMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color;
  material.disableLighting = true;

  return material;
}

function colorFromConfig(value: string): Color3 {
  return Color3.FromHexString(value);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
