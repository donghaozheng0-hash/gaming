import {
  assertArray,
  assertElementId,
  assertExactKeys,
  fail,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
  type ElementId,
} from "./common";

export interface MapConfig {
  randomization: {
    pathTemplateSelection: string;
    openSlotCountRange: OpenSlotCountRange;
    elementAssignment: string;
    elementPool: ElementId[];
  };
  canvas: MapCanvas;
  candidateSlotTypes: CandidateSlotType[];
  mapPools: MapPool[];
}

export interface OpenSlotCountRange {
  min: number;
  max: number;
}

export interface MapCanvas {
  widthUnits: number;
  heightUnits: number;
}

export interface CandidateSlotType {
  id: string;
  name: string;
  spatialPosition: string;
  rangeUnits: number;
  battleMeaning: string;
  recommendedRuneIds: string[];
}

export interface MapPool {
  id: string;
  name: string;
  pathLengthUnits: number;
  pathTemplates: PathTemplate[];
}

export interface PathTemplate {
  id: string;
  name: string;
  archetype: string;
  routeCount: number;
  routes: Vec2[][];
  candidateSlots: CandidateSlot[];
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface CandidateSlot {
  slotTypeId: string;
  position: Vec2;
}

export function validateMapConfig(value: unknown): MapConfig {
  const obj = assertPlainObject(value, "maps");
  assertExactKeys(obj, "maps", ["randomization", "canvas", "candidateSlotTypes", "mapPools"]);

  const randomization = validateRandomization(requireField(obj, "randomization", "maps"));
  const canvas = validateCanvas(requireField(obj, "canvas", "maps"));
  const candidateSlotTypes = assertArray(
    requireField(obj, "candidateSlotTypes", "maps"),
    "maps.candidateSlotTypes",
    validateCandidateSlotType,
  );
  const candidateSlotTypeIds = new Set(candidateSlotTypes.map((slotType) => slotType.id));

  return {
    randomization,
    canvas,
    candidateSlotTypes,
    mapPools: assertArray(requireField(obj, "mapPools", "maps"), "maps.mapPools", (item, path) =>
      validateMapPool(item, path, {
        canvas,
        candidateSlotTypeIds,
        openSlotCountRange: randomization.openSlotCountRange,
      }),
    ),
  };
}

function validateRandomization(value: unknown): MapConfig["randomization"] {
  const obj = assertPlainObject(value, "maps.randomization");
  assertExactKeys(obj, "maps.randomization", [
    "pathTemplateSelection",
    "openSlotCountRange",
    "elementAssignment",
    "elementPool",
  ]);

  return {
    pathTemplateSelection: assertString(obj.pathTemplateSelection, "maps.randomization.pathTemplateSelection"),
    openSlotCountRange: validateOpenSlotCountRange(obj.openSlotCountRange),
    elementAssignment: assertString(obj.elementAssignment, "maps.randomization.elementAssignment"),
    elementPool: assertArray(obj.elementPool, "maps.randomization.elementPool", assertElementId),
  };
}

function validateOpenSlotCountRange(value: unknown): OpenSlotCountRange {
  const path = "maps.randomization.openSlotCountRange";
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["min", "max"]);

  const min = assertPositiveInteger(obj.min, `${path}.min`);
  const max = assertPositiveInteger(obj.max, `${path}.max`);
  if (min > max) {
    fail(path, "min must be less than or equal to max");
  }

  return { min, max };
}

function validateCanvas(value: unknown): MapCanvas {
  const obj = assertPlainObject(value, "maps.canvas");
  assertExactKeys(obj, "maps.canvas", ["widthUnits", "heightUnits"]);

  return {
    widthUnits: assertPositiveNumber(obj.widthUnits, "maps.canvas.widthUnits"),
    heightUnits: assertPositiveNumber(obj.heightUnits, "maps.canvas.heightUnits"),
  };
}

function validateCandidateSlotType(value: unknown, path: string): CandidateSlotType {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "id",
    "name",
    "spatialPosition",
    "rangeUnits",
    "battleMeaning",
    "recommendedRuneIds",
  ]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    spatialPosition: assertString(obj.spatialPosition, `${path}.spatialPosition`),
    rangeUnits: assertNumber(obj.rangeUnits, `${path}.rangeUnits`),
    battleMeaning: assertString(obj.battleMeaning, `${path}.battleMeaning`),
    recommendedRuneIds: assertArray(obj.recommendedRuneIds, `${path}.recommendedRuneIds`, assertString),
  };
}

interface MapValidationContext {
  canvas: MapCanvas;
  candidateSlotTypeIds: ReadonlySet<string>;
  openSlotCountRange: OpenSlotCountRange;
}

function validateMapPool(value: unknown, path: string, context: MapValidationContext): MapPool {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["id", "name", "pathLengthUnits", "pathTemplates"]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    pathLengthUnits: assertNumber(obj.pathLengthUnits, `${path}.pathLengthUnits`),
    pathTemplates: assertArray(obj.pathTemplates, `${path}.pathTemplates`, (item, itemPath) =>
      validatePathTemplate(item, itemPath, context),
    ),
  };
}

function validatePathTemplate(value: unknown, path: string, context: MapValidationContext): PathTemplate {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["id", "name", "archetype", "routeCount", "routes", "candidateSlots"]);

  const routeCount = assertPositiveInteger(obj.routeCount, `${path}.routeCount`);
  const routes = assertArray(obj.routes, `${path}.routes`, (route, routePath) =>
    validateRoute(route, routePath, context.canvas),
  );
  if (routes.length !== routeCount) {
    fail(`${path}.routes`, "length must equal routeCount");
  }

  const candidateSlots = assertArray(obj.candidateSlots, `${path}.candidateSlots`, (slot, slotPath) =>
    validateCandidateSlot(slot, slotPath, context),
  );
  if (candidateSlots.length < context.openSlotCountRange.max + 2) {
    fail(`${path}.candidateSlots`, "must contain at least openSlotCountRange.max + 2 slots");
  }

  validateUniqueCandidateSlots(candidateSlots, `${path}.candidateSlots`);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    archetype: assertString(obj.archetype, `${path}.archetype`),
    routeCount,
    routes,
    candidateSlots,
  };
}

function validateRoute(value: unknown, path: string, canvas: MapCanvas): Vec2[] {
  const route = assertArray(value, path, (point, pointPath) => validateVec2(point, pointPath, canvas));
  if (route.length < 2) {
    fail(path, "must contain at least two points");
  }

  return route;
}

function validateCandidateSlot(
  value: unknown,
  path: string,
  context: MapValidationContext,
): CandidateSlot {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["slotTypeId", "position"]);

  const slotTypeId = assertString(obj.slotTypeId, `${path}.slotTypeId`);
  if (!context.candidateSlotTypeIds.has(slotTypeId)) {
    fail(`${path}.slotTypeId`, `unknown candidate slot type "${slotTypeId}"`);
  }

  return {
    slotTypeId,
    position: validateVec2(obj.position, `${path}.position`, context.canvas),
  };
}

function validateVec2(value: unknown, path: string, canvas: MapCanvas): Vec2 {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["x", "y"]);

  const point = {
    x: assertNumber(obj.x, `${path}.x`),
    y: assertNumber(obj.y, `${path}.y`),
  };

  if (point.x < 0 || point.x > canvas.widthUnits) {
    fail(`${path}.x`, "must be inside canvas width");
  }
  if (point.y < 0 || point.y > canvas.heightUnits) {
    fail(`${path}.y`, "must be inside canvas height");
  }

  return point;
}

function validateUniqueCandidateSlots(slots: CandidateSlot[], path: string): void {
  const slotTypeIds = new Set<string>();
  const positions = new Set<string>();

  slots.forEach((slot, index) => {
    if (slotTypeIds.has(slot.slotTypeId)) {
      fail(`${path}[${index}].slotTypeId`, "duplicate slotTypeId");
    }
    slotTypeIds.add(slot.slotTypeId);

    const positionKey = `${slot.position.x}:${slot.position.y}`;
    if (positions.has(positionKey)) {
      fail(`${path}[${index}].position`, "duplicate position");
    }
    positions.add(positionKey);
  });
}

function assertPositiveInteger(value: unknown, path: string): number {
  const number = assertNumber(value, path);
  if (!Number.isInteger(number) || number <= 0) {
    fail(path, "expected positive integer");
  }

  return number;
}

function assertPositiveNumber(value: unknown, path: string): number {
  const number = assertNumber(value, path);
  if (number <= 0) {
    fail(path, "expected positive number");
  }

  return number;
}
