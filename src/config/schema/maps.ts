import {
  assertArray,
  assertElementId,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
  type ElementId,
} from "./common";

export interface MapConfig {
  randomization: {
    pathTemplateSelection: string;
    openSlotCount: number;
    elementAssignment: string;
    elementPool: ElementId[];
  };
  candidateSlotTypes: CandidateSlotType[];
  mapPools: MapPool[];
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
  candidateSlotTypeIds: string[];
}

export function validateMapConfig(value: unknown): MapConfig {
  const obj = assertPlainObject(value, "maps");
  assertExactKeys(obj, "maps", ["randomization", "candidateSlotTypes", "mapPools"]);

  return {
    randomization: validateRandomization(requireField(obj, "randomization", "maps")),
    candidateSlotTypes: assertArray(
      requireField(obj, "candidateSlotTypes", "maps"),
      "maps.candidateSlotTypes",
      validateCandidateSlotType,
    ),
    mapPools: assertArray(requireField(obj, "mapPools", "maps"), "maps.mapPools", validateMapPool),
  };
}

function validateRandomization(value: unknown): MapConfig["randomization"] {
  const obj = assertPlainObject(value, "maps.randomization");
  assertExactKeys(obj, "maps.randomization", [
    "pathTemplateSelection",
    "openSlotCount",
    "elementAssignment",
    "elementPool",
  ]);

  return {
    pathTemplateSelection: assertString(obj.pathTemplateSelection, "maps.randomization.pathTemplateSelection"),
    openSlotCount: assertNumber(obj.openSlotCount, "maps.randomization.openSlotCount"),
    elementAssignment: assertString(obj.elementAssignment, "maps.randomization.elementAssignment"),
    elementPool: assertArray(obj.elementPool, "maps.randomization.elementPool", assertElementId),
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

function validateMapPool(value: unknown, path: string): MapPool {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["id", "name", "pathLengthUnits", "pathTemplates"]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    pathLengthUnits: assertNumber(obj.pathLengthUnits, `${path}.pathLengthUnits`),
    pathTemplates: assertArray(obj.pathTemplates, `${path}.pathTemplates`, validatePathTemplate),
  };
}

function validatePathTemplate(value: unknown, path: string): PathTemplate {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["id", "name", "archetype", "routeCount", "candidateSlotTypeIds"]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    archetype: assertString(obj.archetype, `${path}.archetype`),
    routeCount: assertNumber(obj.routeCount, `${path}.routeCount`),
    candidateSlotTypeIds: assertArray(obj.candidateSlotTypeIds, `${path}.candidateSlotTypeIds`, assertString),
  };
}

