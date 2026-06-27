import {
  assertArray,
  assertElementId,
  assertEnum,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
  type ElementId,
} from "./common";

export interface RuneConfig {
  runes: RuneTemplate[];
  upgradeCosts: RuneUpgradeCost[];
}

export interface RuneTemplate {
  id: string;
  name: string;
  element: ElementId;
  role: string;
  lv1Attack: number;
  attackSpeedPerSecond: number;
  range: { kind: "units"; value: number } | { kind: "global" };
  trait: string;
  unlock: { type: "initial" } | { type: "levelFirstClear"; levelId: string };
}

export interface RuneUpgradeCost {
  fromLevel: number;
  toLevel: number;
  runeEssence: number;
  coins: number;
  note: string | null;
}

export function validateRuneConfig(value: unknown): RuneConfig {
  const obj = assertPlainObject(value, "runes");
  assertExactKeys(obj, "runes", ["runes", "upgradeCosts"]);

  return {
    runes: assertArray(requireField(obj, "runes", "runes"), "runes.runes", validateRuneTemplate),
    upgradeCosts: assertArray(requireField(obj, "upgradeCosts", "runes"), "runes.upgradeCosts", validateRuneUpgradeCost),
  };
}

function validateRuneTemplate(value: unknown, path: string): RuneTemplate {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "id",
    "name",
    "element",
    "role",
    "lv1Attack",
    "attackSpeedPerSecond",
    "range",
    "trait",
    "unlock",
  ]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    element: assertElementId(obj.element, `${path}.element`),
    role: assertString(obj.role, `${path}.role`),
    lv1Attack: assertNumber(obj.lv1Attack, `${path}.lv1Attack`),
    attackSpeedPerSecond: assertNumber(obj.attackSpeedPerSecond, `${path}.attackSpeedPerSecond`),
    range: validateRange(obj.range, `${path}.range`),
    trait: assertString(obj.trait, `${path}.trait`),
    unlock: validateUnlock(obj.unlock, `${path}.unlock`),
  };
}

function validateRange(value: unknown, path: string): RuneTemplate["range"] {
  const obj = assertPlainObject(value, path);
  const kind = assertEnum(requireField(obj, "kind", path), `${path}.kind`, ["units", "global"] as const);

  if (kind === "global") {
    assertExactKeys(obj, path, ["kind"]);
    return { kind };
  }

  assertExactKeys(obj, path, ["kind", "value"]);
  return {
    kind,
    value: assertNumber(requireField(obj, "value", path), `${path}.value`),
  };
}

function validateUnlock(value: unknown, path: string): RuneTemplate["unlock"] {
  const obj = assertPlainObject(value, path);
  const type = assertEnum(requireField(obj, "type", path), `${path}.type`, ["initial", "levelFirstClear"] as const);

  if (type === "initial") {
    assertExactKeys(obj, path, ["type"]);
    return { type };
  }

  assertExactKeys(obj, path, ["type", "levelId"]);
  return {
    type,
    levelId: assertString(requireField(obj, "levelId", path), `${path}.levelId`),
  };
}

function validateRuneUpgradeCost(value: unknown, path: string): RuneUpgradeCost {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["fromLevel", "toLevel", "runeEssence", "coins", "note"]);

  return {
    fromLevel: assertNumber(obj.fromLevel, `${path}.fromLevel`),
    toLevel: assertNumber(obj.toLevel, `${path}.toLevel`),
    runeEssence: assertNumber(obj.runeEssence, `${path}.runeEssence`),
    coins: assertNumber(obj.coins, `${path}.coins`),
    note: obj.note === null ? null : assertString(obj.note, `${path}.note`),
  };
}

