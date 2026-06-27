export const elementIds = ["metal", "wood", "water", "fire", "earth"] as const;
export type ElementId = (typeof elementIds)[number];

export const fusedElementIds = ["thunder", "ice", "poison", "ghost", "yang", "yin"] as const;
export type FusedElementId = (typeof fusedElementIds)[number];

export function fail(path: string, message: string): never {
  throw new Error(`[config] ${path}: ${message}`);
}

export function assertPlainObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected object");
  }

  return value as Record<string, unknown>;
}

export function requireField(obj: Record<string, unknown>, key: string, path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    fail(`${path}.${key}`, "missing required field");
  }

  return obj[key];
}

export function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "expected non-empty string");
  }

  return value;
}

export function assertNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return assertString(value, path);
}

export function assertNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "expected finite number");
  }

  return value;
}

export function assertNullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  return assertNumber(value, path);
}

export function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    fail(path, "expected boolean");
  }

  return value;
}

export function assertStringArray(value: unknown, path: string): string[] {
  return assertArray(value, path, (item, indexPath) => assertString(item, indexPath));
}

export function assertNumberArray(value: unknown, path: string): number[] {
  return assertArray(value, path, (item, indexPath) => assertNumber(item, indexPath));
}

export function assertArray<T>(
  value: unknown,
  path: string,
  itemValidator: (item: unknown, path: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    fail(path, "expected array");
  }

  return value.map((item, index) => itemValidator(item, `${path}[${index}]`));
}

export function assertEnum<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
): T[number] {
  const text = assertString(value, path);
  if (!allowed.includes(text)) {
    fail(path, `expected one of ${allowed.join(", ")}`);
  }

  return text as T[number];
}

export function assertElementId(value: unknown, path: string): ElementId {
  return assertEnum(value, path, elementIds);
}

export function assertFusedElementId(value: unknown, path: string): FusedElementId {
  return assertEnum(value, path, fusedElementIds);
}

export function assertRecord<T>(
  value: unknown,
  path: string,
  itemValidator: (item: unknown, path: string, key: string) => T,
): Record<string, T> {
  const obj = assertPlainObject(value, path);
  const out: Record<string, T> = {};

  for (const [key, item] of Object.entries(obj)) {
    out[key] = itemValidator(item, `${path}.${key}`, key);
  }

  return out;
}

export function assertExactKeys(
  obj: Record<string, unknown>,
  path: string,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      fail(`${path}.${key}`, "missing required field");
    }
  }

  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) {
      fail(`${path}.${key}`, "unknown field");
    }
  }
}

export function assertElementRecord<T>(
  value: unknown,
  path: string,
  itemValidator: (item: unknown, path: string, key: ElementId) => T,
): Record<ElementId, T> {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, elementIds);

  const out = {} as Record<ElementId, T>;
  for (const key of elementIds) {
    out[key] = itemValidator(obj[key], `${path}.${key}`, key);
  }

  return out;
}

