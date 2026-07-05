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
  /** 债#4:trait 的机器可读形态(T7 数据化;战斗特效引擎 T7b 消费)。trait 文案仅作展示。 */
  effects: RuneEffect[];
  /** 画符笔迹模板:归一化 0-1 坐标折线,≥3 点(2.7 画符识别的匹配基准)。 */
  drawTemplate: Array<{ x: number; y: number }>;
  /** R6:目标选择策略词条 id(运行时注册表解析;T6 全部 nearest_to_core)。 */
  targetingStrategyId: string;
  unlock: { type: "initial" } | { type: "levelFirstClear"; levelId: string };
}

/** 结构化符特效(判别联合,击穿式校验;新增 kind 必须同步 schema 与本注释)。 */
export type RuneEffect =
  | { kind: "bonus_vs_tag"; tag: string; bonusPct: number }
  | { kind: "aoe"; radiusUnits: number; maxTargets?: number }
  | { kind: "slow"; slowPct: number; durationSeconds: number }
  | { kind: "core_heal"; intervalSeconds: number; pctMaxHp: number }
  | { kind: "pierce"; targetCount: number }
  | { kind: "shield_damage_multiplier"; multiplier: number }
  | { kind: "multihit"; hitCount: number; splitTargets: boolean }
  | { kind: "aura"; slowPct: number; coreDefBonusPct: number }
  | { kind: "delayed_aoe"; delaySeconds: number; radiusUnits: number };

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
    "effects",
    "drawTemplate",
    "targetingStrategyId",
    "unlock",
  ]);

  const targetingStrategyId = assertString(obj.targetingStrategyId, `${path}.targetingStrategyId`);
  if (targetingStrategyId.length === 0) {
    throw new Error(`[config] ${path}.targetingStrategyId: 不得为空字符串(R6 词条 id)`);
  }

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    element: assertElementId(obj.element, `${path}.element`),
    role: assertString(obj.role, `${path}.role`),
    lv1Attack: assertNumber(obj.lv1Attack, `${path}.lv1Attack`),
    attackSpeedPerSecond: assertNumber(obj.attackSpeedPerSecond, `${path}.attackSpeedPerSecond`),
    range: validateRange(obj.range, `${path}.range`),
    trait: assertString(obj.trait, `${path}.trait`),
    effects: assertArray(requireField(obj, "effects", path), `${path}.effects`, validateRuneEffect),
    drawTemplate: validateDrawTemplate(requireField(obj, "drawTemplate", path), `${path}.drawTemplate`),
    targetingStrategyId,
    unlock: validateUnlock(obj.unlock, `${path}.unlock`),
  };
}

function validateRuneEffect(value: unknown, path: string): RuneEffect {
  const obj = assertPlainObject(value, path);
  const kind = assertEnum(requireField(obj, "kind", path), `${path}.kind`, [
    "bonus_vs_tag",
    "aoe",
    "slow",
    "core_heal",
    "pierce",
    "shield_damage_multiplier",
    "multihit",
    "aura",
    "delayed_aoe",
  ] as const);

  switch (kind) {
    case "bonus_vs_tag": {
      assertExactKeys(obj, path, ["kind", "tag", "bonusPct"]);
      const tag = assertString(obj.tag, `${path}.tag`);
      if (tag.length === 0) throw new Error(`[config] ${path}.tag: 不得为空`);
      return { kind, tag, bonusPct: assertPositiveNumber(obj.bonusPct, `${path}.bonusPct`) };
    }
    case "aoe": {
      const hasMax = obj.maxTargets !== undefined;
      assertExactKeys(obj, path, hasMax ? ["kind", "radiusUnits", "maxTargets"] : ["kind", "radiusUnits"]);
      return {
        kind,
        radiusUnits: assertPositiveNumber(obj.radiusUnits, `${path}.radiusUnits`),
        ...(hasMax ? { maxTargets: assertPositiveNumber(obj.maxTargets, `${path}.maxTargets`) } : {}),
      };
    }
    case "slow":
      assertExactKeys(obj, path, ["kind", "slowPct", "durationSeconds"]);
      return {
        kind,
        slowPct: assertPositiveNumber(obj.slowPct, `${path}.slowPct`),
        durationSeconds: assertPositiveNumber(obj.durationSeconds, `${path}.durationSeconds`),
      };
    case "core_heal":
      assertExactKeys(obj, path, ["kind", "intervalSeconds", "pctMaxHp"]);
      return {
        kind,
        intervalSeconds: assertPositiveNumber(obj.intervalSeconds, `${path}.intervalSeconds`),
        pctMaxHp: assertPositiveNumber(obj.pctMaxHp, `${path}.pctMaxHp`),
      };
    case "pierce":
      assertExactKeys(obj, path, ["kind", "targetCount"]);
      return { kind, targetCount: assertPositiveNumber(obj.targetCount, `${path}.targetCount`) };
    case "shield_damage_multiplier":
      assertExactKeys(obj, path, ["kind", "multiplier"]);
      return { kind, multiplier: assertPositiveNumber(obj.multiplier, `${path}.multiplier`) };
    case "multihit":
      assertExactKeys(obj, path, ["kind", "hitCount", "splitTargets"]);
      if (typeof obj.splitTargets !== "boolean") throw new Error(`[config] ${path}.splitTargets: 必须是布尔`);
      return { kind, hitCount: assertPositiveNumber(obj.hitCount, `${path}.hitCount`), splitTargets: obj.splitTargets };
    case "aura":
      assertExactKeys(obj, path, ["kind", "slowPct", "coreDefBonusPct"]);
      return {
        kind,
        slowPct: assertPositiveNumber(obj.slowPct, `${path}.slowPct`),
        coreDefBonusPct: assertPositiveNumber(obj.coreDefBonusPct, `${path}.coreDefBonusPct`),
      };
    case "delayed_aoe":
      assertExactKeys(obj, path, ["kind", "delaySeconds", "radiusUnits"]);
      return {
        kind,
        delaySeconds: assertPositiveNumber(obj.delaySeconds, `${path}.delaySeconds`),
        radiusUnits: assertPositiveNumber(obj.radiusUnits, `${path}.radiusUnits`),
      };
  }
}

function validateDrawTemplate(value: unknown, path: string): RuneTemplate["drawTemplate"] {
  const points = assertArray(value, path, (point, pointPath) => {
    const obj = assertPlainObject(point, pointPath);
    assertExactKeys(obj, pointPath, ["x", "y"]);
    const x = assertNumber(obj.x, `${pointPath}.x`);
    const y = assertNumber(obj.y, `${pointPath}.y`);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      throw new Error(`[config] ${pointPath}: 坐标必须在 [0,1] 归一化域内`);
    }
    return { x, y };
  });

  if (points.length < 3) {
    throw new Error(`[config] ${path}: 笔迹模板至少 3 个点`);
  }

  return points;
}

function assertPositiveNumber(value: unknown, path: string): number {
  const number = assertNumber(value, path);
  if (number <= 0) {
    throw new Error(`[config] ${path}: must be > 0`);
  }

  return number;
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

