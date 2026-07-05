# 技术债登记表

> 纪律六：已知债显式登记，禁止靠记忆。每批验收时过一遍本表；还债也走契约流程（钉契约 → 施工 → 验收）。
> 格式：状态 ∈ 未还 / 还债中(T?) / 已还(commit)。

| # | 债 | 引入时点 | 还债计划 | 状态 |
|---|---|---|---|---|
| 1 | 疲劳恢复 `fatigue.recovery.fullRecoverHours = 6h` 仅占位，未进 `balance-sim` 验证（恢复节奏对留存/产出的影响未仿真） | T9 (2026-06-28)，产品暂定 | 无限模式运行时(原 T10)前，把恢复曲线纳入 balance-sim 五曲线检测再定稿 | 未还 |
| 2 | `scripts/balance-sim.mjs` 的 KNOBS 与 `src/config/balance.json` 是两套数值、靠人肉同步（违反纪律五单一真相源） | T9 数值框架成型时 | T6 附带需求：抽平台无关"数值核"，CLI 门禁与浏览器 dev 调参台共用同一算法与真相源；属改尺子 → Claude 亲自做并自证 `npm run balance` 输出逐字等价 | **已还**(T6 监督工件,2026-07-03)：`scripts/balance-core.mjs` 数值核 + KNOBS 全部改由 `deriveKnobs` 从 `src/config/*.json` 派生(配置即真相,表间漂移即抛错)；重构输出经 shasum 双向比对逐字等价(2a111f76)。仿真专用剧本参数(采样点/健康带/摆位假设)留核内 `SIM_SCRIPT`,与运行时数值分离 |
| 3 | 浏览器 dev 实时调参台(拖 KNOBS 重算曲线红绿 + override 同步到运行中战斗)尚未落地,数值核已就绪但只有 CLI 消费方 | T6 拆批 (2026-07-03) | T6.1 紧随批次:dev-only(`?debug=1`)面板 import `balance-core.mjs`;运行时 override 接口 T6 已预留(注入式 config);调参产物仍须过 balance-sim 全曲线绿才落配置(尺子判定权不变) | **已还**(T6.1,2026-07-05,commit 965dfe9):?debug=1 面板=数值核第二消费方,曲线红绿/旋钮覆写/真实回放对照全落地;"override 同步到运行中战斗"按契约收敛为回放校准(面板覆写只影响面板计算,不落运行局——落地纪律不变) |
| 4 | 符 `trait` 特效是中文文本(AOE 半径/减速%/穿透数/多段机器不可读),T6 战斗按统一单体攻击模型实现,容量模型的 AOE 密集折算(×2.0)是剧本假设未经实现印证 | T6 契约 (2026-07-03) | T7 画符/融合批次一并把 trait 数据化(结构化特效字段+schema),实现后用真机埋点回校容量曲线的 aoeCrowdFactor | 未还 |
| 5 | `battle.settled.wavesCleared` 在败局语义失真:`completedWaves` 按波次计时器到期递增,不代表该波怪被清完——败局可报 wavesCleared=7 而实际漏怪磨死阵眼(T6 验收 L4 发现,现 T7 前无消费方) | T6 施工 (2026-07-04) | T7 结算 UI 前钉死语义(改为"实际清完的波"或改名 wavesDispatched),入 T7 契约 | 未还 |
| 6 | seed=1 默认演示局(2格,镇岳+焚天,d=1)战败:杀14/漏24/coreHp-31——MVP 纯单体+下品符+无相生 vs 容量曲线含 AOE 折算与相生预算的剧本假设,落差未回校(与债#4 同根) | T6 验收 (2026-07-04) | T6.1 调参台首个用例:用真实 CombatSimulation 逐波回放校准容量曲线的供给侧假设(qualityMul/相生/AOE) | 未还 |
