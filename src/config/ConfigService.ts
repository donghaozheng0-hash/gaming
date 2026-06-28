import balanceJson from "./balance.json";
import cultivationJson from "./cultivation.json";
import dungeonsJson from "./dungeons.json";
import economyJson from "./economy.json";
import fatigueJson from "./fatigue.json";
import fusionJson from "./fusion.json";
import infiniteJson from "./infinite.json";
import levelsJson from "./levels.json";
import mapsJson from "./maps.json";
import monstersJson from "./monsters.json";
import progressionJson from "./progression.json";
import runesJson from "./runes.json";
import visualJson from "./visual.json";
import wavesJson from "./waves.json";
import {
  validateBalanceConfig,
  validateCultivationConfig,
  validateDungeonsConfig,
  validateEconomyConfig,
  validateFatigueConfig,
  validateFusionConfig,
  validateInfiniteConfig,
  validateLevelConfig,
  validateMapConfig,
  validateMonsterConfig,
  validateProgressionConfig,
  validateRuneConfig,
  validateVisualConfig,
  validateWaveConfig,
} from "./schema";
import type { GameConfig } from "./index";

export interface RawGameConfig {
  balance: unknown;
  infinite: unknown;
  dungeons: unknown;
  fatigue: unknown;
  runes: unknown;
  monsters: unknown;
  levels: unknown;
  waves: unknown;
  maps: unknown;
  fusion: unknown;
  cultivation: unknown;
  economy: unknown;
  progression: unknown;
  visual: unknown;
}

const rawGameConfig: RawGameConfig = {
  balance: balanceJson,
  infinite: infiniteJson,
  dungeons: dungeonsJson,
  fatigue: fatigueJson,
  runes: runesJson,
  monsters: monstersJson,
  levels: levelsJson,
  waves: wavesJson,
  maps: mapsJson,
  fusion: fusionJson,
  cultivation: cultivationJson,
  economy: economyJson,
  progression: progressionJson,
  visual: visualJson,
};

export function loadGameConfig(): GameConfig {
  return createGameConfig(rawGameConfig);
}

export function createGameConfig(raw: RawGameConfig): GameConfig {
  const config: GameConfig = {
    balance: validateBalanceConfig(raw.balance),
    infinite: validateInfiniteConfig(raw.infinite),
    dungeons: validateDungeonsConfig(raw.dungeons),
    fatigue: validateFatigueConfig(raw.fatigue),
    runes: validateRuneConfig(raw.runes),
    monsters: validateMonsterConfig(raw.monsters),
    levels: validateLevelConfig(raw.levels),
    waves: validateWaveConfig(raw.waves),
    maps: validateMapConfig(raw.maps),
    fusion: validateFusionConfig(raw.fusion),
    cultivation: validateCultivationConfig(raw.cultivation),
    economy: validateEconomyConfig(raw.economy),
    progression: validateProgressionConfig(raw.progression),
    visual: validateVisualConfig(raw.visual),
  };

  validateLevelReferences(config);

  return deepFreeze(config);
}

function validateLevelReferences(config: GameConfig): void {
  const waveTemplateIds = new Set(config.waves.waveTemplates.map((template) => template.id));
  const mapPoolIds = new Set(config.maps.mapPools.map((pool) => pool.id));
  const monsterIds = new Set(config.monsters.monsters.map((monster) => monster.id));
  const runeIds = new Set(config.runes.runes.map((rune) => rune.id));

  for (const level of config.levels.levels) {
    assertReference(waveTemplateIds, level.waveTemplateId, `levels.${level.id}.waveTemplateId`);
    assertReference(mapPoolIds, level.mapPoolId, `levels.${level.id}.mapPoolId`);

    level.enemyGroups.forEach((group, index) => {
      assertReference(
        monsterIds,
        group.monsterId,
        `levels.${level.id}.enemyGroups[${index}].monsterId`,
      );
    });

    level.runeUnlockIds.forEach((runeId, index) => {
      assertReference(runeIds, runeId, `levels.${level.id}.runeUnlockIds[${index}]`);
    });
  }
}

function assertReference(knownIds: ReadonlySet<string>, id: string, path: string): void {
  if (!knownIds.has(id)) {
    throw new Error(`[config] ${path}: unknown reference "${id}"`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }

  return Object.freeze(value);
}
