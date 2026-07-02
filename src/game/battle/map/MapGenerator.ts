import type { GameConfig } from "../../../config";
import { createRng } from "./rng";

export interface Vec2 {
  x: number;
  y: number;
}

export interface OpenSlot {
  slotTypeId: string;
  element: string;
  position: Vec2;
}

export interface GeneratedMap {
  poolId: string;
  templateId: string;
  archetype: string;
  routes: Vec2[][];
  openSlots: OpenSlot[];
}

type MapPool = GameConfig["maps"]["mapPools"][number];
type PathTemplate = MapPool["pathTemplates"][number];
type CandidateSlot = PathTemplate["candidateSlots"][number];

export function generateMap(opts: { config: GameConfig; seed: number; poolId?: string }): GeneratedMap {
  const { config, seed } = opts;
  const poolId = opts.poolId ?? config.maps.mapPools[0]?.id;

  if (poolId === undefined) {
    throw new Error("maps.mapPools must contain at least one pool");
  }

  const pool = config.maps.mapPools.find((candidate) => candidate.id === poolId);
  if (pool === undefined) {
    throw new Error(`maps.mapPools unknown pool "${poolId}"`);
  }

  const rng = createRng(seed);
  const template = choose(pool.pathTemplates, rng, `maps.mapPools.${pool.id}.pathTemplates`);
  const selectedSlots = selectOpenSlots(template, config.maps.randomization.openSlotCount, rng);
  const openSlots = assignElements(selectedSlots, config.maps.randomization.elementPool, rng);

  return {
    poolId: pool.id,
    templateId: template.id,
    archetype: template.archetype,
    routes: copyRoutes(template.routes),
    openSlots,
  };
}

function selectOpenSlots(template: PathTemplate, openSlotCount: number, rng: () => number): CandidateSlot[] {
  if (template.candidateSlots.length < openSlotCount) {
    throw new Error(`maps.pathTemplates.${template.id}.candidateSlots has too few slots`);
  }

  const candidates = [...template.candidateSlots];
  const selected: CandidateSlot[] = [];

  for (let index = 0; index < openSlotCount; index += 1) {
    const swapIndex = index + chooseIndex(candidates.length - index, rng);
    const chosen = candidates[swapIndex];
    candidates[swapIndex] = candidates[index];
    candidates[index] = chosen;
    selected.push(chosen);
  }

  return selected;
}

function assignElements(slots: CandidateSlot[], elementPool: readonly string[], rng: () => number): OpenSlot[] {
  return slots.map((slot) => ({
    slotTypeId: slot.slotTypeId,
    element: choose(elementPool, rng, "maps.randomization.elementPool"),
    position: copyVec2(slot.position),
  }));
}

function choose<T>(items: readonly T[], rng: () => number, path: string): T {
  if (items.length === 0) {
    throw new Error(`${path} must not be empty`);
  }

  return items[chooseIndex(items.length, rng)];
}

function chooseIndex(count: number, rng: () => number): number {
  if (count <= 0) {
    throw new Error("random selection count must be positive");
  }

  return Math.floor(rng() * count);
}

function copyRoutes(routes: readonly (readonly Vec2[])[]): Vec2[][] {
  return routes.map((route) => route.map(copyVec2));
}

function copyVec2(position: Vec2): Vec2 {
  return {
    x: position.x,
    y: position.y,
  };
}
