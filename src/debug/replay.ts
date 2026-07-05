import type { GameConfig } from "../config";
import { assembleBattle } from "../game/battle/combat/assembleBattle";
import type { CombatLoadoutEntry } from "../game/battle/combat/CombatSimulation";
import type { BattleEventMap } from "../game/events/EventBus";

export interface WaveReplayRow {
  waveIndex: number;
  spawned: number;
  kills: number;
  leaks: number;
  shotsFired: number;
}

export interface ReplayResult {
  rows: WaveReplayRow[];
  settled: {
    victory: boolean;
    coreHp: number;
    kills: number;
    leaks: number;
    lootMultiplier: number;
    totalSteps: number;
    wavesCleared: number;
  };
  totals: {
    spawned: number;
    kills: number;
    leaks: number;
    shotsFired: number;
  };
}

export function replayBattle(opts: {
  config: GameConfig;
  seed: number;
  requiredPower: number;
  loadout?: readonly CombatLoadoutEntry[];
  waveTemplateId?: string;
}): ReplayResult {
  const { config, seed, requiredPower } = opts;
  // 与 main.ts 真实对局共用同一装配工厂(同构是回放有校准资格的前提)。
  const { bus, battle } = assembleBattle({
    config,
    seed,
    requiredPower,
    loadout: opts.loadout,
    waveTemplateId: opts.waveTemplateId,
  });
  const rows = createRows(config.balance.battle.wavesPerLevel);
  const entityBirthWave = new Map<number, number>();
  let settledPayload: BattleEventMap["battle.settled"] | undefined;

  bus.on("monster.spawned", (payload) => {
    entityBirthWave.set(payload.entityId, payload.waveIndex);
    rowForWave(rows, payload.waveIndex).spawned += 1;
  });
  bus.on("monster.died", (payload) => {
    rowForEntity(rows, entityBirthWave, payload.entityId).kills += 1;
  });
  bus.on("monster.leaked", (payload) => {
    rowForEntity(rows, entityBirthWave, payload.entityId).leaks += 1;
  });
  bus.on("rune.fired", (payload) => {
    rowForEntity(rows, entityBirthWave, payload.targetEntityId).shotsFired += 1;
  });
  bus.on("battle.settled", (payload) => {
    settledPayload = payload;
  });

  const stepMs = 1000 / config.balance.battle.simulationFps; // iso-ok: milliseconds per second conversion.
  const maxSteps = config.balance.battle.simulationFps * 60 * 30; // iso-ok: debug replay dead-loop guard in simulated seconds.

  battle.start();
  for (let step = 0; step < maxSteps && battle.phase !== "settle"; step += 1) {
    battle.tick(stepMs);
  }

  if (settledPayload === undefined) {
    throw new Error(`回放未在 ${maxSteps} 步内结算`);
  }

  const totals = rows.reduce(
    (acc, row) => ({
      spawned: acc.spawned + row.spawned,
      kills: acc.kills + row.kills,
      leaks: acc.leaks + row.leaks,
      shotsFired: acc.shotsFired + row.shotsFired,
    }),
    { spawned: 0, kills: 0, leaks: 0, shotsFired: 0 },
  );

  return {
    rows,
    settled: {
      victory: settledPayload.victory,
      coreHp: requiredNumber(settledPayload.coreHp, "battle.settled.coreHp"),
      kills: requiredNumber(settledPayload.kills, "battle.settled.kills"),
      leaks: requiredNumber(settledPayload.leaks, "battle.settled.leaks"),
      lootMultiplier: requiredNumber(settledPayload.lootMultiplier, "battle.settled.lootMultiplier"),
      totalSteps: settledPayload.totalSteps,
      wavesCleared: settledPayload.wavesCleared,
    },
    totals,
  };
}

function createRows(wavesPerLevel: number): WaveReplayRow[] {
  return Array.from({ length: wavesPerLevel }, (_, index) => ({
    waveIndex: index + 1,
    spawned: 0,
    kills: 0,
    leaks: 0,
    shotsFired: 0,
  }));
}

function rowForEntity(
  rows: readonly WaveReplayRow[],
  entityBirthWave: ReadonlyMap<number, number>,
  entityId: number,
): WaveReplayRow {
  const waveIndex = entityBirthWave.get(entityId);

  if (waveIndex === undefined) {
    throw new Error(`事件引用了未知怪物实体: ${entityId}`);
  }

  return rowForWave(rows, waveIndex);
}

function rowForWave(rows: readonly WaveReplayRow[], waveIndex: number): WaveReplayRow {
  const row = rows[waveIndex - 1];

  if (row === undefined) {
    throw new Error(`事件引用了未知波次: ${waveIndex}`);
  }

  return row;
}

function requiredNumber(value: number | undefined, label: string): number {
  if (value === undefined) {
    throw new Error(`${label} 缺失`);
  }

  return value;
}
