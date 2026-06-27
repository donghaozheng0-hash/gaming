# 符塔 · 验收门禁与核准标准（成熟版）

状态：**Claude Code 接管并掌管验收尺子（2026-06-25）。** 验收门禁由监督者(Claude)拥有，Codex 只负责让门禁变绿，不得修改门禁标准本身。

---

## 0. 为什么要这套东西（反"套娃"宣言）

旧问题：Codex 说"我写完了" → Claude 主观一看"不行" → 打回返工 → 再交 → 再主观打回……**无限套娃**，根因是 **验收靠事后主观判断、且标准会移动**。

本门禁用三条铁律根治：

1. **客观可机检**：能交给机器判的(隔离/编译/算例/构建/截图存在)一律机器判，不靠"我觉得"。
2. **施工前钉死**：每批任务的 Definition of Done(DoD)在 Codex 动工**之前**写进 `acceptance/contracts.json`，验收只对照契约，不临时加码。
3. **尺子归监督者**：门禁脚本、黄金测试由 Claude 编写维护。**让被考核者出考卷 = 利益冲突**，所以 Codex 不得改门禁与黄金测试期望值。

> 一句话：**验收 = 跑一遍门禁对照契约，PASS/FAIL 由证据决定，不由情绪决定。**

---

## 1. 四层验收金字塔

每批提交从下往上逐层过，下层不过不看上层。

| 层 | 关卡 | 核准值 | 由谁判 | 命令 |
|---|---|---|---|---|
| L1 机械门禁 | 结构 / 依赖 / **数值隔离** / TypeScript / **单测(黄金算例)** / 构建 | 全 PASS | 机器 | `npm run quality:gate` |
| L2 功能门禁 | 该任务契约 `requires` 的阶段全过；headless 玩法用例通过 | 契约阶段全绿 | 机器 | `npm run quality:gate -- --task <ID>` |
| L3 视觉门禁 | 画面/UI/特效变更出具截图或录像，水墨气质/五行可辨/阵眼反馈 | 证据齐 + 人工复核 | 机器产证据 + Claude 判 | `npm run quality:gate:capture -- --task <ID>` |
| L4 评审门禁 | 代码正确性/复用/隐患 diff 评审 | 无阻断级问题 | Claude（用 `/code-review`） | 见 §4 |

L1+L2 全自动，是"能不能进下一关"的硬开关。L3 对一切动画面的任务强制。L4 是监督者的人在环复核。

---

## 2. L1 机械门禁明细（每个阶段的"FAIL 即打回"判据）

| 阶段(门禁结果名) | PASS 判据 | 典型 FAIL |
|---|---|---|
| `dependencies` | `node_modules` 就绪 | 漏装依赖 |
| `isolation` | 领域层无白名单外数字字面量、无 `@babylonjs` 引入 | 公式里写 `*6`、`K=600`；`src/game` 里 import Babylon |
| `typescript` | `tsc --noEmit` 退出 0 | 类型错误 |
| `test` | `vitest run` 退出 0，**黄金算例必须真 PASS（公式落地后不许 skip）** | 算例对不上 444/663/995/1326/80 |
| `build` | `vite build` 退出 0 | 构建失败 |
| `capture still` | 截图产物存在 | 视觉任务无截图 |

**数值隔离(`isolation`)是本项目的强制门禁项**，对应底层逻辑三。机器化实现见 `scripts/check-isolation.mjs` + `acceptance/isolation.config.json`；只扫描领域子目录(`src/game/{formulas,battle,meta,events}`)，落地前报 PENDING 不阻塞，落地后立即有牙。极少数结构性常数可在该行加 `// iso-ok: 原因` 豁免，但豁免会进入 L4 评审，滥用驳回。

---

## 3. L2 任务契约（施工前钉死的 DoD）

全部任务的客观验收契约在 `acceptance/contracts.json`，每个任务含：

- `requires`：必须 PASS 的门禁阶段（机器校验）。
- `definitionOfDone`：可核对的完成项。
- `evidence`：视觉任务必须随附的截图/录像。
- `forbidden`：出现即判 FAIL 的红线（如"怪物数值写死到类里""修改黄金测试期望值"）。

验收时跑 `npm run quality:gate -- --task T2`，脚本会先打印该任务 DoD/证据/红线，再判 `requires` 是否全绿。**契约在 Codex 动工前由 Claude 确认，动工后不临时加项**——要加项就是新任务，不是把当前批打回。

---

## 4. L4 代码评审门禁（"GitHub 那种 skill"的落点）

用户问"GitHub 有没有现成验收 skill 可调"。结论：没有专门的"验收"skill，但有内置的代码评审 skill，正好充当 L4 人在环复核：

- **`/code-review`**：评审当前 diff 的正确性 bug 与复用/简化/效率问题（可 `--fix` 直接落修）。**每批 Codex 提交后由 Claude 跑一次**，作为 L4。
- **`/security-review`**：涉及存档/网络/支付等敏感面时追加。
- L4 判据：无"阻断级"(correctness)问题即过；只有"改进建议"不阻断进度，记入缺陷清单下批处理。

> L1–L3 防"功能没做对/数值没隔离/画面没气质"，L4 防"代码本身有坑"。四层都过才算真 PASS。

---

## 5. 反套娃护栏（硬约束，违反即流程作废）

1. **黄金测试只读**：`tests/golden.formulas.test.ts` 的期望值(663/995/1326/444/80)是总设计算例，Codex 不得改。算例若有异议 → 回报 Claude 评审，不许"改了测试就算过"。
2. **门禁尺子归 Claude**：`scripts/quality-gate.mjs`、`scripts/check-isolation.mjs`、`acceptance/**`、`docs/ACCEPTANCE_GATE.md` 由监督者维护，Codex 改动这些文件一律先评审。
3. **标准不事后移动**：验收只对照施工前的契约。Claude 发现契约本身漏项，是"补一条新任务"，不是把当前批反复打回。
4. **证据优先于话术**：代码与截图/录像冲突时以画面为准；"看起来可以"不算证据，必须引用门禁输出与产物路径。

---

## 6. 验收决策格式（Claude 每批必须按此输出，见 `docs/WORKFLOW.md`）

```text
Decision: PASS | FAIL | BLOCKED
Task: <T?>  契约: requires 全绿 = 是/否
Gate command: npm run quality:gate -- --task <T?>   (视觉任务用 :capture)
Gate result: 逐阶段 PASS/FAIL（引用 reports/quality-gate.json）
Isolation: PASS/FAIL/PENDING（引用 reports/isolation.json）
Code-review(L4): 无阻断 / 列阻断项
Evidence:
- <截图/录像/构建输出/关键文件路径>
Issues:
- <必须修复项；无则 none>
Next Codex task:
- <下一批明确任务，或本批的精确返工点>
```

---

## 7. 目标通过率指标（玩法落地后的数据验收，非空项目门禁）

| 区间 | 目标通过率 |
|---|---:|
| 1-1 ~ 1-3 | ≥ 90% |
| 1-4 ~ 1-6 | 75% – 85% |
| 1-7 ~ 1-10 | 55% – 70% |
| 1-11 ~ 1-15 | 45% – 60% |
| 1-16 ~ 1-20 | 25% – 40% |

待 T6 起埋点(`TelemetryService`)接通后，用 headless 自动模拟跑通过率曲线校准，纳入 L2。

---

## 8. 本地命令速查

```bash
npm run quality:gate                  # L1 基础门禁
npm run quality:gate -- --task T2     # L1+L2 对照任务契约
npm run quality:gate:capture -- --task T5   # 加 L3 截图门禁
npm run check:isolation               # 单独跑数值隔离门禁
npm test                              # 单独跑单测(含黄金算例)
```

## 9. 升级记录

- 2026-06-25：从"仅查文件存在+编译+构建"升级为四层金字塔；新增数值隔离机器门禁、黄金算例单测、任务契约、`/code-review` L4。验收尺子收归 Claude。
