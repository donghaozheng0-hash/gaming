import type { GameConfig } from "../../../config";
import { EventBus } from "../../events/EventBus";
import { BattleController } from "../BattleController";
import { generateMap, type GeneratedMap } from "../map/MapGenerator";
import { createRng } from "../map/rng";
import { CombatSimulation, type CombatLoadoutEntry } from "./CombatSimulation";
import { buildDefaultLoadout } from "./defaultLoadout";

export interface BattleAssembly {
  map: GeneratedMap;
  bus: EventBus;
  loadout: readonly CombatLoadoutEntry[];
  simulation: CombatSimulation;
  battle: BattleController;
}

/**
 * 一局战斗的标准装配:地图生成 → 默认/指定摆位 → 注入式模拟 → 控制器。
 * main.ts(真实对局)与 src/debug/replay.ts(回放校准)必须共用本工厂,
 * 保证两侧装配永远同构——回放数据才有资格校准真实对局。
 * 返回时尚未 start(),调用方可先订阅 bus 再启动。
 */
export function assembleBattle(opts: {
  config: GameConfig;
  seed: number;
  requiredPower: number;
  loadout?: readonly CombatLoadoutEntry[];
  waveTemplateId?: string;
}): BattleAssembly {
  const { config, seed, requiredPower } = opts;
  const map = generateMap({ config, seed });
  const bus = new EventBus();
  const loadout = opts.loadout ?? buildDefaultLoadout(config, map);
  const simulation = new CombatSimulation({
    config,
    map,
    bus,
    rng: createRng(seed),
    loadout,
    requiredPower,
    waveTemplateId: opts.waveTemplateId,
  });
  const battle = new BattleController({ config, bus, simulation });

  return { map, bus, loadout, simulation, battle };
}
