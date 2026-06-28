import {
  assertArray,
  assertElementId,
  assertElementRecord,
  assertEnum,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertRecord,
  assertString,
  elementIds,
  type ElementId,
  requireField,
} from "./common";

export interface BalanceConfig {
  elements: {
    ids: ElementId[];
    xiangshengCycle: Record<ElementId, ElementId>;
    kezhiCycle: Record<ElementId, ElementId>;
  };
  powerFormula: {
    atkWeight: number;
    hpWeight: number;
    defWeight: number;
  };
  damageFormula: {
    qualityMultipliers: Record<string, number>;
    xiangshengMultipliers: {
      generated: number;
      neutral: number;
      mismatched: number;
    };
    elementalMultipliers: {
      advantage: number;
      neutral: number;
      disadvantage: number;
      perfectionPve: number;
      perfectionPvp: number;
      perfectionPvpDisadvantage: number;
    };
    drawBonus: {
      base: number;
      partialMinScore: number;
      fullScore: number;
      perfectScore: number;
      fullBonus: number;
    };
  };
  defense: {
    armorModel: "relative" | "fixedK" | "cappedPct";
    relK: number;
    fixedK: number;
    capPct: number;
  };
  battle: {
    simulationFps: number;
    pathLengthUnits: number;
    preparationSeconds: number;
    normalLevelDurationSeconds: { min: number; max: number };
    bossLevelDurationSeconds: { min: number; max: number };
    wavesPerLevel: number;
    defaultWaveIntervalSeconds: number;
    lingjiGrantWaves: number[];
    maxLingjiPointsPerRun: number;
    elementEssenceDrop: {
      guaranteedWaves: number[];
      guaranteedAmount: number;
      extraDropChance: number;
      extraDropAmount: number;
    };
    runeUpgradeAttackGrowthPerLevel: number;
    drawRuneCooldownSeconds: {
      global: number;
      perRune: number;
    };
    targetPriority: string[];
    starSweepCondition: {
      minCoreHpRatio: number;
      maxRevivesUsed: number;
    };
    reviveRules: Record<string, { maxRevives: number; methods: string[]; reviveHpRatio: number | null }>;
  };
  progressionCurves: {
    chapterPowerFormula: {
      chapterOneBasePower: number;
      perLevelMultiplier: number;
      chapterMultiplier: number;
      bossMultiplier: number;
    };
    endlessTower: {
      basePower: number;
      exponentBase: number;
    };
    skillGapCompensation: {
      minPowerGapRatio: number;
      maxPowerGapRatio: number;
      lowPowerGuideRatio: number;
    };
  };
}

export function validateBalanceConfig(value: unknown): BalanceConfig {
  const obj = assertPlainObject(value, "balance");
  assertExactKeys(obj, "balance", [
    "elements",
    "powerFormula",
    "damageFormula",
    "defense",
    "battle",
    "progressionCurves",
  ]);

  return {
    elements: validateElements(requireField(obj, "elements", "balance")),
    powerFormula: validatePowerFormula(requireField(obj, "powerFormula", "balance")),
    damageFormula: validateDamageFormula(requireField(obj, "damageFormula", "balance")),
    defense: validateDefense(requireField(obj, "defense", "balance")),
    battle: validateBattle(requireField(obj, "battle", "balance")),
    progressionCurves: validateProgressionCurves(requireField(obj, "progressionCurves", "balance")),
  };
}

function validateElements(value: unknown): BalanceConfig["elements"] {
  const obj = assertPlainObject(value, "balance.elements");
  assertExactKeys(obj, "balance.elements", ["ids", "xiangshengCycle", "kezhiCycle"]);

  const ids = assertArray(requireField(obj, "ids", "balance.elements"), "balance.elements.ids", assertElementId);
  const xiangshengCycle = assertElementRecord(
    requireField(obj, "xiangshengCycle", "balance.elements"),
    "balance.elements.xiangshengCycle",
    (item, path) => assertElementId(item, path),
  );
  const kezhiCycle = assertElementRecord(
    requireField(obj, "kezhiCycle", "balance.elements"),
    "balance.elements.kezhiCycle",
    (item, path) => assertElementId(item, path),
  );

  if (ids.length !== elementIds.length || elementIds.some((id) => !ids.includes(id))) {
    throw new Error("[config] balance.elements.ids: must contain every base element exactly once");
  }

  return { ids, xiangshengCycle, kezhiCycle };
}

function validatePowerFormula(value: unknown): BalanceConfig["powerFormula"] {
  const obj = assertPlainObject(value, "balance.powerFormula");
  assertExactKeys(obj, "balance.powerFormula", ["atkWeight", "hpWeight", "defWeight"]);

  return {
    atkWeight: assertNumber(requireField(obj, "atkWeight", "balance.powerFormula"), "balance.powerFormula.atkWeight"),
    hpWeight: assertNumber(requireField(obj, "hpWeight", "balance.powerFormula"), "balance.powerFormula.hpWeight"),
    defWeight: assertNumber(requireField(obj, "defWeight", "balance.powerFormula"), "balance.powerFormula.defWeight"),
  };
}

function validateDamageFormula(value: unknown): BalanceConfig["damageFormula"] {
  const obj = assertPlainObject(value, "balance.damageFormula");
  assertExactKeys(obj, "balance.damageFormula", [
    "qualityMultipliers",
    "xiangshengMultipliers",
    "elementalMultipliers",
    "drawBonus",
  ]);

  const qualityMultipliers = assertRecord(
    requireField(obj, "qualityMultipliers", "balance.damageFormula"),
    "balance.damageFormula.qualityMultipliers",
    (item, path) => assertNumber(item, path),
  );
  const xiangsheng = assertPlainObject(
    requireField(obj, "xiangshengMultipliers", "balance.damageFormula"),
    "balance.damageFormula.xiangshengMultipliers",
  );
  assertExactKeys(xiangsheng, "balance.damageFormula.xiangshengMultipliers", [
    "generated",
    "neutral",
    "mismatched",
  ]);
  const elemental = assertPlainObject(
    requireField(obj, "elementalMultipliers", "balance.damageFormula"),
    "balance.damageFormula.elementalMultipliers",
  );
  assertExactKeys(elemental, "balance.damageFormula.elementalMultipliers", [
    "advantage",
    "neutral",
    "disadvantage",
    "perfectionPve",
    "perfectionPvp",
    "perfectionPvpDisadvantage",
  ]);
  const drawBonus = assertPlainObject(
    requireField(obj, "drawBonus", "balance.damageFormula"),
    "balance.damageFormula.drawBonus",
  );
  assertExactKeys(drawBonus, "balance.damageFormula.drawBonus", [
    "base",
    "partialMinScore",
    "fullScore",
    "perfectScore",
    "fullBonus",
  ]);

  return {
    qualityMultipliers,
    xiangshengMultipliers: {
      generated: assertNumber(xiangsheng.generated, "balance.damageFormula.xiangshengMultipliers.generated"),
      neutral: assertNumber(xiangsheng.neutral, "balance.damageFormula.xiangshengMultipliers.neutral"),
      mismatched: assertNumber(xiangsheng.mismatched, "balance.damageFormula.xiangshengMultipliers.mismatched"),
    },
    elementalMultipliers: {
      advantage: assertNumber(elemental.advantage, "balance.damageFormula.elementalMultipliers.advantage"),
      neutral: assertNumber(elemental.neutral, "balance.damageFormula.elementalMultipliers.neutral"),
      disadvantage: assertNumber(elemental.disadvantage, "balance.damageFormula.elementalMultipliers.disadvantage"),
      perfectionPve: assertNumber(elemental.perfectionPve, "balance.damageFormula.elementalMultipliers.perfectionPve"),
      perfectionPvp: assertNumber(elemental.perfectionPvp, "balance.damageFormula.elementalMultipliers.perfectionPvp"),
      perfectionPvpDisadvantage: assertNumber(
        elemental.perfectionPvpDisadvantage,
        "balance.damageFormula.elementalMultipliers.perfectionPvpDisadvantage",
      ),
    },
    drawBonus: {
      base: assertNumber(drawBonus.base, "balance.damageFormula.drawBonus.base"),
      partialMinScore: assertNumber(drawBonus.partialMinScore, "balance.damageFormula.drawBonus.partialMinScore"),
      fullScore: assertNumber(drawBonus.fullScore, "balance.damageFormula.drawBonus.fullScore"),
      perfectScore: assertNumber(drawBonus.perfectScore, "balance.damageFormula.drawBonus.perfectScore"),
      fullBonus: assertNumber(drawBonus.fullBonus, "balance.damageFormula.drawBonus.fullBonus"),
    },
  };
}

function validateDefense(value: unknown): BalanceConfig["defense"] {
  const obj = assertPlainObject(value, "balance.defense");
  assertExactKeys(obj, "balance.defense", ["armorModel", "relK", "fixedK", "capPct"]);

  return {
    armorModel: assertEnum(
      requireField(obj, "armorModel", "balance.defense"),
      "balance.defense.armorModel",
      ["relative", "fixedK", "cappedPct"] as const,
    ),
    relK: assertNumber(requireField(obj, "relK", "balance.defense"), "balance.defense.relK"),
    fixedK: assertNumber(requireField(obj, "fixedK", "balance.defense"), "balance.defense.fixedK"),
    capPct: assertNumber(requireField(obj, "capPct", "balance.defense"), "balance.defense.capPct"),
  };
}

function validateBattle(value: unknown): BalanceConfig["battle"] {
  const obj = assertPlainObject(value, "balance.battle");
  assertExactKeys(obj, "balance.battle", [
    "simulationFps",
    "pathLengthUnits",
    "preparationSeconds",
    "normalLevelDurationSeconds",
    "bossLevelDurationSeconds",
    "wavesPerLevel",
    "defaultWaveIntervalSeconds",
    "lingjiGrantWaves",
    "maxLingjiPointsPerRun",
    "elementEssenceDrop",
    "runeUpgradeAttackGrowthPerLevel",
    "drawRuneCooldownSeconds",
    "targetPriority",
    "starSweepCondition",
    "reviveRules",
  ]);

  return {
    simulationFps: assertNumber(obj.simulationFps, "balance.battle.simulationFps"),
    pathLengthUnits: assertNumber(obj.pathLengthUnits, "balance.battle.pathLengthUnits"),
    preparationSeconds: assertNumber(obj.preparationSeconds, "balance.battle.preparationSeconds"),
    normalLevelDurationSeconds: validateMinMax(obj.normalLevelDurationSeconds, "balance.battle.normalLevelDurationSeconds"),
    bossLevelDurationSeconds: validateMinMax(obj.bossLevelDurationSeconds, "balance.battle.bossLevelDurationSeconds"),
    wavesPerLevel: assertNumber(obj.wavesPerLevel, "balance.battle.wavesPerLevel"),
    defaultWaveIntervalSeconds: assertNumber(obj.defaultWaveIntervalSeconds, "balance.battle.defaultWaveIntervalSeconds"),
    lingjiGrantWaves: assertArray(obj.lingjiGrantWaves, "balance.battle.lingjiGrantWaves", (item, path) => assertNumber(item, path)),
    maxLingjiPointsPerRun: assertNumber(obj.maxLingjiPointsPerRun, "balance.battle.maxLingjiPointsPerRun"),
    elementEssenceDrop: validateElementEssenceDrop(obj.elementEssenceDrop),
    runeUpgradeAttackGrowthPerLevel: assertNumber(
      obj.runeUpgradeAttackGrowthPerLevel,
      "balance.battle.runeUpgradeAttackGrowthPerLevel",
    ),
    drawRuneCooldownSeconds: validateDrawCooldown(obj.drawRuneCooldownSeconds),
    targetPriority: assertArray(obj.targetPriority, "balance.battle.targetPriority", assertString),
    starSweepCondition: validateStarSweepCondition(obj.starSweepCondition),
    reviveRules: assertRecord(obj.reviveRules, "balance.battle.reviveRules", (item, path) => validateReviveRule(item, path)),
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

function validateElementEssenceDrop(value: unknown): BalanceConfig["battle"]["elementEssenceDrop"] {
  const obj = assertPlainObject(value, "balance.battle.elementEssenceDrop");
  assertExactKeys(obj, "balance.battle.elementEssenceDrop", [
    "guaranteedWaves",
    "guaranteedAmount",
    "extraDropChance",
    "extraDropAmount",
  ]);

  return {
    guaranteedWaves: assertArray(obj.guaranteedWaves, "balance.battle.elementEssenceDrop.guaranteedWaves", (item, path) =>
      assertNumber(item, path),
    ),
    guaranteedAmount: assertNumber(obj.guaranteedAmount, "balance.battle.elementEssenceDrop.guaranteedAmount"),
    extraDropChance: assertNumber(obj.extraDropChance, "balance.battle.elementEssenceDrop.extraDropChance"),
    extraDropAmount: assertNumber(obj.extraDropAmount, "balance.battle.elementEssenceDrop.extraDropAmount"),
  };
}

function validateDrawCooldown(value: unknown): BalanceConfig["battle"]["drawRuneCooldownSeconds"] {
  const obj = assertPlainObject(value, "balance.battle.drawRuneCooldownSeconds");
  assertExactKeys(obj, "balance.battle.drawRuneCooldownSeconds", ["global", "perRune"]);

  return {
    global: assertNumber(obj.global, "balance.battle.drawRuneCooldownSeconds.global"),
    perRune: assertNumber(obj.perRune, "balance.battle.drawRuneCooldownSeconds.perRune"),
  };
}

function validateStarSweepCondition(value: unknown): BalanceConfig["battle"]["starSweepCondition"] {
  const obj = assertPlainObject(value, "balance.battle.starSweepCondition");
  assertExactKeys(obj, "balance.battle.starSweepCondition", ["minCoreHpRatio", "maxRevivesUsed"]);

  return {
    minCoreHpRatio: assertNumber(obj.minCoreHpRatio, "balance.battle.starSweepCondition.minCoreHpRatio"),
    maxRevivesUsed: assertNumber(obj.maxRevivesUsed, "balance.battle.starSweepCondition.maxRevivesUsed"),
  };
}

function validateReviveRule(value: unknown, path: string): { maxRevives: number; methods: string[]; reviveHpRatio: number | null } {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["maxRevives", "methods", "reviveHpRatio"]);

  return {
    maxRevives: assertNumber(obj.maxRevives, `${path}.maxRevives`),
    methods: assertArray(obj.methods, `${path}.methods`, (item, itemPath) =>
      assertEnum(item, itemPath, ["ad", "item", "diamond", "rare_item"] as const),
    ),
    reviveHpRatio: obj.reviveHpRatio === null ? null : assertNumber(obj.reviveHpRatio, `${path}.reviveHpRatio`),
  };
}

function validateProgressionCurves(value: unknown): BalanceConfig["progressionCurves"] {
  const obj = assertPlainObject(value, "balance.progressionCurves");
  assertExactKeys(obj, "balance.progressionCurves", [
    "chapterPowerFormula",
    "endlessTower",
    "skillGapCompensation",
  ]);

  const chapter = assertPlainObject(obj.chapterPowerFormula, "balance.progressionCurves.chapterPowerFormula");
  assertExactKeys(chapter, "balance.progressionCurves.chapterPowerFormula", [
    "chapterOneBasePower",
    "perLevelMultiplier",
    "chapterMultiplier",
    "bossMultiplier",
  ]);
  const endless = assertPlainObject(obj.endlessTower, "balance.progressionCurves.endlessTower");
  assertExactKeys(endless, "balance.progressionCurves.endlessTower", ["basePower", "exponentBase"]);
  const skillGap = assertPlainObject(obj.skillGapCompensation, "balance.progressionCurves.skillGapCompensation");
  assertExactKeys(skillGap, "balance.progressionCurves.skillGapCompensation", [
    "minPowerGapRatio",
    "maxPowerGapRatio",
    "lowPowerGuideRatio",
  ]);

  return {
    chapterPowerFormula: {
      chapterOneBasePower: assertNumber(chapter.chapterOneBasePower, "balance.progressionCurves.chapterPowerFormula.chapterOneBasePower"),
      perLevelMultiplier: assertNumber(chapter.perLevelMultiplier, "balance.progressionCurves.chapterPowerFormula.perLevelMultiplier"),
      chapterMultiplier: assertNumber(chapter.chapterMultiplier, "balance.progressionCurves.chapterPowerFormula.chapterMultiplier"),
      bossMultiplier: assertNumber(chapter.bossMultiplier, "balance.progressionCurves.chapterPowerFormula.bossMultiplier"),
    },
    endlessTower: {
      basePower: assertNumber(endless.basePower, "balance.progressionCurves.endlessTower.basePower"),
      exponentBase: assertNumber(endless.exponentBase, "balance.progressionCurves.endlessTower.exponentBase"),
    },
    skillGapCompensation: {
      minPowerGapRatio: assertNumber(skillGap.minPowerGapRatio, "balance.progressionCurves.skillGapCompensation.minPowerGapRatio"),
      maxPowerGapRatio: assertNumber(skillGap.maxPowerGapRatio, "balance.progressionCurves.skillGapCompensation.maxPowerGapRatio"),
      lowPowerGuideRatio: assertNumber(skillGap.lowPowerGuideRatio, "balance.progressionCurves.skillGapCompensation.lowPowerGuideRatio"),
    },
  };
}
