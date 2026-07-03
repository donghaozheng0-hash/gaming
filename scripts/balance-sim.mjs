#!/usr/bin/env node
// 符塔 · 无限模式平衡模拟器 / 校准器 —— Claude(项目大脑)维护的"防崩盘尺子"(CLI 门禁入口)。
// 模型：持续累积爬塔(深度永久) + 疲劳(单次会话软闸,只掉本次战利品) + 数值硬墙(指数压制) + 副本肝练度破墙。
// 目的：把无限模式的核心曲线用公式跑出来，机器判定是否落在健康带内；任何旋钮改动先过这里再落地。
// 用法：node scripts/balance-sim.mjs
//
// 单一真相源(2026-07-03 重构)：数值不再写在本文件 KNOBS,而是从 src/config/*.json 读取
// 经 deriveKnobs 派生——配置即真相,消除"KNOBS↔配置人肉同步"技术债(docs/TECH_DEBT.md #2)。
// 算法全部在 scripts/balance-core.mjs(平台无关数值核,浏览器 dev 调参面板共用同一份)。
//
// 注：v0 解析模型，重在"定性抓崩盘"(承伤是否失衡 / 墙是否平滑 / 会话长度 / Boss降级 / 经济收敛)，
//     非逐帧战斗精算。数字锚定 docs/source 策划 v3 的三围比与系数。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKnobs, runBalanceModel } from "./balance-core.mjs";

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "config");
const readTable = (name) => JSON.parse(readFileSync(join(configDir, `${name}.json`), "utf8"));

const K = deriveKnobs({
  balance: readTable("balance"),
  infinite: readTable("infinite"),
  fatigue: readTable("fatigue"),
  monsters: readTable("monsters"),
  waves: readTable("waves"),
  runes: readTable("runes"),
});

const report = runBalanceModel(K);
console.log(report.lines.join("\n"));
if (!report.ok) process.exitCode = 1;
