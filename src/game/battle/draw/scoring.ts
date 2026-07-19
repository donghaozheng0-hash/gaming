import type { GameConfig } from "../../../config";

export type DrawTier = "none" | "partial" | "full" | "perfect";

export function drawBonusForScore(
  score: number,
  draw: GameConfig["balance"]["damageFormula"]["drawBonus"],
): { tier: DrawTier; bonus: number } {
  if (score < draw.partialMinScore) {
    return { tier: "none", bonus: 0 };
  }

  if (score >= draw.perfectScore) {
    return { tier: "perfect", bonus: draw.fullBonus };
  }

  if (score >= draw.fullScore) {
    return { tier: "full", bonus: draw.fullBonus };
  }

  const progress = (score - draw.partialMinScore) / (draw.fullScore - draw.partialMinScore);
  return { tier: "partial", bonus: progress * draw.fullBonus };
}
