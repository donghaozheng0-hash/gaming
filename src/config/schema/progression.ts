import {
  assertArray,
  assertExactKeys,
  assertNumber,
  assertPlainObject,
  assertString,
  requireField,
} from "./common";

export interface ProgressionConfig {
  featureUnlocks: FeatureUnlock[];
  contentModules: ContentModule[];
}

export interface FeatureUnlock {
  featureId: string;
  name: string;
  unlock: {
    realmId: string;
    layer: number | null;
  };
  description: string;
}

export interface ContentModule {
  moduleId: string;
  name: string;
  unlockRealmId: string;
  description: string;
}

export function validateProgressionConfig(value: unknown): ProgressionConfig {
  const obj = assertPlainObject(value, "progression");
  assertExactKeys(obj, "progression", ["featureUnlocks", "contentModules"]);

  return {
    featureUnlocks: assertArray(
      requireField(obj, "featureUnlocks", "progression"),
      "progression.featureUnlocks",
      validateFeatureUnlock,
    ),
    contentModules: assertArray(
      requireField(obj, "contentModules", "progression"),
      "progression.contentModules",
      validateContentModule,
    ),
  };
}

function validateFeatureUnlock(value: unknown, path: string): FeatureUnlock {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["featureId", "name", "unlock", "description"]);

  return {
    featureId: assertString(obj.featureId, `${path}.featureId`),
    name: assertString(obj.name, `${path}.name`),
    unlock: validateUnlock(obj.unlock, `${path}.unlock`),
    description: assertString(obj.description, `${path}.description`),
  };
}

function validateUnlock(value: unknown, path: string): FeatureUnlock["unlock"] {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["realmId", "layer"]);

  return {
    realmId: assertString(obj.realmId, `${path}.realmId`),
    layer: obj.layer === null ? null : assertNumber(obj.layer, `${path}.layer`),
  };
}

function validateContentModule(value: unknown, path: string): ContentModule {
  const obj = assertPlainObject(value, path);
  assertExactKeys(obj, path, ["moduleId", "name", "unlockRealmId", "description"]);

  return {
    moduleId: assertString(obj.moduleId, `${path}.moduleId`),
    name: assertString(obj.name, `${path}.name`),
    unlockRealmId: assertString(obj.unlockRealmId, `${path}.unlockRealmId`),
    description: assertString(obj.description, `${path}.description`),
  };
}

