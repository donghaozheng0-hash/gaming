import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import {
  Color3,
  CreateBox,
  CreateCylinder,
  CreateSphere,
  Mesh,
  Scene,
  StandardMaterial,
  Vector3,
} from "../app/babylon";
import type { GameConfig } from "../config";
import type {
  CombatLoadoutEntry,
  CombatMonsterView,
  CombatSimulation,
} from "../game/battle/combat/CombatSimulation";
import type { GeneratedMap, Vec2 } from "../game/battle/map/MapGenerator";
import type { EventBus } from "../game/events/EventBus";
import { canvasToWorld } from "./mapping";

interface CombatLayerDeps {
  config: GameConfig;
  map: GeneratedMap;
  simulation: CombatSimulation;
  bus: EventBus;
  loadout: readonly CombatLoadoutEntry[];
}

interface ShotLine {
  mesh: Mesh;
  remainingSeconds: number;
}

interface HpBar {
  fill: Mesh;
  fillBasePosition: Vector3;
  widthWorldUnits: number;
}

export function addCombatLayer(scene: Scene, deps: CombatLayerDeps): void {
  const monsterMeshes = new Map<number, Mesh>();
  const materialCache = new Map<string, StandardMaterial>();
  const shotLines: ShotLine[] = [];
  const hpBar = addCoreHpBar(scene, deps.config, deps.map, materialCache);

  addRuneMarkers(scene, deps, materialCache);

  const unsubscribeFired = deps.bus.on("rune.fired", (payload) => {
    const slot = deps.map.openSlots[payload.slotIndex];
    const target = deps.simulation.getMonsterViews().find((monster) => monster.entityId === payload.targetEntityId);

    if (slot === undefined || target === undefined) {
      return;
    }

    const rune = findRune(deps.config, payload.runeId);
    const material = materialForRune(scene, deps.config, rune.id, rune.element, materialCache);
    const lift = deps.config.visual.scene.combat.fireLineLiftCanvasUnits * deps.config.visual.scene.worldUnitsPerCanvasUnit;
    const radius =
      (deps.config.visual.scene.combat.fireLineWidthCanvasUnits *
        deps.config.visual.scene.worldUnitsPerCanvasUnit) /
      2;
    const mesh = CreateTube(
      `rune-fire-${payload.runeId}-${payload.targetEntityId}`,
      {
        path: [
          canvasPointToVector(slot.position, deps.config, lift),
          canvasPointToVector(target.position, deps.config, lift),
        ],
        radius,
        tessellation: 8,
        cap: Mesh.CAP_ALL,
      },
      scene,
    );
    mesh.material = material;
    shotLines.push({
      mesh,
      remainingSeconds: deps.config.visual.scene.combat.fireLineLifetimeSeconds,
    });
  });

  scene.onBeforeRenderObservable.add(() => {
    updateMonsterMeshes(scene, deps.config, deps.simulation.getMonsterViews(), monsterMeshes, materialCache);
    updateCoreHpBar(deps.simulation, hpBar);
    updateShotLines(shotLines, scene.getEngine().getDeltaTime() / 1000);
  });

  scene.onDisposeObservable.add(() => {
    unsubscribeFired();
  });
}

function addRuneMarkers(scene: Scene, deps: CombatLayerDeps, materialCache: Map<string, StandardMaterial>): void {
  const combat = deps.config.visual.scene.combat;
  const units = deps.config.visual.scene.worldUnitsPerCanvasUnit;
  const radius = combat.runeMarkerRadiusCanvasUnits * units;
  const height = combat.runeMarkerHeightCanvasUnits * units;
  const lift = combat.monsterLiftCanvasUnits * units;

  for (const entry of deps.loadout) {
    const slot = deps.map.openSlots[entry.slotIndex];

    if (slot === undefined) {
      throw new Error(`loadout slotIndex ${entry.slotIndex} is outside map.openSlots`);
    }

    const rune = findRune(deps.config, entry.runeId);
    const marker = CreateCylinder(
      `rune-${entry.slotIndex}-${rune.id}`,
      {
        diameter: radius * 2,
        height,
        tessellation: 6,
      },
      scene,
    );
    marker.position = canvasPointToVector(slot.position, deps.config, lift);
    marker.material = materialForRune(scene, deps.config, rune.id, rune.element, materialCache);
    marker.metadata = {
      slotIndex: entry.slotIndex,
      runeId: rune.id,
      element: rune.element,
    };
  }
}

function addCoreHpBar(
  scene: Scene,
  config: GameConfig,
  map: GeneratedMap,
  materialCache: Map<string, StandardMaterial>,
): HpBar {
  const combat = config.visual.scene.combat;
  const units = config.visual.scene.worldUnitsPerCanvasUnit;
  const route = map.routes[0];
  const end = route[route.length - 1];
  const width = combat.coreHpBarWidthCanvasUnits * units;
  const depth = combat.coreHpBarHeightCanvasUnits * units;
  const height = combat.coreHpBarThicknessCanvasUnits * units;
  const position = canvasPointToVector(end, config, combat.coreHpBarLiftCanvasUnits * units);

  const background = CreateBox(
    "core-hp-bg",
    {
      width,
      height,
      depth,
    },
    scene,
  );
  background.position = position.clone();
  background.material = materialForColor(scene, "core-hp-bg-material", config.visual.palette.ink.main, materialCache);

  const fill = CreateBox(
    "core-hp-fill",
    {
      width,
      height,
      depth,
    },
    scene,
  );
  fill.position = position.clone();
  fill.position.y += height;
  fill.material = materialForColor(scene, "core-hp-fill-material", config.visual.palette.ink.warning, materialCache);

  return {
    fill,
    fillBasePosition: fill.position.clone(),
    widthWorldUnits: width,
  };
}

function updateMonsterMeshes(
  scene: Scene,
  config: GameConfig,
  views: readonly CombatMonsterView[],
  monsterMeshes: Map<number, Mesh>,
  materialCache: Map<string, StandardMaterial>,
): void {
  const aliveIds = new Set(views.map((view) => view.entityId));

  for (const [entityId, mesh] of monsterMeshes) {
    if (!aliveIds.has(entityId)) {
      mesh.dispose();
      monsterMeshes.delete(entityId);
    }
  }

  for (const view of views) {
    const mesh = monsterMeshes.get(view.entityId) ?? createMonsterMesh(scene, config, view, materialCache);
    mesh.position = canvasPointToVector(
      view.position,
      config,
      config.visual.scene.combat.monsterLiftCanvasUnits * config.visual.scene.worldUnitsPerCanvasUnit,
    );
    monsterMeshes.set(view.entityId, mesh);
  }
}

function createMonsterMesh(
  scene: Scene,
  config: GameConfig,
  view: CombatMonsterView,
  materialCache: Map<string, StandardMaterial>,
): Mesh {
  const radius = config.visual.scene.combat.monsterRadiusCanvasUnits * config.visual.scene.worldUnitsPerCanvasUnit;
  const mesh = CreateSphere(
    `monster-${view.entityId}`,
    {
      diameter: radius * 2,
      segments: 16,
    },
    scene,
  );
  mesh.material = materialForElement(scene, config, view.element, materialCache);
  mesh.metadata = {
    entityId: view.entityId,
    monsterId: view.monsterId,
    element: view.element,
  };

  return mesh;
}

function updateCoreHpBar(simulation: CombatSimulation, hpBar: HpBar): void {
  const snapshot = simulation.snapshot();
  const ratio = clamp01(snapshot.coreHp / snapshot.coreMaxHp);

  hpBar.fill.scaling.x = ratio;
  hpBar.fill.position.x = hpBar.fillBasePosition.x - (hpBar.widthWorldUnits * (1 - ratio)) / 2;
}

function updateShotLines(shotLines: ShotLine[], deltaSeconds: number): void {
  for (let index = shotLines.length - 1; index >= 0; index -= 1) {
    const shot = shotLines[index];
    shot.remainingSeconds -= deltaSeconds;

    if (shot.remainingSeconds > 0) {
      continue;
    }

    shot.mesh.dispose();
    shotLines.splice(index, 1);
  }
}

function findRune(config: GameConfig, runeId: string): GameConfig["runes"]["runes"][number] {
  const rune = config.runes.runes.find((candidate) => candidate.id === runeId);

  if (rune === undefined) {
    throw new Error(`runes.runes unknown rune "${runeId}"`);
  }

  return rune;
}

function materialForRune(
  scene: Scene,
  config: GameConfig,
  runeId: string,
  element: string,
  materialCache: Map<string, StandardMaterial>,
): StandardMaterial {
  const palette = config.visual.palette.elements[element];

  if (palette === undefined) {
    throw new Error(`visual.palette.elements missing "${element}"`);
  }

  return materialForColor(scene, `rune-${runeId}-material`, palette.secondary ?? palette.primary, materialCache);
}

function materialForElement(
  scene: Scene,
  config: GameConfig,
  element: string,
  materialCache: Map<string, StandardMaterial>,
): StandardMaterial {
  const palette = config.visual.palette.elements[element];

  if (palette === undefined) {
    throw new Error(`visual.palette.elements missing "${element}"`);
  }

  return materialForColor(scene, `element-${element}-material`, palette.primary, materialCache);
}

function materialForColor(
  scene: Scene,
  name: string,
  colorValue: string,
  materialCache: Map<string, StandardMaterial>,
): StandardMaterial {
  const cached = materialCache.get(name);

  if (cached !== undefined) {
    return cached;
  }

  const color = Color3.FromHexString(colorValue);
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color;
  material.disableLighting = true;
  materialCache.set(name, material);

  return material;
}

function canvasPointToVector(point: Vec2, config: GameConfig, y: number): Vector3 {
  const mapped = canvasToWorld(point, {
    canvas: config.maps.canvas,
    worldUnitsPerCanvasUnit: config.visual.scene.worldUnitsPerCanvasUnit,
  });

  return new Vector3(mapped.x, y, mapped.z);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
