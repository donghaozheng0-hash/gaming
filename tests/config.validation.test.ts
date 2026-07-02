import { describe, expect, it } from "vitest";

import { loadGameConfig } from "../src/config";
import { createGameConfig, type RawGameConfig } from "../src/config/ConfigService";
import { validateDungeonsConfig } from "../src/config/schema/dungeons";
import { validateEconomyConfig } from "../src/config/schema/economy";
import { validateFatigueConfig } from "../src/config/schema/fatigue";
import { validateInfiniteConfig } from "../src/config/schema/infinite";
import { validateMapConfig } from "../src/config/schema/maps";
import balance from "../src/config/balance.json";
import cultivation from "../src/config/cultivation.json";
import dungeons from "../src/config/dungeons.json";
import economy from "../src/config/economy.json";
import fatigue from "../src/config/fatigue.json";
import fusion from "../src/config/fusion.json";
import infinite from "../src/config/infinite.json";
import levels from "../src/config/levels.json";
import maps from "../src/config/maps.json";
import monsters from "../src/config/monsters.json";
import progression from "../src/config/progression.json";
import runes from "../src/config/runes.json";
import visual from "../src/config/visual.json";
import waves from "../src/config/waves.json";

const validRawConfig: RawGameConfig = {
  balance,
  infinite,
  dungeons,
  fatigue,
  runes,
  monsters,
  levels,
  waves,
  maps,
  fusion,
  cultivation,
  economy,
  progression,
  visual,
};

describe("config validation", () => {
  it("loads the real config and resolves key level references", () => {
    const config = loadGameConfig();
    const waveIds = new Set(config.waves.waveTemplates.map((template) => template.id));
    const mapPoolIds = new Set(config.maps.mapPools.map((pool) => pool.id));
    const monsterIds = new Set(config.monsters.monsters.map((monster) => monster.id));
    const runeIds = new Set(config.runes.runes.map((rune) => rune.id));

    expect(config.levels.levels.length).toBe(20);
    for (const level of config.levels.levels) {
      expect(waveIds.has(level.waveTemplateId), `${level.id} wave template`).toBe(true);
      expect(mapPoolIds.has(level.mapPoolId), `${level.id} map pool`).toBe(true);
      for (const group of level.enemyGroups) {
        expect(monsterIds.has(group.monsterId), `${level.id} monster ${group.monsterId}`).toBe(true);
      }
      for (const runeId of level.runeUnlockIds) {
        expect(runeIds.has(runeId), `${level.id} rune ${runeId}`).toBe(true);
      }
    }

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.balance)).toBe(true);
    expect(Object.isFrozen(config.infinite)).toBe(true);
    expect(Object.isFrozen(config.dungeons)).toBe(true);
    expect(Object.isFrozen(config.fatigue)).toBe(true);
    expect(Object.isFrozen(config.levels.levels[0])).toBe(true);
  });

  it("freezes the real infinite mode config tables", () => {
    const config = loadGameConfig();

    expect(config.infinite).toBeDefined();
    expect(config.dungeons).toBeDefined();
    expect(config.fatigue).toBeDefined();
    expect(Object.isFrozen(config.infinite.depthWall)).toBe(true);
    expect(Object.isFrozen(config.dungeons.monsterPowerMultiplierRange)).toBe(true);
    expect(Object.isFrozen(config.fatigue.failureLoot)).toBe(true);
  });

  it("throws when a required field is missing", () => {
    const { resources: _resources, ...missingResources } = economy as Record<string, unknown>;

    expect(() => validateEconomyConfig(missingResources)).toThrow(/economy\.resources/);
  });

  it("throws when a level references an unknown wave template", () => {
    const badLevels = {
      ...levels,
      levels: [
        {
          ...levels.levels[0],
          waveTemplateId: "missing_wave_template",
        },
        ...levels.levels.slice(1),
      ],
    };

    expect(() => createGameConfig({ ...validRawConfig, levels: badLevels })).toThrow(
      /levels\.1-1\.waveTemplateId/,
    );
  });

  it("throws when infinite experience growth diverges from depth growth", () => {
    const badInfinite = {
      ...infinite,
      experience: {
        ...infinite.experience,
        growth: infinite.depthWall.depthGrowth + 0.01,
      },
    };

    expect(() => validateInfiniteConfig(badInfinite)).toThrow(/experience\.growth must equal depthWall\.depthGrowth/);
  });

  it("throws when dungeon default monster multiplier is outside the allowed range", () => {
    const badDungeons = {
      ...dungeons,
      defaultMonsterPowerMultiplier: 2.0,
    };

    expect(() => validateDungeonsConfig(badDungeons)).toThrow(/defaultMonsterPowerMultiplier/);
  });

  it("throws when fatigue required fields are missing", () => {
    const { failMargin: _failMargin, ...missingFailMargin } = fatigue;

    expect(() => validateFatigueConfig(missingFailMargin)).toThrow(/fatigue\.failMargin/);
  });

  it("throws when maps open slot count range min exceeds max", () => {
    const badMaps = {
      ...maps,
      randomization: {
        ...maps.randomization,
        openSlotCountRange: { min: 3, max: 2 },
      },
    };

    expect(() => validateMapConfig(badMaps)).toThrow(/openSlotCountRange/);
  });
});
