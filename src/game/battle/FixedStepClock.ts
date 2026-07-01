export class FixedStepClock {
  private accumulatedMs = 0;

  constructor(private readonly stepMs: number) {
    if (stepMs <= 0) {
      throw new Error("FixedStepClock step must be positive");
    }
  }

  advance(realDtMs: number): number {
    this.accumulatedMs += Math.max(0, realDtMs);

    const steps = Math.floor(this.accumulatedMs / this.stepMs);
    this.accumulatedMs -= steps * this.stepMs;

    return steps;
  }
}
