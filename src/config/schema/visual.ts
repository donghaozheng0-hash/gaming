import {
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertRecord,
  assertString,
  fail,
  requireField,
} from "./common";

export interface VisualConfig {
  palette: {
    elements: Record<string, PaletteEntry>;
    fusedElements: Record<string, PaletteEntry>;
    surface: Record<string, string>;
    ink: Record<string, string>;
  };
  scene: VisualSceneConfig;
  effectKeys: Record<string, string>;
  uiTokens: Record<string, string>;
}

export interface VisualSceneConfig {
  worldUnitsPerCanvasUnit: number;
  camera: {
    alphaDeg: number;
    betaDeg: number;
    radiusWorldUnits: number;
  };
  routeWidthCanvasUnits: number;
  slotRadiusCanvasUnits: number;
  coreRadiusCanvasUnits: number;
  paperMarginCanvasUnits: number;
  combat: {
    monsterRadiusCanvasUnits: number;
    monsterLiftCanvasUnits: number;
    runeMarkerRadiusCanvasUnits: number;
    runeMarkerHeightCanvasUnits: number;
    fireLineWidthCanvasUnits: number;
    fireLineLiftCanvasUnits: number;
    fireLineLifetimeSeconds: number;
    coreHpBarWidthCanvasUnits: number;
    coreHpBarHeightCanvasUnits: number;
    coreHpBarLiftCanvasUnits: number;
    coreHpBarThicknessCanvasUnits: number;
  };
}

export interface PaletteEntry {
  name: string;
  primary: string;
  secondary: string | null;
  usage: string;
}

export function validateVisualConfig(value: unknown): VisualConfig {
  const obj = assertPlainObject(value, "visual");
  assertExactKeys(obj, "visual", ["palette", "scene", "effectKeys", "uiTokens"]);

  return {
    palette: validatePalette(requireField(obj, "palette", "visual")),
    scene: validateSceneConfig(requireField(obj, "scene", "visual")),
    effectKeys: assertRecord(requireField(obj, "effectKeys", "visual"), "visual.effectKeys", (item, path) =>
      assertString(item, path),
    ),
    uiTokens: assertRecord(requireField(obj, "uiTokens", "visual"), "visual.uiTokens", (item, path) =>
      assertString(item, path),
    ),
  };
}

function validateSceneConfig(value: unknown): VisualSceneConfig {
  const obj = assertPlainObject(value, "visual.scene");
  assertExactKeys(obj, "visual.scene", [
    "worldUnitsPerCanvasUnit",
    "camera",
    "routeWidthCanvasUnits",
    "slotRadiusCanvasUnits",
    "coreRadiusCanvasUnits",
    "paperMarginCanvasUnits",
    "combat",
  ]);

  return {
    worldUnitsPerCanvasUnit: assertPositiveNumber(
      obj.worldUnitsPerCanvasUnit,
      "visual.scene.worldUnitsPerCanvasUnit",
    ),
    camera: validateSceneCamera(requireField(obj, "camera", "visual.scene")),
    routeWidthCanvasUnits: assertPositiveNumber(obj.routeWidthCanvasUnits, "visual.scene.routeWidthCanvasUnits"),
    slotRadiusCanvasUnits: assertPositiveNumber(obj.slotRadiusCanvasUnits, "visual.scene.slotRadiusCanvasUnits"),
    coreRadiusCanvasUnits: assertPositiveNumber(obj.coreRadiusCanvasUnits, "visual.scene.coreRadiusCanvasUnits"),
    paperMarginCanvasUnits: assertPositiveNumber(obj.paperMarginCanvasUnits, "visual.scene.paperMarginCanvasUnits"),
    combat: validateCombatSceneConfig(requireField(obj, "combat", "visual.scene")),
  };
}

function validateCombatSceneConfig(value: unknown): VisualSceneConfig["combat"] {
  const obj = assertPlainObject(value, "visual.scene.combat");
  assertExactKeys(obj, "visual.scene.combat", [
    "monsterRadiusCanvasUnits",
    "monsterLiftCanvasUnits",
    "runeMarkerRadiusCanvasUnits",
    "runeMarkerHeightCanvasUnits",
    "fireLineWidthCanvasUnits",
    "fireLineLiftCanvasUnits",
    "fireLineLifetimeSeconds",
    "coreHpBarWidthCanvasUnits",
    "coreHpBarHeightCanvasUnits",
    "coreHpBarLiftCanvasUnits",
    "coreHpBarThicknessCanvasUnits",
  ]);

  return {
    monsterRadiusCanvasUnits: assertPositiveNumber(
      obj.monsterRadiusCanvasUnits,
      "visual.scene.combat.monsterRadiusCanvasUnits",
    ),
    monsterLiftCanvasUnits: assertPositiveNumber(
      obj.monsterLiftCanvasUnits,
      "visual.scene.combat.monsterLiftCanvasUnits",
    ),
    runeMarkerRadiusCanvasUnits: assertPositiveNumber(
      obj.runeMarkerRadiusCanvasUnits,
      "visual.scene.combat.runeMarkerRadiusCanvasUnits",
    ),
    runeMarkerHeightCanvasUnits: assertPositiveNumber(
      obj.runeMarkerHeightCanvasUnits,
      "visual.scene.combat.runeMarkerHeightCanvasUnits",
    ),
    fireLineWidthCanvasUnits: assertPositiveNumber(
      obj.fireLineWidthCanvasUnits,
      "visual.scene.combat.fireLineWidthCanvasUnits",
    ),
    fireLineLiftCanvasUnits: assertPositiveNumber(
      obj.fireLineLiftCanvasUnits,
      "visual.scene.combat.fireLineLiftCanvasUnits",
    ),
    fireLineLifetimeSeconds: assertPositiveNumber(
      obj.fireLineLifetimeSeconds,
      "visual.scene.combat.fireLineLifetimeSeconds",
    ),
    coreHpBarWidthCanvasUnits: assertPositiveNumber(
      obj.coreHpBarWidthCanvasUnits,
      "visual.scene.combat.coreHpBarWidthCanvasUnits",
    ),
    coreHpBarHeightCanvasUnits: assertPositiveNumber(
      obj.coreHpBarHeightCanvasUnits,
      "visual.scene.combat.coreHpBarHeightCanvasUnits",
    ),
    coreHpBarLiftCanvasUnits: assertPositiveNumber(
      obj.coreHpBarLiftCanvasUnits,
      "visual.scene.combat.coreHpBarLiftCanvasUnits",
    ),
    coreHpBarThicknessCanvasUnits: assertPositiveNumber(
      obj.coreHpBarThicknessCanvasUnits,
      "visual.scene.combat.coreHpBarThicknessCanvasUnits",
    ),
  };
}

function validateSceneCamera(value: unknown): VisualSceneConfig["camera"] {
  const obj = assertPlainObject(value, "visual.scene.camera");
  assertExactKeys(obj, "visual.scene.camera", ["alphaDeg", "betaDeg", "radiusWorldUnits"]);

  return {
    alphaDeg: assertPositiveNumber(obj.alphaDeg, "visual.scene.camera.alphaDeg"),
    betaDeg: assertPositiveNumber(obj.betaDeg, "visual.scene.camera.betaDeg"),
    radiusWorldUnits: assertPositiveNumber(obj.radiusWorldUnits, "visual.scene.camera.radiusWorldUnits"),
  };
}

function validatePalette(value: unknown): VisualConfig["palette"] {
  const obj = assertPlainObject(value, "visual.palette");
  assertExactKeys(obj, "visual.palette", ["elements", "fusedElements", "surface", "ink"]);

  return {
    elements: assertRecord(obj.elements, "visual.palette.elements", validatePaletteEntry),
    fusedElements: assertRecord(obj.fusedElements, "visual.palette.fusedElements", validatePaletteEntry),
    surface: assertRecord(obj.surface, "visual.palette.surface", (item, path) => assertString(item, path)),
    ink: assertRecord(obj.ink, "visual.palette.ink", (item, path) => assertString(item, path)),
  };
}

function validatePaletteEntry(value: unknown, path: string): PaletteEntry {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["name", "primary", "secondary", "usage"]);

  return {
    name: assertString(obj.name, `${path}.name`),
    primary: assertString(obj.primary, `${path}.primary`),
    secondary: obj.secondary === null ? null : assertString(obj.secondary, `${path}.secondary`),
    usage: assertString(obj.usage, `${path}.usage`),
  };
}

function assertPositiveNumber(value: unknown, path: string): number {
  const number = assertNumber(value, path);
  if (number <= 0) {
    fail(path, "expected positive number");
  }

  return number;
}
