# Codex 施工简报 · Task {ID}：{标题}

> 本简报由 Claude(项目大脑/监督者)签发，是你(Codex)本批唯一授权范围。完成后由 Claude 按四层门禁验收。
> {一句话说明本批做什么、不做什么(把留给后续批次的事点名)。}

---

## 0 · 目标
{使尺子 `tests/{name}.gate.test.ts` 的 N 个用例由全 skip 转全 PASS。列交付文件清单。}

一句话交付标准：**{可机器验证的单句}**

---

## 1 · 角色与铁律
- 你是施工者，只做本简报授权的事，不扩范围、不改产品方向。
- **禁止触碰尺子**(归 Claude)：`tests/*.gate.test.ts`、`tests/golden.formulas.test.ts`、`scripts/**`、`acceptance/**`、`docs/**`、`package.json`。施工后有机器门禁自动求交集，非空即整批 FAIL(纪律二)。
- **锚点测试的接口契约与断言是钉死的**；若你认为契约有误，**停下回报 Claude**，不得自行改测试就标"通过"。
- 红线：{本批特有红线——禁 import、禁 Math.random/Date、零裸数字范围、iso-ok 豁免边界、无 as any/@ts-ignore 等}

---

## 2 · 必读(仓库内)
1. `tests/{name}.gate.test.ts` — **接口契约 + 验收标尺**(本批的尺子，只读)。
2. {架构/数据文档相关章节}
3. {相关配置表与既有代码风格参照}
4. `acceptance/contracts.json` 的 `tasks.{ID}` — DoD 与 forbidden 全文。

---

## 3 · 交付物(精确接口)
{逐文件给出精确 TS 签名/JSON 结构，以及生成/校验规则。数值一律注明来自 config 何处。}

---

## 4 · 关键设计(为何这样定)
{2–4 条设计理由，让施工者理解意图而非机械照抄，防止貌合神离的实现。}

---

## 5 · DoD(全满足才 PASS，另见 `acceptance/contracts.json` 的 {ID})
{可勾选清单，与契约一致。}

---

## 6 · 自检(交付前自己先跑全绿)
```bash
npm run quality:gate -- --task {ID}   # 视觉批次用 quality:gate:capture
```

---

## 7 · 交付输出(结束时打印)
1. 新增/修改文件清单。
2. 门禁逐阶段摘要 + 锚点用例 PASS 文本。
3. **数值/随机源来源对照**：证明零裸数字、无未授权随机源。
4. 任何拿不准的点，回报 Claude，不要自行扩范围。
