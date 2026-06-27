import {
  assertArray,
  assertExactKeys,
  assertNullableNumber,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
} from "./common";

export interface WaveConfig {
  waveTemplates: WaveTemplate[];
}

export interface WaveTemplate {
  id: string;
  name: string;
  levelKind: "normal" | "boss";
  waves: WaveDefinition[];
}

export interface WaveDefinition {
  index: number;
  startTimeSeconds: number;
  entries: WaveEntry[];
  spawnIntervalSeconds: number | null;
  designPurpose: string;
  specialRules: string | null;
}

export interface WaveEntry {
  monsterPoolIds: string[];
  totalCount: number;
  label: string;
}

export function validateWaveConfig(value: unknown): WaveConfig {
  const obj = assertPlainObject(value, "waves");
  assertExactKeys(obj, "waves", ["waveTemplates"]);

  return {
    waveTemplates: assertArray(requireField(obj, "waveTemplates", "waves"), "waves.waveTemplates", validateWaveTemplate),
  };
}

function validateWaveTemplate(value: unknown, path: string): WaveTemplate {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["id", "name", "levelKind", "waves"]);
  const levelKind = assertString(obj.levelKind, `${path}.levelKind`);
  if (levelKind !== "normal" && levelKind !== "boss") {
    throw new Error(`[config] ${path}.levelKind: expected normal or boss`);
  }

  return {
    id: assertString(obj.id, `${path}.id`),
    name: assertString(obj.name, `${path}.name`),
    levelKind,
    waves: assertArray(obj.waves, `${path}.waves`, validateWaveDefinition),
  };
}

function validateWaveDefinition(value: unknown, path: string): WaveDefinition {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, [
    "index",
    "startTimeSeconds",
    "entries",
    "spawnIntervalSeconds",
    "designPurpose",
    "specialRules",
  ]);

  return {
    index: assertNumber(obj.index, `${path}.index`),
    startTimeSeconds: assertNumber(obj.startTimeSeconds, `${path}.startTimeSeconds`),
    entries: assertArray(obj.entries, `${path}.entries`, validateWaveEntry),
    spawnIntervalSeconds: assertNullableNumber(obj.spawnIntervalSeconds, `${path}.spawnIntervalSeconds`),
    designPurpose: assertString(obj.designPurpose, `${path}.designPurpose`),
    specialRules: obj.specialRules === null ? null : assertString(obj.specialRules, `${path}.specialRules`),
  };
}

function validateWaveEntry(value: unknown, path: string): WaveEntry {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["monsterPoolIds", "totalCount", "label"]);

  return {
    monsterPoolIds: assertArray(obj.monsterPoolIds, `${path}.monsterPoolIds`, assertString),
    totalCount: assertNumber(obj.totalCount, `${path}.totalCount`),
    label: assertString(obj.label, `${path}.label`),
  };
}

