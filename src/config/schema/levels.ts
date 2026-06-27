import {
  assertArray,
  assertElementId,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertRecord,
  assertString,
  requireField,
  type ElementId,
} from "./common";

export interface LevelConfig {
  levels: LevelDefinition[];
}

export interface LevelDefinition {
  id: string;
  chapter: number;
  stage: number;
  displayName: string;
  recommendedPower: number;
  progression: string;
  teachingGoal: string;
  waveTemplateId: string;
  mapPoolId: string;
  enemyGroups: LevelEnemyGroup[];
  firstClearRewards: Record<string, number | string>;
  runeUnlockIds: string[];
}

export interface LevelEnemyGroup {
  monsterId: string;
  elements: ElementId[];
  label: string;
}

export function validateLevelConfig(value: unknown): LevelConfig {
  const obj = assertPlainObject(value, "levels");
  assertExactKeys(obj, "levels", ["levels"]);

  return {
    levels: assertArray(requireField(obj, "levels", "levels"), "levels.levels", validateLevelDefinition),
  };
}

function validateLevelDefinition(value: unknown, path: string): LevelDefinition {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "id",
    "chapter",
    "stage",
    "displayName",
    "recommendedPower",
    "progression",
    "teachingGoal",
    "waveTemplateId",
    "mapPoolId",
    "enemyGroups",
    "firstClearRewards",
    "runeUnlockIds",
  ]);

  return {
    id: assertString(obj.id, `${path}.id`),
    chapter: assertNumber(obj.chapter, `${path}.chapter`),
    stage: assertNumber(obj.stage, `${path}.stage`),
    displayName: assertString(obj.displayName, `${path}.displayName`),
    recommendedPower: assertNumber(obj.recommendedPower, `${path}.recommendedPower`),
    progression: assertString(obj.progression, `${path}.progression`),
    teachingGoal: assertString(obj.teachingGoal, `${path}.teachingGoal`),
    waveTemplateId: assertString(obj.waveTemplateId, `${path}.waveTemplateId`),
    mapPoolId: assertString(obj.mapPoolId, `${path}.mapPoolId`),
    enemyGroups: assertArray(obj.enemyGroups, `${path}.enemyGroups`, validateLevelEnemyGroup),
    firstClearRewards: assertRecord(obj.firstClearRewards, `${path}.firstClearRewards`, (item, itemPath) => {
      if (typeof item === "string") return assertString(item, itemPath);
      return assertNumber(item, itemPath);
    }),
    runeUnlockIds: assertArray(obj.runeUnlockIds, `${path}.runeUnlockIds`, assertString),
  };
}

function validateLevelEnemyGroup(value: unknown, path: string): LevelEnemyGroup {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["monsterId", "elements", "label"]);

  return {
    monsterId: assertString(obj.monsterId, `${path}.monsterId`),
    elements: assertArray(obj.elements, `${path}.elements`, assertElementId),
    label: assertString(obj.label, `${path}.label`),
  };
}

