export function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0; // iso-ok: PRNG 结构常数
    let mixed = Math.imul(state ^ (state >>> 15), state | 1); // iso-ok: PRNG 结构常数
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61); // iso-ok: PRNG 结构常数
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296; // iso-ok: PRNG 结构常数
  };
}
