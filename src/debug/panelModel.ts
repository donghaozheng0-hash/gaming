import {
  deriveKnobs,
  runBalanceModel,
  type BalanceSection,
  type BalanceTables,
  type Knobs,
} from "../../scripts/balance-core.mjs";

export type NumericKnobKey = {
  [Key in keyof Knobs]: Knobs[Key] extends number ? Key : never;
}[keyof Knobs];

export type KnobOverrides = Partial<Record<NumericKnobKey, number>>;

export interface PanelModel {
  knobs: Knobs;
  overrides: KnobOverrides;
  lines: string[];
  sections: BalanceSection[];
  failures: string[];
  ok: boolean;
}

export function computePanelModel(tables: BalanceTables, overrides?: KnobOverrides): PanelModel {
  const baseKnobs = deriveKnobs(tables);
  const activeOverrides = overrides ?? {};
  const numericKeys = new Set(
    Object.entries(baseKnobs)
      .filter(([, value]) => typeof value === "number")
      .map(([key]) => key),
  );

  for (const key of Object.keys(activeOverrides)) {
    if (!numericKeys.has(key)) {
      throw new Error(`未知数值旋钮: ${key}`);
    }
  }

  const knobs: Knobs = {
    ...baseKnobs,
    ...activeOverrides,
  };
  const result = runBalanceModel(knobs);

  return {
    knobs,
    overrides: activeOverrides,
    lines: result.lines,
    sections: result.sections,
    failures: result.failures,
    ok: result.ok,
  };
}
