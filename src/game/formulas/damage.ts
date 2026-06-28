export function runeDamage({
  base,
  qualityMul,
  xiangshengMul,
  kezhiMul,
  drawBonus,
}: {
  base: number;
  qualityMul: number;
  xiangshengMul: number;
  kezhiMul: number;
  drawBonus?: number;
}): number {
  return Math.round(base * qualityMul * xiangshengMul * kezhiMul * (1 + (drawBonus ?? 0)));
}
