export function coreDamage({
  atk,
  def,
  relK,
}: {
  atk: number;
  def: number;
  relK: number;
}): number {
  const reductionRate = def / (def + relK * atk);
  return Math.round(atk * (1 - reductionRate));
}
