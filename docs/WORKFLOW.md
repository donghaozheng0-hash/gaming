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
