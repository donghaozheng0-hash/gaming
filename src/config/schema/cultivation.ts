import {
  assertArray,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
} from "./common";

export interface CultivationConfig {
  realmOrder: RealmDefinition[];
  baseStatsByProgress: BaseStatsProgress[];
  attributePointExchange: {
    atkPerPoint: number;
    hpPerPoint: number;
    defPerPoint: number;
  };
  breakthroughBaseline: {
    nextRealmStatMultiplier: number;
  };
  elementCultivationLevels: ElementCultivationLevel[];
}

export interface RealmDefinition {
  id: string;
  name: string;
  section: string;
  layers: number | "infinite";
}

export interface BaseStatsProgress {
  id: string;
  realmId: string;
  layer: number | null;
  label: string;
  baseAtk: number;
  baseHp: number;
  baseDef: number;
  basePower: number;
  expectedTotalPower: number;
  levelId: string;
}

export interface ElementCultivationLevel {
  level: number;
  cumulativeAttack: number;
  auraCost: number;
  realmLimit: string;
  isPerfection: boolean;
}

export function validateCultivationConfig(value: unknown): CultivationConfig {
  const obj = assertPlainObject(value, "cultivation");
  assertExactKeys(obj, "cultivation", [
    "realmOrder",
    "baseStatsByProgress",
    "attributePointExchange",
    "breakthroughBaseline",
    "elementCultivationLevels",
  ]);

  return {
    realmOrder: assertArray(requireField(obj, "realmOrder", "cultivation"), "cultivation.realmOrder", validateRealm),
    baseStatsByProgress: assertArray(
      requireField(obj, "baseStatsByProgress", "cultivation"),
      "cultivation.baseStatsByProgress",
      validateBaseStats,
    ),
    attributePointExchange: validateAttributePointExchange(
      requireField(obj, "attributePointExchange", "cultivation"),
    ),
    breakthroughBaseline: validateBreakthroughBaseline(requireField(obj, "breakthroughBaseline", "cultivation")),
    elementCultivationLevels: assertArray(
      requireField(obj, "elementCultivationLevels", "cultivation"),
      "cultivation.elementCultivationLevels",
      validateElementCultivationLevel,
    ),
  };
}

function validateRealm(value: unknown, path: string): RealmDefinition {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["id", "name", "section", "layers"]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    section: assertString(obj.section, `${path}.section`),
    layers: obj.layers === "infinite" ? "infinite" : assertNumber(obj.layers, `${path}.layers`),
  };
}

function validateBaseStats(value: unknown, path: string): BaseStatsProgress {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "id",
    "realmId",
    "layer",
    "label",
    "baseAtk",
    "baseHp",
    "baseDef",
    "basePower",
    "expectedTotalPower",
    "levelId",
  ]);

  return {
    id: assertString(obj.id, `${path}.id`),
    realmId: assertString(obj.realmId, `${path}.realmId`),
    layer: obj.layer === null ? null : assertNumber(obj.layer, `${path}.layer`),
    label: assertString(obj.label, `${path}.label`),
    baseAtk: assertNumber(obj.baseAtk, `${path}.baseAtk`),
    baseHp: assertNumber(obj.baseHp, `${path}.baseHp`),
    baseDef: assertNumber(obj.baseDef, `${path}.baseDef`),
    basePower: assertNumber(obj.basePower, `${path}.basePower`),
    expectedTotalPower: assertNumber(obj.expectedTotalPower, `${path}.expectedTotalPower`),
    levelId: assertString(obj.levelId, `${path}.levelId`),
  };
}

function validateAttributePointExchange(value: unknown): CultivationConfig["attributePointExchange"] {
  const obj = assertPlainObject(value, "cultivation.attributePointExchange");
  assertExactKeys(obj, "cultivation.attributePointExchange", ["atkPerPoint", "hpPerPoint", "defPerPoint"]);

  return {
    atkPerPoint: assertNumber(obj.atkPerPoint, "cultivation.attributePointExchange.atkPerPoint"),
    hpPerPoint: assertNumber(obj.hpPerPoint, "cultivation.attributePointExchange.hpPerPoint"),
    defPerPoint: assertNumber(obj.defPerPoint, "cultivation.attributePointExchange.defPerPoint"),
  };
}

function validateBreakthroughBaseline(value: unknown): CultivationConfig["breakthroughBaseline"] {
  const obj = assertPlainObject(value, "cultivation.breakthroughBaseline");
  assertExactKeys(obj, "cultivation.breakthroughBaseline", ["nextRealmStatMultiplier"]);

  return {
    nextRealmStatMultiplier: assertNumber(
      obj.nextRealmStatMultiplier,
      "cultivation.breakthroughBaseline.nextRealmStatMultiplier",
    ),
  };
}

function validateElementCultivationLevel(value: unknown, path: string): ElementCultivationLevel {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["level", "cumulativeAttack", "auraCost", "realmLimit", "isPerfection"]);

  return {
    level: assertNumber(obj.level, `${path}.level`),
    cumulativeAttack: assertNumber(obj.cumulativeAttack, `${path}.cumulativeAttack`),
    auraCost: assertNumber(obj.auraCost, `${path}.auraCost`),
    realmLimit: assertString(obj.realmLimit, `${path}.realmLimit`),
    isPerfection: typeof obj.isPerfection === "boolean" ? obj.isPerfection : (() => {
      throw new Error(`[config] ${path}.isPerfection: expected boolean`);
    })(),
  };
}

