#!/usr/bin/env node
// 配置层完整性门禁 —— 底层逻辑三（数值与代码隔离）的"数据侧"机器化执行。
// 与 check-isolation.mjs（代码侧）互补：本门禁只看纯数据，不依赖 Codex 的 ConfigService。
// 职责：1) 14 张配置表必须齐全且为合法 JSON；2) 独立重算 levels 的交叉引用
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

// 契约钉死：14 张表（T1 建 11 张 + T9 增 infinite/dungeons/fatigue 3 张；与 acceptance/contracts.json 各任务 DoD 累计一致）
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
  "infinite",
  "dungeons",
  "fatigue",
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

// —— T6 战斗闭环数据侧(独立重算,不信任业务加载器)——
// 覆盖:玩家三围推导 / R1 相生两档 / R3 开格补偿 / R6 策略词条 / 波次怪引用 / onDeath 分裂引用 / R2 模板 override。
const t6Violations = [];
const t6 = (ok, where, msg) => { if (!ok) t6Violations.push({ where, msg }); };
const dataOf = (name) => {
  const t = tables[name];
  return t.present && !t.parseError ? t.data : null;
};

{
  const balance = dataOf("balance");
  if (balance) {
    const pd = balance.playerDerivation;
    t6(!!pd, "balance.playerDerivation", "缺失(阵眼三围推导与 balance-sim 同源座位)");
    if (pd) {
      t6(typeof pd.basePowerFrac === "number" && pd.basePowerFrac > 0 && pd.basePowerFrac < 1,
        "balance.playerDerivation.basePowerFrac", `必须∈(0,1),得到 ${pd.basePowerFrac}`);
      for (const key of ["atk", "hp", "def"]) {
        t6(typeof pd.statRatio?.[key] === "number" && pd.statRatio[key] > 0,
          `balance.playerDerivation.statRatio.${key}`, "必须为正数");
      }
    }
    const xs = balance.damageFormula?.xiangshengMultipliers;
    t6(typeof xs?.presence === "number", "balance.damageFormula.xiangshengMultipliers.presence", "缺失(R1 同场弱相生档)");
    if (typeof xs?.presence === "number") {
      t6(xs.presence >= 1 && xs.presence <= xs.generated,
        "balance.damageFormula.xiangshengMultipliers", `两档必须有序 1 ≤ presence(${xs.presence}) ≤ generated(${xs.generated})`);
    }
    const adjacency = balance.battle?.xiangshengAdjacencyMaxCanvasUnits;
    t6(typeof adjacency === "number" && adjacency > 0,
      "balance.battle.xiangshengAdjacencyMaxCanvasUnits", "缺失或非正数(R1 相邻判定距离)");
  }

  const infinite = dataOf("infinite");
  const maps = dataOf("maps");
  if (infinite && maps) {
    const comp = infinite.lootCompensation?.byOpenSlotCount;
    t6(!!comp, "infinite.lootCompensation.byOpenSlotCount", "缺失(R3 开格风险补偿表)");
    const range = maps.randomization?.openSlotCountRange;
    if (comp && range) {
      for (let n = range.min; n <= range.max; n++) {
        t6(typeof comp[String(n)] === "number", `infinite.lootCompensation.byOpenSlotCount.${n}`,
          "全局开格范围内的每个格数都必须有补偿键");
      }
      t6(comp[String(range.max)] === 1, `infinite.lootCompensation.byOpenSlotCount.${range.max}`,
        "最大开格数=基准局,倍率必须恒为 1");
      for (const [k, v] of Object.entries(comp)) {
        t6(typeof v === "number" && v >= 1, `infinite.lootCompensation.byOpenSlotCount.${k}`,
          "R3 是奖励补偿,倍率不得 < 1");
      }
    }
  }

  const runes = dataOf("runes");
  if (runes && Array.isArray(runes.runes)) {
    for (const rune of runes.runes) {
      t6(typeof rune.targetingStrategyId === "string" && rune.targetingStrategyId.length > 0,
        `runes.${rune.id}.targetingStrategyId`, "缺失或为空(R6 目标策略词条 id)");
    }
  }

  const monsters = dataOf("monsters");
  if (monsters && Array.isArray(monsters.monsters) && monsterIds) {
    for (const monster of monsters.monsters) {
      if (monster.onDeath) {
        t6(monsterIds.has(monster.onDeath.spawnMonsterId),
          `monsters.${monster.id}.onDeath.spawnMonsterId`, `引用不存在的怪 "${monster.onDeath.spawnMonsterId}"`);
        t6(typeof monster.onDeath.count === "number" && monster.onDeath.count >= 1,
          `monsters.${monster.id}.onDeath.count`, "分裂数量必须 ≥1");
        t6(typeof monster.onDeath.hpCoefficientR === "number" && monster.onDeath.hpCoefficientR > 0,
          `monsters.${monster.id}.onDeath.hpCoefficientR`, "子怪血量系数必须为正数");
      }
    }
  }

  const waves = dataOf("waves");
  if (waves && Array.isArray(waves.waveTemplates) && monsterIds) {
    for (const template of waves.waveTemplates) {
      for (const wave of template.waves ?? []) {
        for (const [i, entry] of (wave.entries ?? []).entries()) {
          for (const mid of entry.monsterPoolIds ?? []) {
            t6(monsterIds.has(mid),
              `waves.${template.id}[${wave.index}].entries[${i}]`, `monsterPoolIds 引用不存在的怪 "${mid}"`);
          }
        }
      }
    }
  }

  if (maps) {
    const globalRange = maps.randomization?.openSlotCountRange;
    for (const pool of maps.mapPools ?? []) {
      for (const template of pool.pathTemplates ?? []) {
        const override = template.openSlotCountRange;
        if (override) {
          t6(Number.isInteger(override.min) && Number.isInteger(override.max) && override.min >= 1 && override.min <= override.max,
            `maps.${template.id}.openSlotCountRange`, "override 必须满足 1 ≤ min ≤ max(整数)");
          t6((template.candidateSlots ?? []).length >= override.max + 2,
            `maps.${template.id}.candidateSlots`, "候选格必须 ≥ override.max + 2");
          // override 范围内的每个可能格数也必须被 R3 补偿表覆盖(否则运行时静默回退 ×1)。
          const comp = infinite?.lootCompensation?.byOpenSlotCount;
          if (comp) {
            for (let n = override.min; n <= override.max; n++) {
              t6(typeof comp[String(n)] === "number", `infinite.lootCompensation.byOpenSlotCount.${n}`,
                `模板 ${template.id} 的 override 范围内每个格数都必须有补偿键(缺 ${n})`);
            }
          }
        }
        // 裁定 R2 独立重算:多路线模板双路分兵,开格下限必须 ≥3(经 override 显式声明)。
        if ((template.routeCount ?? 1) > 1) {
          const effectiveMin = override?.min ?? globalRange?.min;
          t6(!!override && effectiveMin >= 3,
            `maps.${template.id}`, `routeCount=${template.routeCount} 的模板必须声明 openSlotCountRange override 且 min ≥ 3(裁定 R2),当前 min=${effectiveMin}`);
        }
      }
    }
  }
}

// —— T7 局内成长与画符/融合数据侧(独立重算,不信任业务加载器)——
// 覆盖:画符评分三档有序 / 灵机发放与上限自洽 / 融合配方=五行且与消耗一致 / 克制系数方向 /
// runes.effects 与 trait 文案抽查锚 / bonus_vs_tag 引用真实怪 tag / 首测三元素开放。
{
  const balance = dataOf("balance");
  const fusion = dataOf("fusion");
  const runes = dataOf("runes");
  const monsters = dataOf("monsters");
  const FIVE = ["metal", "wood", "water", "fire", "earth"];

  if (balance) {
    const draw = balance.damageFormula?.drawBonus;
    t6(!!draw, "balance.damageFormula.drawBonus", "缺失(画符 2.7 三档)");
    if (draw) {
      t6(draw.partialMinScore < draw.fullScore && draw.fullScore < draw.perfectScore,
        "balance.damageFormula.drawBonus", `三档必须有序 partial(${draw.partialMinScore}) < full(${draw.fullScore}) < perfect(${draw.perfectScore})`);
      t6(typeof draw.fullBonus === "number" && draw.fullBonus > 0 && draw.fullBonus <= 0.5,
        "balance.damageFormula.drawBonus.fullBonus", "满额加成必须∈(0,0.5](设计=0.2)");
    }
    const battle = balance.battle;
    if (battle) {
      const waves = battle.lingjiGrantWaves ?? [];
      t6(Array.isArray(waves) && waves.length === battle.maxLingjiPointsPerRun,
        "balance.battle.lingjiGrantWaves", `发放波数量(${waves.length})必须=每局上限(${battle.maxLingjiPointsPerRun})`);
      t6(waves.every((w) => Number.isInteger(w) && w >= 1 && w <= battle.wavesPerLevel),
        "balance.battle.lingjiGrantWaves", `每个发放波必须∈[1,${battle.wavesPerLevel}]`);
      const drop = battle.elementEssenceDrop;
      t6(!!drop && (drop.guaranteedWaves ?? []).every((w) => w >= 1 && w <= battle.wavesPerLevel)
        && drop.extraDropChance > 0 && drop.extraDropChance < 1,
        "balance.battle.elementEssenceDrop", "保底波须在波次范围内且额外概率∈(0,1)");
      t6(typeof battle.runeUpgradeAttackGrowthPerLevel === "number" && battle.runeUpgradeAttackGrowthPerLevel === 0.15,
        "balance.battle.runeUpgradeAttackGrowthPerLevel", "灵机升级每级 +15%(设计 2.8 钉死)=0.15");
    }
  }

  if (fusion) {
    for (const recipe of fusion.recipes ?? []) {
      const where = `fusion.recipes.${recipe.id}`;
      const base = recipe.baseElements ?? [];
      t6(base.length === 2 && base.every((e) => FIVE.includes(e)),
        `${where}.baseElements`, "配方必须恰为两个五行元素");
      const essenceKeys = Object.keys(recipe.cost?.essences ?? {}).sort();
      t6(JSON.stringify(essenceKeys) === JSON.stringify([...base].sort()),
        `${where}.cost.essences`, "消耗精族必须与配方元素一致(2.9)");
      t6(recipe.cost?.lingjiPoints === 1, `${where}.cost.lingjiPoints`, "融合固定消耗 1 灵机点(6.5)");
      t6(recipe.advantage?.multiplier > 1, `${where}.advantage.multiplier`, "克制系数必须 > 1");
      t6(recipe.disadvantage?.multiplier < 1, `${where}.disadvantage.multiplier`, "被克系数必须 < 1");
    }
    const firstStage = (fusion.unlockSchedule ?? [])[0];
    const firstIds = new Set(firstStage?.recipeIds ?? firstStage?.elements ?? []);
    t6(["thunder", "ice", "poison"].every((id) => firstIds.has(id)),
      "fusion.unlockSchedule[0]", "首测开放必须恰含雷/冰/毒(6.5 开放节奏)");
  }

  if (runes && monsters) {
    const byId = new Map((runes.runes ?? []).map((r) => [r.id, r]));
    const allTags = new Set((monsters.monsters ?? []).flatMap((m) => m.tags ?? []));
    // trait 文案 ↔ effects 抽查锚(独立字面量,防数据化时抄错):
    const spot = (id, pick, expect, label) => {
      const rune = byId.get(id);
      const effect = (rune?.effects ?? []).find(pick);
      t6(!!effect && Object.entries(expect).every(([k, v]) => effect[k] === v),
        `runes.${id}.effects`, `${label} 必须与 trait 文案一致(${JSON.stringify(expect)})`);
    };
    spot("qing_teng", (e) => e.kind === "slow", { slowPct: 45, durationSeconds: 2 }, "青藤减速");
    spot("liao_yuan", (e) => e.kind === "aoe", { radiusUnits: 90, maxTargets: 5 }, "燎原范围");
    spot("zhan_jin", (e) => e.kind === "shield_damage_multiplier", { multiplier: 1.6 }, "斩金破盾");
    spot("bing_leng", (e) => e.kind === "pierce", { targetCount: 3 }, "冰棱穿透");
    for (const rune of runes.runes ?? []) {
      for (const effect of rune.effects ?? []) {
        if (effect.kind === "bonus_vs_tag") {
          t6(allTags.has(effect.tag), `runes.${rune.id}.effects.bonus_vs_tag`,
            `tag "${effect.tag}" 必须真实存在于 monsters 的 tags(现有:${[...allTags].join(",")})`);
        }
      }
      t6((rune.drawTemplate ?? []).length >= 3, `runes.${rune.id}.drawTemplate`, "笔迹模板至少 3 点");
    }
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
      t6Violations,
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

if (t6Violations.length) {
  failed = true;
  console.error(
    `\n[config] FAIL - ${t6Violations.length} 处 T6 战斗闭环数据违规（playerDerivation/R1/R2/R3/R6/波次与分裂引用）：`,
  );
  for (const v of t6Violations.slice(0, 50)) console.error(`  ${v.where}: ${v.msg}`);
  if (t6Violations.length > 50)
    console.error(`  ... 其余 ${t6Violations.length - 50} 处见 reports/config.json`);
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
