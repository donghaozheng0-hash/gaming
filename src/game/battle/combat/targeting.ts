import type { Vec2 } from "../map/MapGenerator";

export interface TargetableMonster {
  entityId: number;
  remainingDistanceUnits: number;
  position: Vec2;
}

export type TargetingStrategy = (candidates: readonly TargetableMonster[]) => TargetableMonster | undefined;

const strategies = new Map<string, TargetingStrategy>();

export function registerTargetingStrategy(id: string, strategy: TargetingStrategy): void {
  strategies.set(id, strategy);
}

export function resolveTargetingStrategy(id: string): TargetingStrategy {
  const strategy = strategies.get(id);

  if (strategy === undefined) {
    throw new Error(`Unknown targeting strategy "${id}"`);
  }

  return strategy;
}

registerTargetingStrategy("nearest_to_core", (candidates) => {
  let picked: TargetableMonster | undefined;

  for (const candidate of candidates) {
    if (picked === undefined || candidate.remainingDistanceUnits < picked.remainingDistanceUnits) {
      picked = candidate;
    }
  }

  return picked;
});
