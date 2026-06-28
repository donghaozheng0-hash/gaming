import {
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  requireField,
} from "./common";

export interface InfiniteConfig {
  depthWall: {
    baseRequiredPower: number;
    depthGrowth: number;
  };
  monsterCoefficients: {
    commonHp: number;
    commonAtk: number;
    bossHp: number;
    bossAtk: number;
    eliteHp: number;
    eliteAtk: number;
  };
  bossRotation: {
    bandLevels: number;
    recurEveryNLevels: number;
    recurAtWaveOf7: number;
  };
  mapRandom: {
    elementsPerLevel: { min: number; max: number };
    effectivePowerVariance: number;
  };
  experience: {
    baseAtDepth1: number;
    growth: number;
  };
}

export function validateInfiniteConfig(value: unknown): InfiniteConfig {
  const obj = assertPlainObject(value, "infinite");
  assertExactKeys(obj, "infinite", [
    "depthWall",
    "monsterCoefficients",
    "bossRotation",
    "mapRandom",
    "experience",
  ]);

  const config: InfiniteConfig = {
    depthWall: validateDepthWall(requireField(obj, "depthWall", "infinite")),
    monsterCoefficients: validateMonsterCoefficients(requireField(obj, "monsterCoefficients", "infinite")),
    bossRotation: validateBossRotation(requireField(obj, "bossRotation", "infinite")),
    mapRandom: validateMapRandom(requireField(obj, "mapRandom", "infinite")),
    experience: validateExperience(requireField(obj, "experience", "infinite")),
  };

  if (config.experience.growth !== config.depthWall.depthGrowth) {
    throw new Error("[config] infinite.experience.growth must equal depthWall.depthGrowth (v4: exp 与 R 同指数)");
  }

  return config;
}

function validateDepthWall(value: unknown): InfiniteConfig["depthWall"] {
  const obj = assertPlainObject(value, "infinite.depthWall");
  assertExactKeys(obj, "infinite.depthWall", ["baseRequiredPower", "depthGrowth"]);

  return {
    baseRequiredPower: assertPositiveNumber(obj.baseRequiredPower, "infinite.depthWall.baseRequiredPower"),
    depthGrowth: assertPositiveNumber(obj.depthGrowth, "infinite.depthWall.depthGrowth"),
  };
}

function validateMonsterCoefficients(value: unknown): InfiniteConfig["monsterCoefficients"] {
  const obj = assertPlainObject(value, "infinite.monsterCoefficients");
  assertExactKeys(obj, "infinite.monsterCoefficients", [
    "commonHp",
    "commonAtk",
    "bossHp",
    "bossAtk",
    "eliteHp",
    "eliteAtk",
  ]);

  return {
    commonHp: assertPositiveNumber(obj.commonHp, "infinite.monsterCoefficients.commonHp"),
    commonAtk: assertPositiveNumber(obj.commonAtk, "infinite.monsterCoefficients.commonAtk"),
    bossHp: assertPositiveNumber(obj.bossHp, "infinite.monsterCoefficients.bossHp"),
    bossAtk: assertPositiveNumber(obj.bossAtk, "infinite.monsterCoefficients.bossAtk"),
    eliteHp: assertPositiveNumber(obj.eliteHp, "infinite.monsterCoefficients.eliteHp"),
    eliteAtk: assertPositiveNumber(obj.eliteAtk, "infinite.monsterCoefficients.eliteAtk"),
  };
}

function validateBossRotation(value: unknown): InfiniteConfig["bossRotation"] {
  const obj = assertPlainObject(value, "infinite.bossRotation");
  assertExactKeys(obj, "infinite.bossRotation", ["bandLevels", "recurEveryNLevels", "recurAtWaveOf7"]);

  return {
    bandLevels: assertPositiveNumber(obj.bandLevels, "infinite.bossRotation.bandLevels"),
    recurEveryNLevels: assertPositiveNumber(obj.recurEveryNLevels, "infinite.bossRotation.recurEveryNLevels"),
    recurAtWaveOf7: assertPositiveNumber(obj.recurAtWaveOf7, "infinite.bossRotation.recurAtWaveOf7"),
  };
}

function validateMapRandom(value: unknown): InfiniteConfig["mapRandom"] {
  const obj = assertPlainObject(value, "infinite.mapRandom");
  assertExactKeys(obj, "infinite.mapRandom", ["elementsPerLevel", "effectivePowerVariance"]);

  return {
    elementsPerLevel: validateElementsPerLevel(obj.elementsPerLevel, "infinite.mapRandom.elementsPerLevel"),
    effectivePowerVariance: assertPositiveNumber(
      obj.effectivePowerVariance,
      "infinite.mapRandom.effectivePowerVariance",
    ),
  };
}

function validateElementsPerLevel(value: unknown, path: string): { min: number; max: number } {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["min", "max"]);

  const min = assertNumber(obj.min, `${path}.min`);
  const max = assertNumber(obj.max, `${path}.max`);
  if (min < 1 || min > max) {
    throw new Error(`[config] ${path}: min must be >= 1 and <= max`);
  }

  return { min, max };
}

function validateExperience(value: unknown): InfiniteConfig["experience"] {
  const obj = assertPlainObject(value, "infinite.experience");
  assertExactKeys(obj, "infinite.experience", ["baseAtDepth1", "growth"]);

  return {
    baseAtDepth1: assertPositiveNumber(obj.baseAtDepth1, "infinite.experience.baseAtDepth1"),
    growth: assertPositiveNumber(obj.growth, "infinite.experience.growth"),
  };
}

function assertPositiveNumber(value: unknown, path: string): number {
  const number = assertNumber(value, path);
  if (number <= 0) {
    throw new Error(`[config] ${path}: must be > 0`);
  }

  return number;
}
