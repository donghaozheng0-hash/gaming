import { loadGameConfig } from "../../config";

let powerFormula: ReturnType<typeof loadGameConfig>["balance"]["powerFormula"] | undefined;

function getPowerFormula(): ReturnType<typeof loadGameConfig>["balance"]["powerFormula"] {
  powerFormula ??= loadGameConfig().balance.powerFormula;
  return powerFormula;
}

export function combatPower({ atk, hp, def }: { atk: number; hp: number; def: number }): number {
  const { atkWeight, hpWeight, defWeight } = getPowerFormula();
  return atk * atkWeight + hp * hpWeight + def * defWeight;
}
