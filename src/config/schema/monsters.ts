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

export interface MonsterConfig {
  monsters: MonsterTemplate[];
}

export interface MonsterTemplate {
  id: string;
  name: string;
  tags: string[];
  defaultElements: ElementId[];
  hpCoefficientR: number;
  shieldCoefficientR: number;
  attackCoefficientR: number;
  speedUnitsPerSecond: number;
  leakThreat: string;
  recommendedCounter: string;
  onDeath: null | {
    spawnMonsterId: string;
    count: number;
    hpCoefficientR: number;
  };
}

export function validateMonsterConfig(value: unknown): MonsterConfig {
  const obj = assertPlainObject(value, "monsters");
  assertExactKeys(obj, "monsters", ["monsters"]);

  return {
    monsters: assertArray(requireField(obj, "monsters", "monsters"), "monsters.monsters", validateMonsterTemplate),
  };
}

function validateMonsterTemplate(value: unknown, path: string): MonsterTemplate {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "id",
    "name",
    "tags",
    "defaultElements",
    "hpCoefficientR",
    "shieldCoefficientR",
    "attackCoefficientR",
    "speedUnitsPerSecond",
    "leakThreat",
    "recommendedCounter",
    "onDeath",
  ]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    tags: assertArray(obj.tags, `${path}.tags`, assertString),
    defaultElements: assertArray(obj.defaultElements, `${path}.defaultElements`, assertElementId),
    hpCoefficientR: assertNumber(obj.hpCoefficientR, `${path}.hpCoefficientR`),
    shieldCoefficientR: assertNumber(obj.shieldCoefficientR, `${path}.shieldCoefficientR`),
    attackCoefficientR: assertNumber(obj.attackCoefficientR, `${path}.attackCoefficientR`),
    speedUnitsPerSecond: assertPositiveNumber(obj.speedUnitsPerSecond, `${path}.speedUnitsPerSecond`),
    leakThreat: assertString(obj.leakThreat, `${path}.leakThreat`),
    recommendedCounter: assertString(obj.recommendedCounter, `${path}.recommendedCounter`),
    onDeath: obj.onDeath === null ? null : validateOnDeath(obj.onDeath, `${path}.onDeath`),
  };
}

function assertPositiveNumber(value: unknown, path: string): number {
  const number = assertNumber(value, path);
  if (number <= 0) {
    throw new Error(`[config] ${path}: must be > 0`);
  }

  return number;
}

function validateOnDeath(value: unknown, path: string): NonNullable<MonsterTemplate["onDeath"]> {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["spawnMonsterId", "count", "hpCoefficientR"]);

  return {
    spawnMonsterId: assertString(obj.spawnMonsterId, `${path}.spawnMonsterId`),
    count: assertNumber(obj.count, `${path}.count`),
    hpCoefficientR: assertNumber(obj.hpCoefficientR, `${path}.hpCoefficientR`),
  };
}

