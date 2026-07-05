/**
 * balance-core.mjs 的 TypeScript 类型声明(Claude 尺子侧维护,与实现同步)。
 * 供 src/debug/** 调参台 import 数值核 —— 单一真相源:浏览器面板与 CLI 门禁
 * 消费同一份算法与派生旋钮,禁止在 src 侧复制任何公式。
 */

/** 从 src/config 六表派生的平衡旋钮(配置即真相,表间漂移在 deriveKnobs 内抛错)。 */
export interface Knobs {
  baseRequiredPower: number;
  depthGrowth: number;
  basePowerFrac: number;
  statRatio: { atk: number; hp: number; def: number };
  powerPerStatUnit: number;
  armorModel: string;
  fixedK: number;
  relK: number;
  capPct: number;
  commonHpCoef: number;
  commonAtkCoef: number;
  fatiguePenaltyPerLevel: number;
  fatigueFailMargin: number;
  bandLevels: number;
  bossHpCoef: number;
  bossAtkCoef: number;
  eliteHpCoef: number;
  eliteAtkCoef: number;
  miniBossEveryNLevels: number;
  miniBossWaveOf7: number;
  powerGainPerSession: number;
  expBaseAtD1: number;
  xiangshengPresence: number;
  xiangshengAdjacent: number;
  maxPowerGapRatio: number;
  lootCompensationByOpenSlotCount: Record<string, number>;
  pathLengthUnits: number;
  capacityData: unknown;
}

/** runBalanceModel 输出的一节曲线判定。 */
export interface BalanceSection {
  id: "wall" | "mitigation" | "fatigue" | "boss" | "economy" | "samples" | "capacity";
  title: string;
  ok: boolean;
  data: unknown;
}

export interface BalanceRunResult {
  lines: string[];
  sections: BalanceSection[];
  failures: string[];
  ok: boolean;
}

/** deriveKnobs 需要的六张配置表(结构由 src/config schema 校验,这里保持松耦合)。 */
export interface BalanceTables {
  balance: unknown;
  infinite: unknown;
  fatigue: unknown;
  monsters: unknown;
  waves: unknown;
  runes: unknown;
}

export const SIM_SCRIPT: {
  milestones: ReadonlyArray<readonly [string, number]>;
  bands: Record<string, number>;
  capacity: Record<string, unknown>;
} & Record<string, unknown>;

export function deriveKnobs(tables: BalanceTables): Knobs;
export function runBalanceModel(K: Knobs): BalanceRunResult;

export function requiredPower(K: Knobs, d: number): number;
export function frontierDepth(K: Knobs, P: number): number;
export function playerBasePower(K: Knobs, P: number): number;
export function playerDEF(K: Knobs, P: number): number;
export function playerHP(K: Knobs, P: number): number;
export function monsterAtkAtDepth(K: Knobs, d: number): number;
export function mitigation(K: Knobs, model: string, P: number, d: number): number;
