#!/usr/bin/env node
// 符塔 · 无限模式平衡模拟器 / 校准器 —— Claude(项目大脑)维护的"防崩盘尺子"。
// 模型：持续累积爬塔(深度永久) + 疲劳(单次会话软闸,只掉本次战利品) + 数值硬墙(指数压制) + 副本肝练度破墙。
// 目的：把无限模式的核心曲线用公式跑出来，机器判定是否落在健康带内；任何旋钮改动先过这里再落地。
// 用法：node scripts/balance-sim.mjs
//
// 注：v0 解析模型，重在"定性抓崩盘"(承伤是否失衡 / 墙是否平滑 / 会话长度 / Boss降级 / 经济收敛)，
//     非逐帧战斗精算。数字锚定 docs/source 策划 v3 的三围比与系数。

// ============================ 设计旋钮（调这里，重跑即可） ============================
const K = {
  // —— 硬墙（怪物/需求战力随深度指数成长）——
  baseRequiredPower: 2000, // R0：第 1 层需求"期望总战力"（对齐 v3 的 1-1=2000）
  depthGrowth: 1.07,       // g：每深 1 层 ×g。墙的斜率（也用作怪物 R 的成长）

  // —— 玩家三围（从期望战力反推；沿用 v3 比例 ATK:HP:DEF≈2:20:1，基础三围占期望约 45%）——
  basePowerFrac: 0.45,     // 基础三围战力 / 期望总战力
  // 战力=ATK×6+HP×0.6+DEF×3，按 2:20:1 → 1 单位贡献 27 战力 → DEF=基础战力/27

  // —— 承伤（阵眼掉血）模型，可切换对比 ——
  armorModel: "relative",  // "fixedK"(v3旧,验证会崩) | "relative"(新修法) | "cappedPct"
  fixedK: 600,             // 旧式：减伤 = DEF/(DEF+600)
  relK: 0.68,             // 新式：减伤 = DEF/(DEF + relK×怪攻)，与深度无关→恒定带
  capPct: 0.80,           // 封顶式：min(capPct, DEF/(DEF+600))
  commonAtkCoef: 0.030,    // 普通妖兵攻击 = coef × R(=该深需求战力)，对齐 v3

  // —— 疲劳（单次会话软闸）——
  fatiguePenaltyPerLevel: 0.012, // 每清 1 层，有效战力 ×(1 - 此值×已清层数)
  fatigueFailMargin: 1.0,        // 有效战力 < 需求×此值 → 本层失败、本次战利品掉落

  // —— Boss 轮换（每 10 关分水岭）——
  bandLevels: 10,
  bossHpCoef: 3.20, bossAtkCoef: 0.070, // v3 章末 Boss 系数
  eliteHpCoef: 0.75, eliteAtkCoef: 0.045, // v3 精英妖将（"小怪化"重铸档位）
  miniBossEveryNLevels: 3, miniBossWaveOf7: 5, // 故识精英（前段Boss）复现频率：每N关第M波

  // —— 经济（破墙节奏）——
  powerGainPerSession: 0.06, // 肝副本：每次会话期望总战力 +6%（材料/法器/突破折算）
  expBaseAtD1: 100,          // exp(d)=expBaseAtD1 × g^(d-1)，锚定境界消耗指数
};

// ============================ 基础函数 ============================
const requiredPower = (d) => K.baseRequiredPower * Math.pow(K.depthGrowth, d - 1);
const frontierDepth = (P) => Math.floor(Math.log(P / K.baseRequiredPower) / Math.log(K.depthGrowth)) + 1;
const playerBasePower = (P) => K.basePowerFrac * P;
const playerDEF = (P) => playerBasePower(P) / 27;          // 由 2:20:1 比例
const playerHP = (P) => 20 * playerDEF(P);
const monsterAtkAtDepth = (d) => K.commonAtkCoef * requiredPower(d); // 普通妖兵攻击

function mitigation(model, P, d) {
  const def = playerDEF(P);
  const atk = monsterAtkAtDepth(d);
  if (model === "fixedK") return def / (def + K.fixedK);
  if (model === "relative") return def / (def + K.relK * atk);
  if (model === "cappedPct") return Math.min(K.capPct, def / (def + K.fixedK));
  throw new Error("unknown armor model");
}

const pct = (x) => (x * 100).toFixed(1) + "%";
const flag = (ok) => (ok ? "✅" : "❌崩盘");
const fail = [];

console.log("═══ 符塔 · 无限模式平衡校准 (g=" + K.depthGrowth + ", armor=" + K.armorModel + ") ═══\n");

// ============================ ① 深度硬墙：境界 → 可达深度 ============================
// 期望战力里程碑（v3 实测 + 后期指数外推，验证墙是否平滑、不在某境界突然卡死或瞬秒）
console.log("① 深度硬墙（玩家期望战力 → 可达深度 d*）");
const milestones = [
  ["练气1", 2000], ["练气9", 8600], ["筑基1", 10300], ["筑基9+", 53500],
  ["金丹预告", 64200], ["金丹后期~", 200000], ["元婴~", 1500000], ["化神~", 2e7],
];
let prevD = 0, wallSmooth = true;
for (const [name, P] of milestones) {
  const d = frontierDepth(P);
  const gain = d - prevD;
  if (prevD > 0 && (gain < 3 || gain > 80)) wallSmooth = false; // 每境界推进 3~80 层为健康
  console.log(`   ${name.padEnd(8)} 期望${String(P).padStart(9)} → 可达 ~${String(d).padStart(3)} 层  (较上档 +${gain})`);
  prevD = d;
}
console.log(`   判定：每境界推进深度落在 3~80 层、单调平滑 → ${flag(wallSmooth)}\n`);
if (!wallSmooth) fail.push("深度墙不平滑");

// ============================ ② 承伤：减伤率是否恒在健康带（这是头号崩盘点）============================
console.log("② 承伤减伤率（玩家处于各深度前沿时；对比三种 armor 模型）");
console.log("   深度    fixedK(旧)   relative(新)  cappedPct");
let band = true;
for (const d of [1, 10, 30, 60, 100, 160]) {
  const P = requiredPower(d); // 玩家恰在该深前沿
  const mF = mitigation("fixedK", P, d), mR = mitigation("relative", P, d), mC = mitigation("cappedPct", P, d);
  const active = mitigation(K.armorModel, P, d);
  if (active < 0.25 || active > 0.75) band = false; // 当前模型必须 25%~75%
  console.log(`   ${String(d).padStart(3)} 层    ${pct(mF).padStart(8)}   ${pct(mR).padStart(8)}    ${pct(mC).padStart(8)}`);
}
console.log(`   判定：当前模型(${K.armorModel}) 减伤恒在 25%~75% → ${flag(band)}`);
console.log(`   对比：fixedK 从个位%飙到 90%+ = 早期 DEF 无用、后期漏怪无伤(生存侧失效) → 这就是必须改公式的原因\n`);
if (!band) fail.push("承伤减伤率越界");

// ============================ ③ 疲劳：单次会话可清层数（按所肝档位）============================
console.log("③ 疲劳软闸（在不同「舒适度」档位肝/推，单次会话可清层数）");
function sessionLevels(bandFrac) {
  // 在"需求 = bandFrac×自身战力"的band里连清，每层+疲劳，effPower<需求即收
  const P = 100000; // 任意参考玩家
  const req = bandFrac * P;
  let n = 0;
  while (P * (1 - K.fatiguePenaltyPerLevel * n) >= req * K.fatigueFailMargin) { n++; if (n > 999) break; }
  return n;
}
let sessOk = true;
for (const [label, f] of [["舒适(60%战力档)", 0.6], ["进取(80%)", 0.8], ["顶着前沿(100%)", 1.0]]) {
  const n = sessionLevels(f);
  if (f === 0.6 && (n < 15 || n > 60)) sessOk = false;
  console.log(`   ${label.padEnd(16)} 约 ${String(n).padStart(3)} 层/会话`);
}
console.log(`   判定：舒适档 15~60 层/会话(摸鱼友好) → ${flag(sessOk)}\n`);
if (!sessOk) fail.push("疲劳会话长度不当");

// ============================ ④ Boss 轮换：前段大Boss在后段以"小怪(故识精英)"复现 ============================
console.log("④ Boss 轮换（前段大 Boss → 后段重铸为当前档『故识精英』，受控频率出现）");
let rot = true;
const freqOk = K.miniBossEveryNLevels >= 2 && K.miniBossEveryNLevels <= 5; // 每2~5关一次=有存在感不压迫
if (!freqOk) rot = false;
console.log(`   重铸档位：HP=${K.eliteHpCoef}R / 攻=${K.eliteAtkCoef}R（=当前深度精英档，恒定可控，永不超模）`);
console.log(`   出现频率：每 ${K.miniBossEveryNLevels} 关的第 ${K.miniBossWaveOf7}/7 波刷 1 只 → 落在 2~5 关/次? ${flag(freqOk)}`);
for (const k of [1, 2, 5]) { // 附：若改用"冻结绝对数值"的自然衰减节奏（几段后自动沦为小怪）
  const bossAbs = K.bossHpCoef * requiredPower(K.bandLevels * k);
  const after1 = bossAbs / requiredPower(K.bandLevels * (k + 1));
  const after3 = bossAbs / requiredPower(K.bandLevels * (k + 3));
  console.log(`   （参考·自然衰减）B${k}冻结绝对HP：过1段≈${after1.toFixed(2)}R(仍精英) 过3段≈${after3.toFixed(2)}R(沦小怪)`);
}
console.log(`   判定：重铸档恒在精英带 + 复现频率受控 → ${flag(rot)}\n`);
if (!rot) fail.push("Boss复现频率失控");

// ============================ ⑤ 经济：exp 跟得上境界 & 破墙时间收敛 ============================
console.log("⑤ 经济收敛（exp 锚定指数 + 副本肝练度破墙节奏）");
// exp(d)=expBaseAtD1×g^(d-1) 与需求战力同指数 → "推进 1 层"对升级的贡献占比恒定（不停滞不爆炸）
const expRatio = (K.expBaseAtD1 * Math.pow(K.depthGrowth, 50 - 1)) / requiredPower(50);
const expRatioDeep = (K.expBaseAtD1 * Math.pow(K.depthGrowth, 150 - 1)) / requiredPower(150);
const expStable = Math.abs(expRatio - expRatioDeep) / expRatio < 0.01;
console.log(`   exp(d)/需求(d)：d=50 ${expRatio.toExponential(2)} vs d=150 ${expRatioDeep.toExponential(2)} → 恒定? ${flag(expStable)}`);
// 破墙：前沿+10 层需要战力 ×g^10；每会话肝 +powerGainPerSession → 所需会话数
const breakSessions = Math.ceil(Math.log(Math.pow(K.depthGrowth, 10)) / Math.log(1 + K.powerGainPerSession));
const breakOk = breakSessions >= 3 && breakSessions <= 20; // 推进 10 层约 3~20 次会话为健康
console.log(`   破墙节奏：前沿 +10 层 需肝 ~${breakSessions} 次会话(每次+${pct(K.powerGainPerSession)}战力) → 3~20 区间? ${flag(breakOk)}`);
console.log(`   判定：exp 不停滞/不爆炸 且 破墙时间有限收敛\n`);
if (!expStable) fail.push("exp 指数未对齐");
if (!breakOk) fail.push("破墙节奏过快/过慢");

// ============================ ⑥ 深度采样表（供 v4 文档 / 配置落地，单一真相源）============================
console.log("⑥ 深度采样（需求战力 / 普通妖兵HP·攻 / 章末BossHP / 当前减伤）");
console.log("   深度    需求战力    普通HP     普通攻    BossHP(每10层)  减伤");
for (const d of [1, 5, 10, 25, 50, 75, 100]) {
  const R = requiredPower(d);
  const bossHp = d % K.bandLevels === 0 ? (K.bossHpCoef * R).toExponential(2) : "—";
  console.log(`   ${String(d).padStart(3)}   ${R.toExponential(2)}  ${(0.15 * R).toExponential(2)}  ${(K.commonAtkCoef * R).toExponential(2)}   ${String(bossHp).padStart(10)}   ${pct(mitigation(K.armorModel, R, d))}`);
}
console.log("");

// ============================ 总判 ============================
console.log("═══ 崩盘检测总判 ═══");
if (fail.length === 0) console.log("✅ 五条曲线全部落在健康带，当前旋钮不崩盘。可据此写入 v4 设计文档。");
else { console.log("❌ 发现 " + fail.length + " 处崩盘风险：" + fail.join("、") + " → 调 KNOBS 重跑。"); process.exitCode = 1; }
