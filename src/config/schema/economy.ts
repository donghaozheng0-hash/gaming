import {
  assertArray,
  assertExactKeys,
  assertNullableNumber,
  assertNumber,
  assertPlainObject,
  assertRecord,
  assertString,
  requireField,
} from "./common";

export interface EconomyConfig {
  resources: ResourceFlow[];
  staminaModel: {
    mainlineConsumesStamina: boolean;
    limitedModes: string[];
    recoveryRule: string;
  };
  dailyOutputs: DailyOutput[];
  breakthroughRequirements: BreakthroughRequirement[];
  pacingTargets: PacingTarget[];
}

export interface ResourceFlow {
  id: string;
  name: string;
  sources: string[];
  sinks: string[];
}

export interface DailyOutput {
  sourceId: string;
  name: string;
  dailyLimit: number | null;
  singleRunOutput: Record<string, number | string>;
  dailyOutput: Record<string, number | string>;
  purpose: string;
}

export interface BreakthroughRequirement {
  fromRealmId: string;
  toRealmId: string;
  tribulationPills: number;
  specialMaterialId: string;
  specialMaterialAmount: number;
  challengeRecommendedPower: number;
  freeExpectedDays: number;
  failureProtection: string;
}

export interface PacingTarget {
  target: string;
  freeExpected: string;
  adMaxExpected: string;
  purpose: string;
}

export function validateEconomyConfig(value: unknown): EconomyConfig {
  const obj = assertPlainObject(value, "economy");
  assertExactKeys(obj, "economy", [
    "resources",
    "staminaModel",
    "dailyOutputs",
    "breakthroughRequirements",
    "pacingTargets",
  ]);

  return {
    resources: assertArray(requireField(obj, "resources", "economy"), "economy.resources", validateResourceFlow),
    staminaModel: validateStaminaModel(requireField(obj, "staminaModel", "economy")),
    dailyOutputs: assertArray(
      requireField(obj, "dailyOutputs", "economy"),
      "economy.dailyOutputs",
      validateDailyOutput,
    ),
    breakthroughRequirements: assertArray(
      requireField(obj, "breakthroughRequirements", "economy"),
      "economy.breakthroughRequirements",
      validateBreakthroughRequirement,
    ),
    pacingTargets: assertArray(requireField(obj, "pacingTargets", "economy"), "economy.pacingTargets", validatePacingTarget),
  };
}

function validateResourceFlow(value: unknown, path: string): ResourceFlow {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["id", "name", "sources", "sinks"]);

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    sources: assertArray(obj.sources, `${path}.sources`, assertString),
    sinks: assertArray(obj.sinks, `${path}.sinks`, assertString),
  };
}

function validateStaminaModel(value: unknown): EconomyConfig["staminaModel"] {
  const obj = assertPlainObject(value, "economy.staminaModel");
  assertExactKeys(obj, "economy.staminaModel", ["mainlineConsumesStamina", "limitedModes", "recoveryRule"]);

  if (typeof obj.mainlineConsumesStamina !== "boolean") {
    throw new Error("[config] economy.staminaModel.mainlineConsumesStamina: expected boolean");
  }

  return {
    mainlineConsumesStamina: obj.mainlineConsumesStamina,
    limitedModes: assertArray(obj.limitedModes, "economy.staminaModel.limitedModes", assertString),
    recoveryRule: assertString(obj.recoveryRule, "economy.staminaModel.recoveryRule"),
  };
}

function validateDailyOutput(value: unknown, path: string): DailyOutput {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["sourceId", "name", "dailyLimit", "singleRunOutput", "dailyOutput", "purpose"]);

  return {
    sourceId: assertString(obj.sourceId, `${path}.sourceId`),
    name: assertString(obj.name, `${path}.name`),
    dailyLimit: assertNullableNumber(obj.dailyLimit, `${path}.dailyLimit`),
    singleRunOutput: validateOutputRecord(obj.singleRunOutput, `${path}.singleRunOutput`),
    dailyOutput: validateOutputRecord(obj.dailyOutput, `${path}.dailyOutput`),
    purpose: assertString(obj.purpose, `${path}.purpose`),
  };
}

function validateOutputRecord(value: unknown, path: string): Record<string, number | string> {
  return assertRecord(value, path, (item, itemPath) => {
    if (typeof item === "string") return assertString(item, itemPath);
    return assertNumber(item, itemPath);
  });
}

function validateBreakthroughRequirement(value: unknown, path: string): BreakthroughRequirement {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "fromRealmId",
    "toRealmId",
    "tribulationPills",
    "specialMaterialId",
    "specialMaterialAmount",
    "challengeRecommendedPower",
    "freeExpectedDays",
    "failureProtection",
  ]);

  return {
    fromRealmId: assertString(obj.fromRealmId, `${path}.fromRealmId`),
    toRealmId: assertString(obj.toRealmId, `${path}.toRealmId`),
    tribulationPills: assertNumber(obj.tribulationPills, `${path}.tribulationPills`),
    specialMaterialId: assertString(obj.specialMaterialId, `${path}.specialMaterialId`),
    specialMaterialAmount: assertNumber(obj.specialMaterialAmount, `${path}.specialMaterialAmount`),
    challengeRecommendedPower: assertNumber(obj.challengeRecommendedPower, `${path}.challengeRecommendedPower`),
    freeExpectedDays: assertNumber(obj.freeExpectedDays, `${path}.freeExpectedDays`),
    failureProtection: assertString(obj.failureProtection, `${path}.failureProtection`),
  };
}

function validatePacingTarget(value: unknown, path: string): PacingTarget {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["target", "freeExpected", "adMaxExpected", "purpose"]);

  return {
    target: assertString(obj.target, `${path}.target`),
    freeExpected: assertString(obj.freeExpected, `${path}.freeExpected`),
    adMaxExpected: assertString(obj.adMaxExpected, `${path}.adMaxExpected`),
    purpose: assertString(obj.purpose, `${path}.purpose`),
  };
}

