import { describe, expect, it } from "vitest";

import { loadGameConfig } from "../src/config";
import { createGameConfig, type RawGameConfig } from "../src/config/ConfigService";
import { validateEconomyConfig } from "../src/config/schema/economy";
import balance from "../src/config/balance.json";
import cultivation from "../src/config/cultivation.json";
import economy from "../src/config/economy.json";
import fusion from "../src/config/fusion.json";
import levels from "../src/config/levels.json";
import maps from "../src/config/maps.json";
import monsters from "../src/config/monsters.json";
import progression from "../src/config/progression.json";
import runes from "../src/config/runes.json";
import visual from "../src/config/visual.json";
import waves from "../src/config/waves.json";

const validRawConfig: RawGameConfig = {
  balance,
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
    expect(Object.isFrozen(config.levels.levels[0])).toBe(true);
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
});
