import { loadGameConfig } from "../../config";

export type ElementRelation = "advantage" | "neutral" | "disadvantage";

let kezhiCycle: ReadonlyMap<string, string> | undefined;

function getKezhiCycle(): ReadonlyMap<string, string> {
  kezhiCycle ??= new Map(Object.entries(loadGameConfig().balance.elements.kezhiCycle));
  return kezhiCycle;
}

export function relation(attacker: string, target: string): ElementRelation {
  const cycle = getKezhiCycle();

  if (cycle.get(attacker) === target) {
    return "advantage";
  }

  if (cycle.get(target) === attacker) {
    return "disadvantage";
  }

  return "neutral";
}
