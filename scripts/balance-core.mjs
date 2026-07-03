// 符塔 · 平衡模拟器数值核 —— Claude(项目大脑)维护的"防崩盘尺子"核心(Codex 只读)。
// 平台无关纯函数：CLI 门禁(scripts/balance-sim.mjs)与浏览器 dev 调参面板共用同一算法。
// 单一真相源：全部游戏数值经 deriveKnobs 从 src/config/*.json 派生——本文件不写运行时数值,
// 只保留"仿真剧本"参数(采样点/里程碑/健康带阈值,游戏运行时不读)与判定逻辑。
// 禁用 Date/Math.random：确定性纯计算,同输入必同输出。

// ============================ 仿真剧本(非运行时数值,尺子判定用) ============================
export const SIM_SCRIPT = {
  // 经济假设：肝副本每次会话期望总战力 +6%(材料/法器/突破折算)。运行时无此概念,纯破墙节奏假设。
  powerGainPerSession: 0.06,
  // 境界 → 期望战力里程碑(v3 实测 + 后期指数外推),验证墙是否平滑
  milestones: [
    ["练气1", 2000], ["练气9", 8600], ["筑基1", 10300], ["筑基9+", 53500],
    ["金丹预告", 64200], ["金丹后期~", 200000], ["元婴~", 1500000], ["化神~", 2e7],
  ],
  sessionRefPower: 100000, // 疲劳会话仿真的任意参考玩家战力
  sessionBands: [["舒适(60%战力档)", 0.6], ["进取(80%)", 0.8], ["顶着前沿(100%)", 1.0]],
  mitigationSampleDepths: [1, 10, 30, 60, 100, 160],
  depthSampleTable: [1, 5, 10, 25, 50, 75, 100],
  bossFreezeRefBands: [1, 2, 5],
  // 健康带(判定阈值,尺子的"绿区")
  bands: {
    wallStepMin: 3, wallStepMax: 80,          // 每境界推进层数
    mitigationMin: 0.25, mitigationMax: 0.75, // 减伤率恒定带
    comfortSessionMin: 15, comfortSessionMax: 60, // 舒适档层/会话
    bossRecurMin: 2, bossRecurMax: 5,         // 故识精英复现频率(关/次)
    breakSessionsMin: 3, breakSessionsMax: 20, // 破墙 +10 层所需会话数
    expStableTolerance: 0.01,                 // exp/需求 比值恒定容差
  },
  // ⑦ 单局战斗容量剧本(T6:开放格 2-3 稀缺化后的输出容量 vs 波次怪流需求)。
  // 摆位假设与 AOE 折算是"下限估计"剧本参数,非运行时数值;真机埋点后校准(v3 第八部分)。
  capacity: {
    waveTemplateId: "normal_7_wave",
    loadoutByOpenSlots: { 2: ["output", "utility"], 3: ["output", "output", "utility"] },
    outputRuneIds: ["fen_tian", "zhan_jin", "wan_ren", "bing_leng", "liao_yuan", "luo_yan"],
    utilityRuneIds: ["qing_teng", "han_quan", "hui_chun", "zhen_yue"],
    aoeRuneIds: ["liao_yuan", "luo_yan", "wan_ren", "bing_leng"], // 多目标/穿透/多段:密集波有效 DPS 高于名义
    aoeCrowdFactor: 2.0,               // 密集波 AOE 有效目标折算(保守取 2;燎原半径90 vs 怪间距35-55)
    denseWaveIntervalMaxSeconds: 1.0,  // 出怪间隔 ≤ 此值视为密集波
    presencePerceptionMin: 1.05,       // R1 同场弱相生的可感知下限
    bands: {
      n2WaveRatioMin: 0.9,   // 2格局逐波压力比下限(最凶波允许贴线漏怪,阵眼血=设计内容错)
      n3WaveRatioMin: 1.15,  // 3格局逐波压力比下限(必须有真实冗余)
      n3AvgRatioMax: 3.0,    // 3格局全波均值上限(过高=无聊)
      compensationMin: 1.15, // R3 补偿可感知下限
    },
  },
};

// ============================ 配置 → 旋钮(单一真相源) ============================
// tables = { balance, infinite, fatigue, monsters, waves, runes } —— 由调用方注入(CLI 读文件 / 浏览器 import)。
// 不一致即抛错(工程纪律七:失败快而响),防止配置表间数值漂移。
export function deriveKnobs(tables) {
  const { balance, infinite, fatigue, monsters, waves, runes } = tables;
  if (!balance || !infinite || !fatigue || !monsters || !waves || !runes) {
    throw new Error("deriveKnobs 缺表:需要 { balance, infinite, fatigue, monsters, waves, runes }");
  }

  const tower = balance.progressionCurves.endlessTower;
  const derive = balance.playerDerivation;
  const weights = balance.powerFormula;
  const coef = infinite.monsterCoefficients;
  const rotation = infinite.bossRotation;

  const monsterById = new Map(monsters.monsters.map((m) => [m.id, m]));
  const mustMatch = (label, a, b) => {
    if (a !== b) throw new Error(`配置交叉校验失败:${label} 两处不一致(${a} ≠ ${b})——单一真相源被破坏`);
  };

  // 同一数值出现在多张表时,必须逐字节相等(防"人肉同步"漂移复发)
  mustMatch("深度成长 g(balance.endlessTower ↔ infinite.depthWall)", tower.exponentBase, infinite.depthWall.depthGrowth);
  mustMatch("首层需求战力 R0(balance.endlessTower ↔ infinite.depthWall)", tower.basePower, infinite.depthWall.baseRequiredPower);
  mustMatch("exp 成长指数(infinite.experience.growth ↔ 深度成长 g)", infinite.experience.growth, tower.exponentBase);
  mustMatch("普通怪 HP 系数(infinite ↔ monsters.normal_yaobing)", coef.commonHp, monsterById.get("normal_yaobing")?.hpCoefficientR);
  mustMatch("普通怪攻系数(infinite ↔ monsters.normal_yaobing)", coef.commonAtk, monsterById.get("normal_yaobing")?.attackCoefficientR);
  mustMatch("Boss HP 系数(infinite ↔ monsters.chapter_boss)", coef.bossHp, monsterById.get("chapter_boss")?.hpCoefficientR);
  mustMatch("Boss 攻系数(infinite ↔ monsters.chapter_boss)", coef.bossAtk, monsterById.get("chapter_boss")?.attackCoefficientR);
  mustMatch("精英 HP 系数(infinite ↔ monsters.elite_yaojiang)", coef.eliteHp, monsterById.get("elite_yaojiang")?.hpCoefficientR);
  mustMatch("精英攻系数(infinite ↔ monsters.elite_yaojiang)", coef.eliteAtk, monsterById.get("elite_yaojiang")?.attackCoefficientR);

  // 三围比 → 单位战力:1 单位(atk:hp:def)贡献 = atk×atkW + hp×hpW + def×defW(替代旧写死的 27)
  const ratio = derive.statRatio;
  const powerPerStatUnit = ratio.atk * weights.atkWeight + ratio.hp * weights.hpWeight + ratio.def * weights.defWeight;

  // ⑦ 容量曲线的数据输入:波次模板 + 全量怪/符(战斗侧真相同源)
  const waveTemplate = waves.waveTemplates.find((t) => t.id === SIM_SCRIPT.capacity.waveTemplateId);
  if (!waveTemplate) throw new Error(`waves.json 缺容量剧本所需模板 ${SIM_SCRIPT.capacity.waveTemplateId}`);
  mustMatch("每关波数(balance.battle.wavesPerLevel ↔ 波次模板实际波数)", balance.battle.wavesPerLevel, waveTemplate.waves.length);
  const runesById = new Map(runes.runes.map((r) => [r.id, r]));
  for (const id of [...SIM_SCRIPT.capacity.outputRuneIds, ...SIM_SCRIPT.capacity.utilityRuneIds]) {
    if (!runesById.has(id)) throw new Error(`容量剧本引用的符 ${id} 不在 runes.json——剧本或配置漂移`);
  }
  const xiangsheng = balance.damageFormula.xiangshengMultipliers;

  return {
    baseRequiredPower: tower.basePower,
    depthGrowth: tower.exponentBase,
    basePowerFrac: derive.basePowerFrac,
    statRatio: { atk: ratio.atk, hp: ratio.hp, def: ratio.def },
    powerPerStatUnit,
    armorModel: balance.defense.armorModel,
    fixedK: balance.defense.fixedK,
    relK: balance.defense.relK,
    capPct: balance.defense.capPct,
    commonHpCoef: coef.commonHp,
    commonAtkCoef: coef.commonAtk,
    fatiguePenaltyPerLevel: fatigue.penaltyPerLevel,
    fatigueFailMargin: fatigue.failMargin,
    bandLevels: rotation.bandLevels,
    bossHpCoef: coef.bossHp,
    bossAtkCoef: coef.bossAtk,
    eliteHpCoef: coef.eliteHp,
    eliteAtkCoef: coef.eliteAtk,
    miniBossEveryNLevels: rotation.recurEveryNLevels,
    miniBossWaveOf7: rotation.recurAtWaveOf7,
    powerGainPerSession: SIM_SCRIPT.powerGainPerSession,
    expBaseAtD1: infinite.experience.baseAtDepth1,
    // R1 两档相生 / R3 开格补偿 / ⑦ 容量数据(T6)
    xiangshengPresence: xiangsheng.presence,
    xiangshengAdjacent: xiangsheng.generated,
    maxPowerGapRatio: balance.progressionCurves.skillGapCompensation.maxPowerGapRatio,
    lootCompensationByOpenSlotCount: infinite.lootCompensation.byOpenSlotCount,
    pathLengthUnits: balance.battle.pathLengthUnits,
    capacityData: { waveTemplate, monsterById, runesById },
  };
}

// ============================ 基础函数(全部由旋钮参数化) ============================
export const requiredPower = (K, d) => K.baseRequiredPower * Math.pow(K.depthGrowth, d - 1);
export const frontierDepth = (K, P) => Math.floor(Math.log(P / K.baseRequiredPower) / Math.log(K.depthGrowth)) + 1;
export const playerBasePower = (K, P) => K.basePowerFrac * P;
export const playerDEF = (K, P) => (playerBasePower(K, P) / K.powerPerStatUnit) * K.statRatio.def;
export const playerHP = (K, P) => (playerBasePower(K, P) / K.powerPerStatUnit) * K.statRatio.hp;
export const monsterAtkAtDepth = (K, d) => K.commonAtkCoef * requiredPower(K, d);

export function mitigation(K, model, P, d) {
  const def = playerDEF(K, P);
  const atk = monsterAtkAtDepth(K, d);
  if (model === "fixedK") return def / (def + K.fixedK);
  if (model === "relative") return def / (def + K.relK * atk);
  if (model === "cappedPct") return Math.min(K.capPct, def / (def + K.fixedK));
  throw new Error("unknown armor model");
}

const pct = (x) => (x * 100).toFixed(1) + "%";
const flag = (ok) => (ok ? "✅" : "❌崩盘");

// ============================ 五曲线模型(纯计算,返回行+判定) ============================
// 返回 { lines, sections, failures, ok }:lines=CLI 逐字输出行;sections=面板结构化数据。
export function runBalanceModel(K) {
  const S = SIM_SCRIPT;
  const lines = [];
  const sections = [];
  const failures = [];
  const push = (...ls) => lines.push(...ls);

  push(`═══ 符塔 · 无限模式平衡校准 (g=${K.depthGrowth}, armor=${K.armorModel}) ═══`, "");

  // ① 深度硬墙:境界 → 可达深度
  push("① 深度硬墙（玩家期望战力 → 可达深度 d*）");
  let prevD = 0, wallSmooth = true;
  const wallRows = [];
  for (const [name, P] of S.milestones) {
    const d = frontierDepth(K, P);
    const gain = d - prevD;
    if (prevD > 0 && (gain < S.bands.wallStepMin || gain > S.bands.wallStepMax)) wallSmooth = false;
    wallRows.push({ name, power: P, depth: d, gain });
    push(`   ${name.padEnd(8)} 期望${String(P).padStart(9)} → 可达 ~${String(d).padStart(3)} 层  (较上档 +${gain})`);
    prevD = d;
  }
  push(`   判定：每境界推进深度落在 ${S.bands.wallStepMin}~${S.bands.wallStepMax} 层、单调平滑 → ${flag(wallSmooth)}`, "");
  if (!wallSmooth) failures.push("深度墙不平滑");
  sections.push({ id: "wall", title: "深度硬墙", ok: wallSmooth, data: wallRows });

  // ② 承伤:减伤率恒定带(头号崩盘点)
  push("② 承伤减伤率（玩家处于各深度前沿时；对比三种 armor 模型）");
  push("   深度    fixedK(旧)   relative(新)  cappedPct");
  let band = true;
  const mitRows = [];
  for (const d of S.mitigationSampleDepths) {
    const P = requiredPower(K, d);
    const mF = mitigation(K, "fixedK", P, d), mR = mitigation(K, "relative", P, d), mC = mitigation(K, "cappedPct", P, d);
    const active = mitigation(K, K.armorModel, P, d);
    if (active < S.bands.mitigationMin || active > S.bands.mitigationMax) band = false;
    mitRows.push({ depth: d, fixedK: mF, relative: mR, cappedPct: mC, active });
    push(`   ${String(d).padStart(3)} 层    ${pct(mF).padStart(8)}   ${pct(mR).padStart(8)}    ${pct(mC).padStart(8)}`);
  }
  push(`   判定：当前模型(${K.armorModel}) 减伤恒在 ${S.bands.mitigationMin * 100}%~${S.bands.mitigationMax * 100}% → ${flag(band)}`);
  push(`   对比：fixedK 从个位%飙到 90%+ = 早期 DEF 无用、后期漏怪无伤(生存侧失效) → 这就是必须改公式的原因`, "");
  if (!band) failures.push("承伤减伤率越界");
  sections.push({ id: "mitigation", title: "承伤减伤带", ok: band, data: mitRows });

  // ③ 疲劳:单次会话可清层数
  push("③ 疲劳软闸（在不同「舒适度」档位肝/推，单次会话可清层数）");
  const sessionLevels = (bandFrac) => {
    const P = S.sessionRefPower;
    const req = bandFrac * P;
    let n = 0;
    while (P * (1 - K.fatiguePenaltyPerLevel * n) >= req * K.fatigueFailMargin) { n++; if (n > 999) break; }
    return n;
  };
  let sessOk = true;
  const sessRows = [];
  for (const [label, f] of S.sessionBands) {
    const n = sessionLevels(f);
    if (f === 0.6 && (n < S.bands.comfortSessionMin || n > S.bands.comfortSessionMax)) sessOk = false;
    sessRows.push({ label, bandFrac: f, levels: n });
    push(`   ${label.padEnd(16)} 约 ${String(n).padStart(3)} 层/会话`);
  }
  push(`   判定：舒适档 ${S.bands.comfortSessionMin}~${S.bands.comfortSessionMax} 层/会话(摸鱼友好) → ${flag(sessOk)}`, "");
  if (!sessOk) failures.push("疲劳会话长度不当");
  sections.push({ id: "fatigue", title: "疲劳软闸", ok: sessOk, data: sessRows });

  // ④ Boss 轮换:前段大 Boss 重铸为当前档故识精英
  push("④ Boss 轮换（前段大 Boss → 后段重铸为当前档『故识精英』，受控频率出现）");
  const freqOk = K.miniBossEveryNLevels >= S.bands.bossRecurMin && K.miniBossEveryNLevels <= S.bands.bossRecurMax;
  const rot = freqOk;
  push(`   重铸档位：HP=${K.eliteHpCoef}R / 攻=${K.eliteAtkCoef}R（=当前深度精英档，恒定可控，永不超模）`);
  push(`   出现频率：每 ${K.miniBossEveryNLevels} 关的第 ${K.miniBossWaveOf7}/7 波刷 1 只 → 落在 ${S.bands.bossRecurMin}~${S.bands.bossRecurMax} 关/次? ${flag(freqOk)}`);
  const freezeRows = [];
  for (const k of S.bossFreezeRefBands) {
    const bossAbs = K.bossHpCoef * requiredPower(K, K.bandLevels * k);
    const after1 = bossAbs / requiredPower(K, K.bandLevels * (k + 1));
    const after3 = bossAbs / requiredPower(K, K.bandLevels * (k + 3));
    freezeRows.push({ band: k, after1, after3 });
    push(`   （参考·自然衰减）B${k}冻结绝对HP：过1段≈${after1.toFixed(2)}R(仍精英) 过3段≈${after3.toFixed(2)}R(沦小怪)`);
  }
  push(`   判定：重铸档恒在精英带 + 复现频率受控 → ${flag(rot)}`, "");
  if (!rot) failures.push("Boss复现频率失控");
  sections.push({ id: "boss", title: "Boss 轮换", ok: rot, data: { eliteHpCoef: K.eliteHpCoef, eliteAtkCoef: K.eliteAtkCoef, freezeRows } });

  // ⑤ 经济:exp 锚定指数 + 破墙时间收敛
  push("⑤ 经济收敛（exp 锚定指数 + 副本肝练度破墙节奏）");
  const expRatio = (K.expBaseAtD1 * Math.pow(K.depthGrowth, 50 - 1)) / requiredPower(K, 50);
  const expRatioDeep = (K.expBaseAtD1 * Math.pow(K.depthGrowth, 150 - 1)) / requiredPower(K, 150);
  const expStable = Math.abs(expRatio - expRatioDeep) / expRatio < S.bands.expStableTolerance;
  push(`   exp(d)/需求(d)：d=50 ${expRatio.toExponential(2)} vs d=150 ${expRatioDeep.toExponential(2)} → 恒定? ${flag(expStable)}`);
  const breakSessions = Math.ceil(Math.log(Math.pow(K.depthGrowth, 10)) / Math.log(1 + K.powerGainPerSession));
  const breakOk = breakSessions >= S.bands.breakSessionsMin && breakSessions <= S.bands.breakSessionsMax;
  push(`   破墙节奏：前沿 +10 层 需肝 ~${breakSessions} 次会话(每次+${pct(K.powerGainPerSession)}战力) → ${S.bands.breakSessionsMin}~${S.bands.breakSessionsMax} 区间? ${flag(breakOk)}`);
  push(`   判定：exp 不停滞/不爆炸 且 破墙时间有限收敛`, "");
  if (!expStable) failures.push("exp 指数未对齐");
  if (!breakOk) failures.push("破墙节奏过快/过慢");
  sections.push({ id: "economy", title: "经济收敛", ok: expStable && breakOk, data: { expRatio, expRatioDeep, breakSessions } });

  // ⑥ 深度采样表(供文档/配置落地,单一真相源)
  push("⑥ 深度采样（需求战力 / 普通妖兵HP·攻 / 章末BossHP / 当前减伤）");
  push("   深度    需求战力    普通HP     普通攻    BossHP(每10层)  减伤");
  const sampleRows = [];
  for (const d of S.depthSampleTable) {
    const R = requiredPower(K, d);
    const bossHp = d % K.bandLevels === 0 ? (K.bossHpCoef * R).toExponential(2) : "—";
    sampleRows.push({ depth: d, required: R, commonHp: K.commonHpCoef * R, commonAtk: K.commonAtkCoef * R, bossHp, mitigation: mitigation(K, K.armorModel, R, d) });
    push(`   ${String(d).padStart(3)}   ${R.toExponential(2)}  ${(K.commonHpCoef * R).toExponential(2)}  ${(K.commonAtkCoef * R).toExponential(2)}   ${String(bossHp).padStart(10)}   ${pct(mitigation(K, K.armorModel, R, d))}`);
  }
  push("");
  sections.push({ id: "samples", title: "深度采样", ok: true, data: sampleRows });

  // ⑦ 单局战斗容量:开放格 2-3(T6 稀缺化)的输出供给 vs 波次怪流需求(d=1 锚点,深层按占比恒定同构)
  const C = S.capacity;
  const { waveTemplate, monsterById, runesById } = K.capacityData;
  const nominalDps = (id) => {
    const r = runesById.get(id);
    return r.lv1Attack * r.attackSpeedPerSecond;
  };
  const tierMeanDps = (ids, dense) => {
    const each = ids.map((id) => nominalDps(id) * (dense && C.aoeRuneIds.includes(id) ? C.aoeCrowdFactor : 1));
    return each.reduce((a, b) => a + b, 0) / each.length;
  };
  const supplyDps = (openSlots, dense) =>
    C.loadoutByOpenSlots[openSlots]
      .map((tier) => (tier === "output" ? tierMeanDps(C.outputRuneIds, dense) : tierMeanDps(C.utilityRuneIds, dense)))
      .reduce((a, b) => a + b, 0);

  push(`⑦ 单局战斗容量（d=1 锚点:${C.loadoutByOpenSlots[2].length}-${C.loadoutByOpenSlots[3].length} 开放格供给 vs ${waveTemplate.waves.length} 波怪流需求;解析下限模型,密集波 AOE 折算×${C.aoeCrowdFactor}）`);
  push("   波   怪数   EHP(绝对)   窗(s)   需求DPS   2格比   3格比   密集");
  const R1 = K.baseRequiredPower; // d=1 需求战力(容量锚点)
  const capacityRows = [];
  for (const wave of waveTemplate.waves) {
    let totalCount = 0, ehpR = 0, weightedSpeed = 0;
    for (const entry of wave.entries) {
      const pool = entry.monsterPoolIds.map((id) => {
        const m = monsterById.get(id);
        if (!m) throw new Error(`波次引用的怪 ${id} 不在 monsters.json`);
        return m;
      });
      const meanEhpCoef = pool.reduce((a, m) => a + m.hpCoefficientR + m.shieldCoefficientR, 0) / pool.length;
      const meanSpeed = pool.reduce((a, m) => a + m.speedUnitsPerSecond, 0) / pool.length;
      totalCount += entry.totalCount;
      ehpR += entry.totalCount * meanEhpCoef;
      weightedSpeed += entry.totalCount * meanSpeed;
    }
    const meanSpeed = weightedSpeed / totalCount;
    const interval = wave.spawnIntervalSeconds ?? 0;
    const dense = wave.spawnIntervalSeconds !== null && interval <= C.denseWaveIntervalMaxSeconds;
    const windowSeconds = (totalCount - 1) * interval + K.pathLengthUnits / meanSpeed;
    const ehpAbs = ehpR * R1;
    const demandDps = ehpAbs / windowSeconds;
    const ratio2 = supplyDps(2, dense) / demandDps;
    const ratio3 = supplyDps(3, dense) / demandDps;
    capacityRows.push({ index: wave.index, totalCount, ehpAbs, windowSeconds, demandDps, ratio2, ratio3, dense });
    push(`   ${String(wave.index).padStart(2)}   ${String(totalCount).padStart(3)}   ${String(Math.round(ehpAbs)).padStart(8)}   ${windowSeconds.toFixed(1).padStart(5)}   ${demandDps.toFixed(1).padStart(6)}   ${ratio2.toFixed(2).padStart(5)}   ${ratio3.toFixed(2).padStart(5)}   ${dense ? "密" : "—"}`);
  }
  const minRatio2 = Math.min(...capacityRows.map((r) => r.ratio2));
  const minRatio3 = Math.min(...capacityRows.map((r) => r.ratio3));
  const avgRatio3 = capacityRows.reduce((a, r) => a + r.ratio3, 0) / capacityRows.length;
  const cap2Ok = minRatio2 >= C.bands.n2WaveRatioMin;
  const cap3Ok = minRatio3 >= C.bands.n3WaveRatioMin && avgRatio3 <= C.bands.n3AvgRatioMax;
  push(`   判定：2格逐波压力比 ≥ ${C.bands.n2WaveRatioMin}(最凶波贴线=漏怪扣阵眼血的设计内张力,min=${minRatio2.toFixed(2)}) → ${flag(cap2Ok)}`);
  push(`   判定：3格逐波 ≥ ${C.bands.n3WaveRatioMin} 且均值 ≤ ${C.bands.n3AvgRatioMax}(有冗余不无聊,min=${minRatio3.toFixed(2)}/avg=${avgRatio3.toFixed(2)}) → ${flag(cap3Ok)}`);
  if (!cap2Ok || !cap3Ok) failures.push("单局容量失衡");

  // R1 相生两档预算:同场弱档可感知且低于相邻强档;相邻满档增益不破"技巧补 25-30%"预算
  const EPS = 1e-9; // 浮点比较容差(1.3-1 = 0.30000000000000004)
  const r1Ok =
    K.xiangshengPresence >= C.presencePerceptionMin - EPS &&
    K.xiangshengPresence < K.xiangshengAdjacent &&
    K.xiangshengAdjacent - 1 <= K.maxPowerGapRatio + EPS;
  push(`   R1 相生两档：同场${K.xiangshengPresence} ∈ [${C.presencePerceptionMin}, 相邻${K.xiangshengAdjacent}) 且相邻满档+${Math.round((K.xiangshengAdjacent - 1) * 100)}% ≤ 技巧预算${Math.round(K.maxPowerGapRatio * 100)}% → ${flag(r1Ok)}`);
  if (!r1Ok) failures.push("R1 相生预算越界");

  // R3 开格补偿:2 格局倍率可感知,且低于 3↔2 格真实供给比(否则 2 格净期望更优=倒挂激励)
  const comp2 = K.lootCompensationByOpenSlotCount["2"];
  const comp3 = K.lootCompensationByOpenSlotCount["3"];
  const supplyRatio32 = Math.min(supplyDps(3, true) / supplyDps(2, true), supplyDps(3, false) / supplyDps(2, false));
  const r3Ok = comp3 === 1 && comp2 >= C.bands.compensationMin && comp2 < supplyRatio32;
  push(`   R3 开格补偿：2格×${comp2} ∈ [${C.bands.compensationMin}, 供给比${supplyRatio32.toFixed(2)}) 且 3格×${comp3}=基准 → ${flag(r3Ok)}`, "");
  if (!r3Ok) failures.push("R3 补偿倒挂");
  sections.push({ id: "capacity", title: "单局战斗容量", ok: cap2Ok && cap3Ok && r1Ok && r3Ok, data: { rows: capacityRows, minRatio2, minRatio3, avgRatio3, presence: K.xiangshengPresence, adjacent: K.xiangshengAdjacent, comp2, supplyRatio32 } });

  // 总判
  const curveCount = sections.filter((s) => s.id !== "samples").length;
  push("═══ 崩盘检测总判 ═══");
  if (failures.length === 0) {
    push(`✅ ${curveCount} 条曲线全部落在健康带，当前旋钮不崩盘。可据此写入 v4 设计文档。`);
  } else {
    push("❌ 发现 " + failures.length + " 处崩盘风险：" + failures.join("、") + " → 调 KNOBS 重跑。");
  }

  return { lines, sections, failures, ok: failures.length === 0 };
}
