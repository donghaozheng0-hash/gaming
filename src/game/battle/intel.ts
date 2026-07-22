import type { GameConfig } from "../../config";
import type { ElementId } from "../../config/schema/common";

export function summarizeWaveElements(
  config: GameConfig,
  waveTemplateId?: string,
): { rows: Array<{ element: ElementId; potentialCount: number }>; bossWaveIndexes: number[] } {
  const template = findWaveTemplate(config, waveTemplateId);
  const counts = Object.fromEntries(config.balance.elements.ids.map((element) => [element, 0])) as Record<ElementId, number>;
  const bossWaveIndexes: number[] = [];

  for (const wave of template.waves) {
    let hasBoss = false;

    for (const entry of wave.entries) {
      const monsters = entry.monsterPoolIds.map((monsterId) => findMonster(config, monsterId));

      for (const element of config.balance.elements.ids) {
        if (monsters.some((monster) => monster.defaultElements.includes(element))) {
          counts[element] += entry.totalCount;
        }
      }

      if (monsters.some((monster) => monster.tags.includes("boss"))) {
        hasBoss = true;
      }
    }

    if (hasBoss) {
      bossWaveIndexes.push(wave.index);
    }
  }

  return {
    rows: config.balance.elements.ids.map((element) => ({ element, potentialCount: counts[element] })),
    bossWaveIndexes,
  };
}

function findWaveTemplate(
  config: GameConfig,
  waveTemplateId: string | undefined,
): GameConfig["waves"]["waveTemplates"][number] {
  const id = waveTemplateId ?? config.waves.waveTemplates[0]?.id;
  const template = config.waves.waveTemplates.find((candidate) => candidate.id === id);

  if (template === undefined) {
    throw new Error(`waves.waveTemplates unknown template "${id}"`);
  }

  return template;
}

function findMonster(config: GameConfig, monsterId: string): GameConfig["monsters"]["monsters"][number] {
  const monster = config.monsters.monsters.find((candidate) => candidate.id === monsterId);

  if (monster === undefined) {
    throw new Error(`monsters.monsters unknown monster "${monsterId}"`);
  }

  return monster;
}
