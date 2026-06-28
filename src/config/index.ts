import { loadGameConfig as loadGameConfigFromService } from "./ConfigService";
import type {
  BalanceConfig,
  CultivationConfig,
  DungeonsConfig,
  EconomyConfig,
  FatigueConfig,
  FusionConfig,
  InfiniteConfig,
  LevelConfig,
  MapConfig,
  MonsterConfig,
  ProgressionConfig,
  RuneConfig,
  VisualConfig,
  WaveConfig,
} from "./schema";

export interface GameConfig {
  balance: BalanceConfig;
  infinite: InfiniteConfig;
  dungeons: DungeonsConfig;
  fatigue: FatigueConfig;
  runes: RuneConfig;
  monsters: MonsterConfig;
  levels: LevelConfig;
  waves: WaveConfig;
  maps: MapConfig;
  fusion: FusionConfig;
  cultivation: CultivationConfig;
  economy: EconomyConfig;
  progression: ProgressionConfig;
  visual: VisualConfig;
}

export function loadGameConfig(): GameConfig {
  return loadGameConfigFromService();
}
