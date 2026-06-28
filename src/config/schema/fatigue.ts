import {
  assertBoolean,
  assertEnum,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  requireField,
} from "./common";

export interface FatigueConfig {
  penaltyPerLevel: number;
  failMargin: number;
  failureLoot: {
    scope: "current_run_only";
    keepsPermanentInventory: boolean;
  };
  recovery: {
    fullRecoverHours: number;
  };
}

export function validateFatigueConfig(value: unknown): FatigueConfig {
  const obj = assertPlainObject(value, "fatigue");
  assertExactKeys(obj, "fatigue", ["penaltyPerLevel", "failMargin", "failureLoot", "recovery"]);

  return {
    penaltyPerLevel: validatePenaltyPerLevel(requireField(obj, "penaltyPerLevel", "fatigue")),
    failMargin: assertPositiveNumber(requireField(obj, "failMargin", "fatigue"), "fatigue.failMargin"),
    failureLoot: validateFailureLoot(requireField(obj, "failureLoot", "fatigue")),
    recovery: validateRecovery(requireField(obj, "recovery", "fatigue")),
  };
}

function validateFailureLoot(value: unknown): FatigueConfig["failureLoot"] {
  const obj = assertPlainObject(value, "fatigue.failureLoot");
  assertExactKeys(obj, "fatigue.failureLoot", ["scope", "keepsPermanentInventory"]);

  return {
    scope: assertEnum(obj.scope, "fatigue.failureLoot.scope", ["current_run_only"] as const),
    keepsPermanentInventory: assertBoolean(
      obj.keepsPermanentInventory,
      "fatigue.failureLoot.keepsPermanentInventory",
    ),
  };
}

function validateRecovery(value: unknown): FatigueConfig["recovery"] {
  const obj = assertPlainObject(value, "fatigue.recovery");
  assertExactKeys(obj, "fatigue.recovery", ["fullRecoverHours"]);

  return {
    fullRecoverHours: assertPositiveNumber(obj.fullRecoverHours, "fatigue.recovery.fullRecoverHours"),
  };
}

function validatePenaltyPerLevel(value: unknown): number {
  const penaltyPerLevel = assertNumber(value, "fatigue.penaltyPerLevel");
  if (penaltyPerLevel <= 0 || penaltyPerLevel >= 1) {
    throw new Error("[config] fatigue.penaltyPerLevel: must be > 0 and < 1");
  }

  return penaltyPerLevel;
}

function assertPositiveNumber(value: unknown, path: string): number {
  const number = assertNumber(value, path);
  if (number <= 0) {
    throw new Error(`[config] ${path}: must be > 0`);
  }

  return number;
}
