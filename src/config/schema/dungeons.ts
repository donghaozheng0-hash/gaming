import {
  assertArray,
  assertBoolean,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
} from "./common";

export interface DungeonsConfig {
  monsterPowerMultiplierRange: { min: number; max: number };
  defaultMonsterPowerMultiplier: number;
  fatigueApplies: boolean;
  dungeons: DungeonEntry[];
}

export interface DungeonEntry {
  id: string;
  name: string;
  depthAnchor: number;
  monsterPowerMultiplier: number;
  waveTemplateId: string;
  materialDrops: MaterialDrop[];
}

export interface MaterialDrop {
  materialId: string;
  amount: number;
}

export function validateDungeonsConfig(value: unknown): DungeonsConfig {
  const obj = assertPlainObject(value, "dungeons");
  assertExactKeys(obj, "dungeons", [
    "monsterPowerMultiplierRange",
    "defaultMonsterPowerMultiplier",
    "fatigueApplies",
    "dungeons",
  ]);

  const monsterPowerMultiplierRange = validateMinMax(
    requireField(obj, "monsterPowerMultiplierRange", "dungeons"),
    "dungeons.monsterPowerMultiplierRange",
  );
  const defaultMonsterPowerMultiplier = assertNumber(
    requireField(obj, "defaultMonsterPowerMultiplier", "dungeons"),
    "dungeons.defaultMonsterPowerMultiplier",
  );

  if (monsterPowerMultiplierRange.min > monsterPowerMultiplierRange.max) {
    throw new Error("[config] dungeons.monsterPowerMultiplierRange: min must be <= max");
  }
  if (
    defaultMonsterPowerMultiplier < monsterPowerMultiplierRange.min ||
    defaultMonsterPowerMultiplier > monsterPowerMultiplierRange.max
  ) {
    throw new Error("[config] dungeons.defaultMonsterPowerMultiplier: must be within monsterPowerMultiplierRange");
  }

  return {
    monsterPowerMultiplierRange,
    defaultMonsterPowerMultiplier,
    fatigueApplies: assertBoolean(requireField(obj, "fatigueApplies", "dungeons"), "dungeons.fatigueApplies"),
    dungeons: assertArray(requireField(obj, "dungeons", "dungeons"), "dungeons.dungeons", validateDungeonEntry),
  };
}

function validateMinMax(value: unknown, path: string): { min: number; max: number } {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["min", "max"]);

  return {
    min: assertNumber(obj.min, `${path}.min`),
    max: assertNumber(obj.max, `${path}.max`),
  };
}

function validateDungeonEntry(value: unknown, path: string): DungeonEntry {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "id",
    "name",
    "depthAnchor",
    "monsterPowerMultiplier",
    "waveTemplateId",
    "materialDrops",
  ]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    depthAnchor: assertNumber(obj.depthAnchor, `${path}.depthAnchor`),
    monsterPowerMultiplier: assertNumber(obj.monsterPowerMultiplier, `${path}.monsterPowerMultiplier`),
    waveTemplateId: assertString(obj.waveTemplateId, `${path}.waveTemplateId`),
    materialDrops: assertArray(obj.materialDrops, `${path}.materialDrops`, validateMaterialDrop),
  };
}

function validateMaterialDrop(value: unknown, path: string): MaterialDrop {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["materialId", "amount"]);

  return {
    materialId: assertString(obj.materialId, `${path}.materialId`),
    amount: assertNumber(obj.amount, `${path}.amount`),
  };
}
