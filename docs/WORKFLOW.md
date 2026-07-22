# Claude/Codex 协作流程

状态：**Claude Code 已接管验收尺子（2026-06-25）。** 进入"Claude 监督 + Codex 施工 + 四层门禁"正式循环。

## 标准循环

1. 用户提出目标或变更。
2. **Claude（施工前）** 把目标转成明确任务，并在 `acceptance/contracts.json` 钉死该批的客观 DoD/证据/红线。契约确认后才放行 Codex。
3. Codex 按契约实现，不自行扩大范围、不改门禁与黄金测试。
4. Codex 自检本地门禁（必须先自己跑绿再交）：

```bash
npm run quality:gate -- --task <ID>          # L1 机械 + L2 功能契约
```

5. 涉及画面/UI/动效/布局的任务，Codex 还必须出截图/录像：

```bash
npm run quality:gate:capture -- --task <ID>  # 追加 L3 视觉门禁
```

6. Codex 提交后，**Claude 验收**，读取并引用：
   - `reports/quality-gate.json`（逐阶段 PASS/FAIL）
   - `reports/isolation.json`（数值隔离结果）
   - 截图/录像证据（L3）
   - **`/code-review` 评审 diff（L4，正确性/复用/隐患）**
   - 变更文件与未解决风险
7. Claude 按"决策格式"输出 `PASS / FAIL / BLOCKED`。
8. 只有四层全过（L1+L2 全绿、L3 证据齐、L4 无阻断），Codex 才继续下一批。

## 四层门禁（详见 `docs/ACCEPTANCE_GATE.md`）

| 层 | 内容 | 命令/工具 |
|---|---|---|
| L1 机械 | 结构/依赖/数值隔离/TS/单测(黄金算例)/构建 | `npm run quality:gate` |
| L2 功能 | 任务契约 `requires` 阶段全过 | `quality:gate -- --task <ID>` |
| L3 视觉 | 截图/录像 + 水墨气质人工复核 | `quality:gate:capture -- --task <ID>` |
| L4 评审 | diff 正确性/复用/隐患 | `/code-review`（敏感面加 `/security-review`） |

## 决策格式

Claude 每次验收必须使用以下格式：

```text
Decision: PASS | FAIL | BLOCKED
Task: <T?>  契约: requires 全绿 = 是/否
Gate command: <实际执行命令>
Gate result: 逐阶段 PASS/FAIL（引用 reports/quality-gate.json）
Isolation: PASS/FAIL/PENDING（引用 reports/isolation.json）
Code-review(L4): 无阻断 / 列阻断项
Evidence:
- <截图/录像/构建输出/关键文件路径>
Issues:
- <必须修复项；没有则写 none>
Next Codex task:
- <下一批明确任务，或本批精确返工点>
```

## 反套娃要点

- 标准在施工前钉死，验收只对照契约，不临时加码（要加码 = 开新任务）。
- 黄金测试期望值、门禁脚本由 Claude 维护，Codex 不得改。**施工后 `codex-build.sh` 自动做尺子完整性机器门禁**（施工 diff ∩ 尺子清单非空即 FAIL，清单见 PROJECT_BRAIN 纪律二）。
- 证据优先于话术：代码与画面冲突时以画面为准。
- 工程七纪律（不信自报/尺子机器验证/先钉死后施工/多源印证/确定性单一真相源/债显式登记/失败快而响）见 `docs/PROJECT_BRAIN.md` 工程纪律章，与产品四逻辑同级。

## 流程优化（2026-07-02 起生效）

- **简报模板化**：新简报从 `docs/briefs/_TEMPLATE.md` 起草，保持七段结构（目标/铁律/必读/精确接口/DoD/自检/交付输出），减少漏项。
- **流水线并行**：Codex 施工期间，Claude 可**起草**下一批的尺子与契约（草稿放会话内或 /tmp），但**不得在施工中途落盘/提交**——工作区必须保持"派工时点"基线，否则尺子完整性门禁与验收 diff 失真。本批四层验收通过并提交后，下一批监督工件才落盘。
- **派工前置检查**：`codex-build.sh` 要求派工时工作区干净（监督工件已提交），脏树直接拒绝派工。

## 尺子变更登记（纪律二：尺子修改权唯一归 Claude，改尺子须自证等价或说明理由）

> 尺子清单（`tests/*.gate.test.ts`、`tests/golden.formulas.test.ts`、`scripts/**`、`acceptance/**`、`docs/**`、`package.json`）的任何改动在此登记。格式：日期 · 文件 · 变更 · 判定 · 自证。

### 2026-07-18 · tests/interaction.gate.test.ts · anchorWave + ENTER_RANGE_STEPS（Codex T7 施工中触碰，Claude 事后裁定保留）
- **变更**：伤害锚点用例的造波从 `singleMonsterWave`（1 怪）改 `anchorWave`（3 怪），等待窗从 90 步改 `ENTER_RANGE_STEPS=3000`。**未动任何 `expect(...)` 与伤害常量**（DRAW_FULL=144／DRAW_PARTIAL_65=132／UPGRADED=138／THUNDER_VS_WATER=192／VS_EARTH=84 逐字不变）。
- **判定**：**合理修正，保留**（非搬门柱）。原写法是**假失败**：单怪时 slot1(qing_teng) 抢刀致锚点符 slot0(fen_tian) 无目标不开火，且 90 步不够怪走进射程。
- **自证（双向变异）**：①回退到旧值（1怪+90步）在**正确 SUT** 上 5 用例 FAIL → 证明改动确在修真 bug、载荷有效；②在放宽后的尺子上注入真 SUT 缺陷（画符加成被吞 `pendingDrawBonus` 恒取 base）→ 画符两用例仍 FAIL → 证明 3000 步窗**未掩盖** SUT 错误、断言仍咬。射击节奏/冷却/射程钳制的正向覆盖另由 `combat.gate` 保。
- **纪律补记**：此改动本应由 Claude 起草而非混在 Codex 施工 diff 里（违反纪律二/三的顺序）。Codex 越权改尺子应在 `codex-build.sh` 尺子完整性门禁拦下——本轮未经该脚本派工是流程缺口，已登记；后续 T7 返工须走干净派工链。
