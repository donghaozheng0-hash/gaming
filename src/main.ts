import "./style.css";
import { BabylonApp } from "./app/BabylonApp";
import { loadGameConfig } from "./config";
import { BattleController } from "./game/battle/BattleController";
import { CombatSimulation, type CombatLoadoutEntry } from "./game/battle/combat/CombatSimulation";
import { generateMap } from "./game/battle/map/MapGenerator";
import { createRng } from "./game/battle/map/rng";
import { EventBus } from "./game/events/EventBus";
import { createBattleScene } from "./render/battleScene";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("Missing #game-canvas");
}

const app = new BabylonApp(canvas);
const config = loadGameConfig();
const seed = readSeed();
const map = generateMap({ config, seed });
const bus = new EventBus();
const loadout = buildDefaultLoadout(config, map);
const simulation = new CombatSimulation({
  config,
  map,
  bus,
  rng: createRng(seed),
  loadout,
  requiredPower: config.balance.progressionCurves.endlessTower.basePower,
});
const battle = new BattleController({ config, bus, simulation });

await app.load((a) => createBattleScene(a.engine, { config, map, simulation, bus, loadout }));
battle.start();
app.start();
app.engine.runRenderLoop(() => {
  battle.tick(app.engine.getDeltaTime());
});

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}

function readSeed(): number {
  const value = new URLSearchParams(location.search).get("seed");
  if (value === null) return 1;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

function buildDefaultLoadout(
  gameConfig: typeof config,
  generatedMap: typeof map,
): CombatLoadoutEntry[] {
  const usedRuneIds = new Set<string>();
  const allRuneIds = gameConfig.runes.runes.map((rune) => rune.id);

  return generatedMap.openSlots.map((slot, slotIndex) => {
    const slotType = gameConfig.maps.candidateSlotTypes.find((candidate) => candidate.id === slot.slotTypeId);

    if (slotType === undefined) {
      throw new Error(`maps.candidateSlotTypes unknown slot type "${slot.slotTypeId}"`);
    }

    const runeId = pickRuneId([...slotType.recommendedRuneIds, ...allRuneIds], usedRuneIds, allRuneIds);
    usedRuneIds.add(runeId);

    return {
      slotIndex,
      runeId,
    };
  });
}

function pickRuneId(candidates: readonly string[], usedRuneIds: ReadonlySet<string>, allRuneIds: readonly string[]): string {
  const knownRuneIds = new Set(allRuneIds);
  const unused = candidates.find((runeId) => knownRuneIds.has(runeId) && !usedRuneIds.has(runeId));

  if (unused !== undefined) {
    return unused;
  }

  const firstKnown = candidates.find((runeId) => knownRuneIds.has(runeId));

  if (firstKnown !== undefined) {
    return firstKnown;
  }

  const fallback = allRuneIds[0];
  if (fallback === undefined) {
    throw new Error("runes.runes must contain at least one rune");
  }

  return fallback;
}
