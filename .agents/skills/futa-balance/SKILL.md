---
name: futa-balance
display_name: 符塔数值设计
short_description: 符塔无限模式数值设计与防崩盘验证方法论
default_prompt: "用 futa-balance 设计/校准符塔数值：改 src/config 数值(或核内 SIM_SCRIPT 剧本)跑 npm run balance 到全曲线绿，再走门禁。"
description: |
  《符塔》(玄幻无限爬塔塔防 roguelite)的数值设计与平衡验证方法论。当需要设计、调整、
  审查任何游戏数值时使用：伤害/承伤/战力、经验与境界、怪物成长、深度硬墙、疲劳度、
  Boss 轮换、地图随机属性、副本倍率、经济产出、单局战斗容量(开放格 2-3)。
  铁律：任何数值改动先过 `scripts/balance-sim.mjs` 的崩盘检测(全曲线绿,现为六条：五大宏观+单局容量)，数值真相源=src/config(经 balance-core 的 deriveKnobs 派生,表间漂移即抛错)。
  本 skill 由 Claude(项目大脑)维护；提炼自 GitHub 游戏开发 skill 精华 + 本项目 v4 框架。
---

# 符塔数值设计 (futa-balance)

让"做出不崩盘的合理数值"变成可重复的流程。配套：`scripts/balance-sim.mjs`(平衡模拟器/尺子)、`docs/source/符塔_总设计_v3.md`(输出侧公式)、`docs/source/符塔_无限模式_v4.md`(无限模式框架)、`acceptance/`(验收契约)。

## 角色与纪律（取经自"工作室层级"）

- **Claude = 项目大脑 + 数值设计 + 尺子 owner**：定公式/旋钮、维护 `balance-sim.mjs` 与门禁、守"不崩盘"愿景。
- **Codex = 施工者**：按钉死的框架把数值落进 `src/config` 并实现读取逻辑。**不得改尺子**(balance-sim / check-* / golden / contracts)。
- **用户 = 产品负责人**：拍板设计方向与关键旋钮。

## 核心工作流（取经自"模拟反馈迭代平衡"）

> **改配置数值 → 跑模拟器 → 全曲线绿 → 四层门禁 → 验收。** 绝不"拍脑袋给数字"，也绝不"他说合理就过"。
> (2026-07-03 数值核重构后:旋钮=src/config 本身,`deriveKnobs` 派生,KNOBS 双真相源已消灭——TECH_DEBT #2 已还)

```text
1. 直接改 src/config/*.json 里要校准的数值（一次只动 1-2 个，便于归因）;
   纯仿真剧本参数(采样点/健康带/摆位假设)在 scripts/balance-core.mjs 的 SIM_SCRIPT
2. node scripts/balance-sim.mjs  (或 npm run balance)
3. 读"崩盘检测总判"：
   ① 深度墙平滑  ② 承伤减伤恒在 25~75%  ③ 疲劳会话长度
   ④ Boss 复现频率受控  ⑤ exp/破墙经济收敛  ⑥ 深度采样表
   ⑦ 单局战斗容量(2-3 开放格供给 vs 波次怪流;含 R1 相生预算/R3 补偿不倒挂)
   - 有 ❌ → 调数值重跑，直到全曲线绿
4. 配置表间同一数值必须处处一致(deriveKnobs 交叉校验会抛错拦截漂移)
5. npm run quality:gate -- --task <T?>：check-isolation + check-config + golden + tsc/test/build
6. Claude 按 WORKFLOW 决策格式给 PASS/FAIL/BLOCKED
```

## 崩盘检查清单（每次设计/审查必过）

1. **固定常数 × 指数环境 = 必失衡**：任何写死的常数(如旧承伤 K=600)碰上随深度指数成长的怪物，迟早一端碾压。→ 改**相对式**(`DEF/(DEF+k×怪攻)`)或**封顶式**，并用模拟器验证"恒定带"。这是头号崩盘点。
2. **乘法天花板**：相乘增益(品质3.0×相生1.3×克制2.0×画功1.2≈**9.4×**)按**满配玩家**算；怪 HP 按上限设计，否则高投入秒天秒地。
3. **成本必须比产出增长更快**(idle math)：升级成本指数 > 收益线性/多项式，否则经济膨胀崩盘；但**破墙时间要收敛**(有限会话内能突破)，否则劝退。
4. **双闸不重叠**：多个"挡玩家"机制(疲劳软闸 + 数值硬墙)要分工——硬墙管"能多深"、疲劳管"单次多远"，否则双重惩罚。
5. **方差钳下限**：随机项(地图 2-3 五行 / 掉落)方差要保底，避免单次随机直接让玩家无法进行(死 roll)。建议有效战力波动夹 ±15%。
6. **离散奖励 → 深度公式**：无限模式没有"首通"，固定关卡奖励不成立；exp/奖励改 `f(d)` 且与成本同指数(占比恒定)。

## 数值设计原则（取经精华）

- **小底数大后果**：指数底数 1.07 vs 1.08 到第 100 层差异巨大——每个旋钮都过模拟器，别凭感觉。
- **颠簸 > 完美曲线**：刻意留快慢段、惊喜与翻盘点；别把曲线磨平成等比直线(charts ≠ feel)。
- **模拟器是下限不是真相**：它可靠地**定性抓崩盘**；手感与精细平衡仍需真机埋点(见 v3 第八部分埋点表)校准。
- **越级补差有上限**：相生+克制+画功补 ~25-30% 战力差，保免费/技术玩家活路，又不破坏养成动机。

## 落地纪律（数值与代码隔离）

- `src/config/**` 只放纯数据 + schema 校验(缺字段/坏引用即抛错)；业务读配置、**不写裸数字**(`check-isolation` 机器门禁)。
- 公式系数(战力权重、品质/相生/克制倍率、减伤参数、深度成长 g、疲劳惩罚…)全部具名进 `balance.json` / `infinite.json`。
- **尺子归 Claude**：`balance-sim.mjs`、`balance-core.mjs`(数值核,浏览器调参台与 CLI 共用)、`check-config.mjs`、`golden.formulas.test.ts`、`config.smoke.gate.test.ts`、`combat.gate.test.ts`、`contracts.json` —— Codex 只读。

## 符塔当前锁定值（v4，详见 docs/source/符塔_无限模式_v4.md）

深度成长 g=1.07；承伤相对式恒 45%；疲劳 −1.2%战力/层(舒适~34层/会话)；Boss 重铸精英 0.75R、每3关第5波；exp(d)=100×1.07^(d-1)；破墙 +6%战力/会话(+10层≈12会话)；副本 ×1.2~1.5 无疲劳。
T6 增补(2026-07-03 校准)：玩家三围推导 basePowerFrac=0.45、比 2:20:1(balance.playerDerivation)；R1 相生两档 同场×1.1/相邻×1.3(相邻=开放格距离≤200 canvas units)；R3 开格补偿 2格×1.25/3格×1(infinite.lootCompensation)；R2 双入口模板 override 恒开 3 格；单局容量带:2格逐波≥0.9、3格逐波≥1.15 且均值≤3.0(d=1 锚点,深层占比恒定)。改这些 → 先过 balance-sim。

## 取经来源（精华提炼自）

- The Math of Idle Games — gamedeveloper.com（成本>产出、指数失控、颠簸节奏）
- abagames/claude-one-button-game-creation（模拟反馈迭代平衡 / 不变量）
- Donchitos/Claude-Code-Game-Studios（守愿景的工作室层级）
- fagemx/gstack-game（设计评审 + QA 修复循环）
