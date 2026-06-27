import {
  assertExactKeys,
  assertPlainObject,
  assertRecord,
  assertString,
  requireField,
} from "./common";

export interface VisualConfig {
  palette: {
    elements: Record<string, PaletteEntry>;
    fusedElements: Record<string, PaletteEntry>;
    surface: Record<string, string>;
    ink: Record<string, string>;
  };
  effectKeys: Record<string, string>;
  uiTokens: Record<string, string>;
}

export interface PaletteEntry {
  name: string;
  primary: string;
  secondary: string | null;
  usage: string;
}

export function validateVisualConfig(value: unknown): VisualConfig {
  const obj = assertPlainObject(value, "visual");
  assertExactKeys(obj, "visual", ["palette", "effectKeys", "uiTokens"]);

  return {
    palette: validatePalette(requireField(obj, "palette", "visual")),
    effectKeys: assertRecord(requireField(obj, "effectKeys", "visual"), "visual.effectKeys", (item, path) =>
      assertString(item, path),
    ),
    uiTokens: assertRecord(requireField(obj, "uiTokens", "visual"), "visual.uiTokens", (item, path) =>
      assertString(item, path),
    ),
  };
}

function validatePalette(value: unknown): VisualConfig["palette"] {
  const obj = assertPlainObject(value, "visual.palette");
  assertExactKeys(obj, "visual.palette", ["elements", "fusedElements", "surface", "ink"]);

  return {
    elements: assertRecord(obj.elements, "visual.palette.elements", validatePaletteEntry),
    fusedElements: assertRecord(obj.fusedElements, "visual.palette.fusedElements", validatePaletteEntry),
    surface: assertRecord(obj.surface, "visual.palette.surface", (item, path) => assertString(item, path)),
    ink: assertRecord(obj.ink, "visual.palette.ink", (item, path) => assertString(item, path)),
  };
}

function validatePaletteEntry(value: unknown, path: string): PaletteEntry {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["name", "primary", "secondary", "usage"]);

  return {
    name: assertString(obj.name, `${path}.name`),
    primary: assertString(obj.primary, `${path}.primary`),
    secondary: obj.secondary === null ? null : assertString(obj.secondary, `${path}.secondary`),
    usage: assertString(obj.usage, `${path}.usage`),
  };
}

