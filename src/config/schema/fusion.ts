import {
  assertArray,
  assertElementId,
  assertEnum,
  assertExactKeys,
  assertFusedElementId,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
  type ElementId,
  type FusedElementId,
} from "./common";

export interface FusionConfig {
  recipes: FusionRecipe[];
  unlockSchedule: FusionUnlock[];
}

export interface FusionRecipe {
  id: FusedElementId;
  name: string;
  baseElements: [ElementId, ElementId];
  cost: {
    lingjiPoints: number;
    essences: Record<ElementId, number>;
  };
  effect: Record<string, number | string>;
  advantage: {
    target: string;
    multiplier: number;
  };
  disadvantage: {
    source: string;
    multiplier: number;
  };
  permanentUnlock: string;
}

export interface FusionUnlock {
  stage: string;
  recipeIds: FusedElementId[];
  purpose: string;
}

export function validateFusionConfig(value: unknown): FusionConfig {
  const obj = assertPlainObject(value, "fusion");
  assertExactKeys(obj, "fusion", ["recipes", "unlockSchedule"]);

  return {
    recipes: assertArray(requireField(obj, "recipes", "fusion"), "fusion.recipes", validateRecipe),
    unlockSchedule: assertArray(
      requireField(obj, "unlockSchedule", "fusion"),
      "fusion.unlockSchedule",
      validateUnlock,
    ),
  };
}

function validateRecipe(value: unknown, path: string): FusionRecipe {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "id",
    "name",
    "baseElements",
    "cost",
    "effect",
    "advantage",
    "disadvantage",
    "permanentUnlock",
  ]);

  const baseElements = assertArray(obj.baseElements, `${path}.baseElements`, assertElementId);
  if (baseElements.length !== 2) {
    throw new Error(`[config] ${path}.baseElements: expected exactly 2 elements`);
  }

  return {
    id: assertFusedElementId(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    baseElements: [baseElements[0], baseElements[1]],
    cost: validateCost(obj.cost, `${path}.cost`),
    effect: validateEffect(obj.effect, `${path}.effect`),
    advantage: validateEffectiveness(obj.advantage, `${path}.advantage`, "target"),
    disadvantage: validateEffectiveness(obj.disadvantage, `${path}.disadvantage`, "source"),
    permanentUnlock: assertString(obj.permanentUnlock, `${path}.permanentUnlock`),
  };
}

function validateCost(value: unknown, path: string): FusionRecipe["cost"] {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["lingjiPoints", "essences"]);
  const essencesObj = assertPlainObject(obj.essences, `${path}.essences`);
  const essences = {} as Record<ElementId, number>;

  for (const [key, item] of Object.entries(essencesObj)) {
    const elementId = assertElementId(key, `${path}.essences.${key}.key`);
    essences[elementId] = assertNumber(item, `${path}.essences.${key}`);
  }

  return {
    lingjiPoints: assertNumber(obj.lingjiPoints, `${path}.lingjiPoints`),
    essences,
  };
}

function validateEffect(value: unknown, path: string): Record<string, number | string> {
  const obj = assertPlainObject(value, path);
  const out: Record<string, number | string> = {};

  for (const [key, item] of Object.entries(obj)) {
    out[key] = typeof item === "number" ? assertNumber(item, `${path}.${key}`) : assertString(item, `${path}.${key}`);
  }

  return out;
}

function validateEffectiveness(
  value: unknown,
  path: string,
  key: "target",
): { target: string; multiplier: number };
function validateEffectiveness(
  value: unknown,
  path: string,
  key: "source",
): { source: string; multiplier: number };
function validateEffectiveness(
  value: unknown,
  path: string,
  key: "target" | "source",
): { target: string; multiplier: number } | { source: string; multiplier: number } {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [key, "multiplier"]);

  if (key === "target") {
    return {
      target: assertString(obj.target, `${path}.target`),
      multiplier: assertNumber(obj.multiplier, `${path}.multiplier`),
    };
  }

  return {
    source: assertString(obj.source, `${path}.source`),
    multiplier: assertNumber(obj.multiplier, `${path}.multiplier`),
  };
}

function validateUnlock(value: unknown, path: string): FusionUnlock {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["stage", "recipeIds", "purpose"]);

  return {
    stage: assertString(obj.stage, `${path}.stage`),
    recipeIds: assertArray(obj.recipeIds, `${path}.recipeIds`, assertFusedElementId),
    purpose: assertString(obj.purpose, `${path}.purpose`),
  };
}
