import type { GameConfig } from "../../config";
import type { EventBus } from "../events/EventBus";
import { FixedStepClock } from "./FixedStepClock";
import type { CombatSimulation } from "./combat/CombatSimulation";

export type BattlePhase = "prep" | "combat" | "settle";

export interface BattleControllerDeps {
  config: GameConfig;
  bus: EventBus;
  levelId?: string;
  simulation?: CombatSimulation;
}

const defaultLevelId = "default-level";
const millisecondsPerSecond = 1000; // iso-ok: structural unit conversion from seconds to milliseconds.

export class BattleController {
  private readonly bus: EventBus;
  private readonly levelId: string;
  private readonly simulation: CombatSimulation | undefined;
  private readonly simulationFps: number;
  private readonly preparationSteps: number;
  private readonly waveSteps: number;
  private readonly wavesPerLevel: number;
  private readonly clock: FixedStepClock;

  private currentPhase: BattlePhase = "prep";
  private started = false;
  private totalSteps = 0;
  private phaseSteps = 0;
  private currentWaveIndex = 0;
  private completedWaves = 0;
  private waveTimelineCompleted = false;
  private settled = false;

  constructor({ config, bus, levelId = defaultLevelId, simulation }: BattleControllerDeps) {
    const battle = config.balance.battle;

    this.bus = bus;
    this.levelId = levelId;
    this.simulation = simulation;
    this.simulationFps = battle.simulationFps;
    this.preparationSteps = this.secondsToSteps(battle.preparationSeconds);
    this.waveSteps = this.secondsToSteps(battle.defaultWaveIntervalSeconds);
    this.wavesPerLevel = battle.wavesPerLevel;
    this.clock = new FixedStepClock(millisecondsPerSecond / this.simulationFps);
  }

  get phase(): BattlePhase {
    return this.currentPhase;
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.currentPhase = "prep";
    this.bus.emit("battle.prepStarted", { levelId: this.levelId });
  }

  tick(realDtMs: number): void {
    if (!this.started || this.currentPhase === "settle") {
      return;
    }

    const steps = this.clock.advance(realDtMs);

    for (let step = 0; step < steps && !this.settled; step += 1) {
      this.stepSimulation();
    }
  }

  private secondsToSteps(seconds: number): number {
    return Math.ceil(seconds * this.simulationFps);
  }

  private stepSimulation(): void {
    this.totalSteps += 1;
    this.phaseSteps += 1;

    if (this.currentPhase === "prep") {
      this.advancePrep();
      return;
    }

    if (this.currentPhase === "combat") {
      this.advanceCombat();
    }
  }

  private advancePrep(): void {
    if (this.phaseSteps < this.preparationSteps) {
      return;
    }

    this.currentPhase = "combat";
    this.phaseSteps = 0;
    this.startNextWave();
  }

  private advanceCombat(): void {
    if (this.simulation !== undefined) {
      this.simulation.step();

      if (this.simulation.coreHp <= 0) {
        this.settle(false);
        return;
      }

      if (this.waveTimelineCompleted) {
        if (this.simulation.isFieldCleared()) {
          this.settle(this.simulation.coreHp > 0);
        }

        return;
      }
    }

    if (this.phaseSteps < this.waveSteps) {
      return;
    }

    this.bus.emit("wave.ended", { index: this.currentWaveIndex });
    this.completedWaves += 1;
    this.phaseSteps = 0;

    if (this.currentWaveIndex >= this.wavesPerLevel) {
      if (this.simulation !== undefined) {
        this.waveTimelineCompleted = true;
        if (this.simulation.isFieldCleared()) {
          this.settle(this.simulation.coreHp > 0);
        }
        return;
      }

      this.settle(true);
      return;
    }

    this.startNextWave();
  }

  private startNextWave(): void {
    if (this.currentWaveIndex >= this.wavesPerLevel) {
      this.settle(true);
      return;
    }

    this.currentWaveIndex += 1;
    this.bus.emit("wave.started", { index: this.currentWaveIndex });
    this.simulation?.spawnWave(this.currentWaveIndex);
  }

  private settle(victory: boolean): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.currentPhase = "settle";

    if (this.simulation !== undefined) {
      const snapshot = this.simulation.snapshot();
      this.bus.emit("battle.settled", {
        victory,
        wavesCleared: victory ? this.wavesPerLevel : snapshot.wavesCleared,
        wavesDispatched: this.currentWaveIndex,
        totalSteps: this.totalSteps,
        coreHp: snapshot.coreHp,
        kills: snapshot.kills,
        leaks: snapshot.leaks,
        lootMultiplier: snapshot.lootMultiplier,
      });
      return;
    }

    this.bus.emit("battle.settled", {
      victory: true,
      wavesCleared: this.wavesPerLevel,
      totalSteps: this.totalSteps,
    });
  }
}
