import type { GameConfig } from "../../../config";
import type { GeneratedMap } from "../map/MapGenerator";
import type { CombatLoadoutEntry } from "./CombatSimulation";

export function buildDefaultLoadout(config: GameConfig, map: GeneratedMap): CombatLoadoutEntry[] {
  const usedRuneIds = new Set<string>();
  const allRuneIds = config.runes.runes.map((rune) => rune.id);

  return map.openSlots.map((slot, slotIndex) => {
    const slotType = config.maps.candidateSlotTypes.find((candidate) => candidate.id === slot.slotTypeId);

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
