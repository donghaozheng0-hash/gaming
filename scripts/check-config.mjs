#!/usr/bin/env node
// 配置层完整性门禁 —— 底层逻辑三（数值与代码隔离）的"数据侧"机器化执行。
// 与 check-isolation.mjs（代码侧）互补：本门禁只看纯数据，不依赖 Codex 的 ConfigService。
// 职责：1) 11 张配置表必须齐全且为合法 JSON；2) 独立重算 levels 的交叉引用
//        (monsters/waves/maps/rune 必须可解析) —— 不信任业务加载器，直接验数据本身。
// 配置：表清单与引用边写死在本文件（属验收尺子，由 Claude 维护，Codex 不得修改）。
// 语义：配置层一张表都没有 -> PENDING(不阻塞，T1 未起步)；起步后缺表/坏引用 -> FAIL。
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const configDir = resolve(root, "src/config");

// 契约钉死：11 张表（与 acceptance/contracts.json T1.definitionOfDone 一致）
const TABLES = [
  "balance",
  "runes",
  "monsters",
  "levels",
  "waves",
  "maps",
  "fusion",
  "cultivation",
  "economy",
  "progression",
  "visual",
];

function loadTable(name) {
  const path = resolve(configDir, `${name}.json`);
  if (!existsSync(path)) return { name, present: false };
  try {
    return { name, present: true, data: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    return { name, present: true, parseError: e.message };
  }
}

const tables = Object.fromEntries(TABLES.map((t) => [t, loadTable(t)]));

const presentCount = TABLES.filter((t) => tables[t].present).length;
const missing = TABLES.filter((t) => !tables[t].present);
const parseErrors = TABLES.filter((t) => tables[t].parseError).map((t) => ({
  table: t,
  error: tables[t].parseError,
}));

// —— 交叉引用：独立从数据重算 DoD#3 点名的四条边（levels -> monsters/waves/maps/rune）——
// 安全取 id 集合；源表缺失/坏掉时返回 null，由"缺表/坏 JSON"分支单独报，避免重复噪声。
function idSet(tbl, pick) {
  const t = tables[tbl];
  if (!t.present || t.parseError || !t.data) return null;
  try {
    const arr = pick(t.data);
    if (!Array.isArray(arr)) return null;
    return new Set(arr.map((x) => x && x.id).filter((x) => typeof x === "string"));
  } catch {
    return null;
  }
}

const monsterIds = idSet("monsters", (d) => d.monsters);
const waveIds = idSet("waves", (d) => d.waveTemplates);
const mapIds = idSet("maps", (d) => d.mapPools);
const runeIds = idSet("runes", (d) => d.runes);

const refViolations = [];
function checkRef(setObj, value, where) {
  if (setObj === null) return; // 源表缺失/坏，已在别处报
  if (!setObj.has(value)) refViolations.push({ where, missingRef: value });
}

const levelsTbl = tables.levels;
if (levelsTbl.present && !levelsTbl.parseError && Array.isArray(levelsTbl.data?.levels)) {
  for (const lvl of levelsTbl.data.levels) {
    const lid = (lvl && lvl.id) || "<no-id>";
    if (lvl?.waveTemplateId !== undefined)
      checkRef(waveIds, lvl.waveTemplateId, `levels.${lid}.waveTemplateId`);
    if (lvl?.mapPoolId !== undefined)
      checkRef(mapIds, lvl.mapPoolId, `levels.${lid}.mapPoolId`);
    if (Array.isArray(lvl?.enemyGroups))
      lvl.enemyGroups.forEach((g, i) => {
        if (g?.monsterId !== undefined)
          checkRef(monsterIds, g.monsterId, `levels.${lid}.enemyGroups[${i}].monsterId`);
      });
    if (Array.isArray(lvl?.runeUnlockIds))
      lvl.runeUnlockIds.forEach((rid, i) => {
        checkRef(runeIds, rid, `levels.${lid}.runeUnlockIds[${i}]`);
      });
  }
}

mkdirSync(resolve(root, "reports"), { recursive: true });
writeFileSync(
  resolve(root, "reports/config.json"),
  JSON.stringify(
    {
      tablesExpected: TABLES.length,
      tablesPresent: presentCount,
      tablesMissing: missing,
      parseErrors,
      refViolations,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

// 一张表都没有 = 配置层尚未起步，PENDING 不阻塞
if (presentCount === 0) {
  console.log(
    "[config] PENDING - 配置层 src/config 尚未建立任何数据表，本门禁待 Codex 落地后生效。",
  );
  process.exit(0);
}

let failed = false;

if (missing.length) {
  failed = true;
  console.error(
    `\n[config] FAIL - 缺少 ${missing.length}/${TABLES.length} 张配置表：${missing
      .map((m) => `${m}.json`)
      .join(", ")}`,
  );
}

if (parseErrors.length) {
  failed = true;
  console.error(`\n[config] FAIL - ${parseErrors.length} 张表 JSON 解析失败：`);
  for (const p of parseErrors) console.error(`  ${p.table}.json: ${p.error}`);
}

if (refViolations.length) {
  failed = true;
  console.error(
    `\n[config] FAIL - ${refViolations.length} 处交叉引用悬空（levels 引用了不存在的 monster/wave/map/rune）：`,
  );
  for (const v of refViolations.slice(0, 50))
    console.error(`  ${v.where} -> 引用不存在的 "${v.missingRef}"`);
  if (refViolations.length > 50)
    console.error(`  ... 其余 ${refViolations.length - 50} 处见 reports/config.json`);
}

if (failed) {
  console.error(
    `\n修复方式：补齐缺失数据表 / 修正 JSON / 让 levels 的引用指向真实存在的 id。本门禁是验收尺子(Claude 维护)，不要改它来"过关"。`,
  );
  process.exit(1);
}

console.log(
  `[config] PASS - ${presentCount}/${TABLES.length} 张表齐全且 JSON 合法，levels 交叉引用全部可解析。`,
);
process.exit(0);
