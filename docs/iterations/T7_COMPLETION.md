# T7 完成索引：灵机、画符、融合与结算语义

状态：**完成并通过验收**

完成日期：2026-07-19

发布分支：`codex/t7-completion`

原始基线：`23a8b2b`

本文件是 T7 的完成索引，不替代既有监督框架。需求、红线和验收口径仍以 `docs/briefs/T7.md`、`docs/CODEX_TASKS.md` 的 Task 7、`acceptance/contracts.json` 的 `tasks.T7` 以及 `tests/interaction.gate.test.ts` 为准。

## 1. T7 交付范围

- PREP 阶段提供本关五行构成、潜在数量与 Boss 波标记的 R4 情报条。
- 第 2/4/6 波发放灵机点；支持消耗灵机升级战符，并通过事件总线留下 R5 使用数据。
- 支持五行精掉落与雷／冰／毒融合；融合按配置预检材料和克制关系。
- 提供确定性的笔迹识别和 50／80／95 三档画符评分；画符失败零惩罚，成功增幅只作用于下一发并受模拟步数冷却约束。
- `CombatSimulation` 提供升级、融合、画符三条入口，统一进入既有 `runeDamage` 公式链。
- UI 提供情报、灵机升级／融合、画符选择／符纸／反馈及融合元素标记，并与 dev 调参台共存。
- `battle.settled` 同时输出 `wavesDispatched` 与 `wavesCleared`；后者只统计真正完全清场的波次。
- 不画符、不消费灵机也不会阻塞战斗，局面能够正常推进并结算。

## 2. 施工文件（T7-A `c63b3d1`）

施工提交只包含以下 12 个允许的 `src` 文件：

1. `src/config/schema/visual.ts`
2. `src/config/visual.json`
3. `src/game/battle/BattleController.ts`
4. `src/game/battle/combat/CombatSimulation.ts`
5. `src/game/battle/combat/assembleBattle.ts`
6. `src/game/battle/draw/recognition.ts`
7. `src/game/battle/draw/scoring.ts`
8. `src/game/battle/intel.ts`
9. `src/game/battle/run/RunProgression.ts`
10. `src/game/events/EventBus.ts`
11. `src/main.ts`
12. `src/ui/BattleInteractionUI.ts`

施工者没有修改 `tests/**`、`scripts/**`、`acceptance/**`、`docs/**`、`package.json`、锁文件或 TypeScript/Vite/Vitest 配置。

## 3. 监督尺子修正（T7-S `a0496fd`）

原 `interaction.gate` 的 5 个伤害锚点存在夹具假失败：单怪可能先被 slot1 击杀，使 slot0 没有目标；90 个模拟步也不足以覆盖怪物进入真实射程。监督提交把锚点波改为 3 怪、等待上限改为 3000 步，并在 `docs/WORKFLOW.md` 登记理由和双向变异自证。

该提交没有改动任何 `expect(...)` 或伤害锚点常量：144、132、138、192、84 均保持原值。它与施工提交分离，不计入施工者修改范围。

## 4. 验收结果与证据（T7-E `7364491`）

最终候选在本分支复跑：

- `npm run quality:gate:capture -- --task T7`：**PASS**
- 合约阶段：`pass=true`、`contractPass=true`、`withCapture=true`
- TypeScript、配置校验、领域隔离、build：全部 PASS
- Vitest：11 个测试文件、80/80 用例 PASS；其中 `interaction.gate` 16/16 PASS
- L4 独立代码复核：没有原始 T7 阻断项

机器报告：`reports/t7-original-quality-gate.json`。

浏览器证据保存在 `screenshots/t7/`：

- `01`–`06`：PREP 情报、灵机升级、融合、画符选择、符纸与反馈。
- `07`–`10`：调参台共存、灵机菜单、零长度点击 0 分、完整画符 100 分与 +20%。
- `11`：本次最终质量门禁抓取的 1280×720 静态画面。
- `12`–`14`：调参台与画符层重叠问题的修复前、修复后共存及修复后反馈证据。

## 5. 技术债结论

- 债 #5：**已还**。无画符回放实测 `wavesDispatched=7`、`wavesCleared=5`，败局不再把已派发波次虚报为清场波次。
- 债 #4：仍为**还债中**。T7 保持 `runes.effects` 只用于数据展示与融合校验；特效引擎和回放回校是 T7b 尾项。
- 债 #6：仍为既有未还债。默认演示局可能战败，但能够正常结算，不构成 T7 回归。

## 6. 明确排除项

以下内容不属于本次原始 T7 发布链：

- T7b 的 AOE、减速、DoT、穿透、多段、光环、延迟弹及融合特效战斗消费。
- v0.7.1 的 B1–B4 增量任务、对应规则书、清单、红线与增量 gate。
- `tests/debug.gate.test.ts` 的后续补强及 `scripts/codex-build.sh` 的环境修复。
- 任何 T8/T9 功能、局外养成或整体 UI 重做。

## 7. 提交映射

| 角色 | 提交 | 内容 |
|---|---|---|
| S · 监督 | `a0496fd` | 等价修正交互尺子夹具并登记 |
| A · 施工 | `c63b3d1` | 12 个允许的 T7 实现文件 |
| E · 证据 | `7364491` | 14 张验收图与最终质量报告 |
| U · 监督 | 本文件所在提交 | 完成索引、任务状态与技术债登记 |

发布判断：上述四段提交共同构成可审计的 T7 完成链；T7b 另行立项，不得混入本版本。
