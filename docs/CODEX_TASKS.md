# Codex 第一批施工任务

状态：Codex 根据 Claude 已接管的 `GAME_ARCHITECTURE.md`、`DATA_ARCHITECTURE.md`、`VISUAL_DIRECTION.md` 整理；待 Claude 下一轮监督确认。

## 执行规则

- Codex 是施工者，不自行改变产品方向。
- 每个任务完成后必须运行指定验收命令。
- 未通过 `npm run quality:gate` 不得进入下一批任务。
- 涉及画面、UI、特效的任务必须运行 `npm run quality:gate:capture` 并提供截图。
- 任何数值不得硬编码进业务逻辑；必须走 `src/config/**`。

## Task 1：建立配置层骨架与 Schema

| 项 | 内容 |
|---|---|
| 目标 | 建立 `src/config/` 目录，包含配置文件、类型定义、运行时校验和 `ConfigService`。 |
| 允许修改 | `src/config/**`、`src/game/**` 中必要类型引用、`package.json` scripts。 |
| 禁止事项 | 禁止写战斗业务实现；禁止把具体数值写进 `src/game/**` 逻辑文件。 |
| 必须包含 | `balance.json`、`runes.json`、`monsters.json`、`levels.json`、`waves.json`、`maps.json`、`fusion.json`、`cultivation.json`、`economy.json`、`progression.json`、`visual.json`。 |
| 验收命令 | `npm run quality:gate`；新增 `npm run check:config`。 |
| 通过标准 | 配置能加载、校验、冻结；缺字段/错引用会失败；quality gate PASS。 |

## Task 2：公式模块与总设计算例单测

| 项 | 内容 |
|---|---|
| 目标 | 实现战力、伤害、相生、克制、承伤等纯公式模块。 |
| 允许修改 | `src/game/formulas/**`、`src/config/**`、测试脚本。 |
| 禁止事项 | 禁止引入 Babylon；禁止硬编码总设计算例中的数值分支。 |
| 必须包含 | 复现焚天符输出算例：444、663、995、1326；复现 DEF150 承伤 80。 |
| 验收命令 | `npm run quality:gate`；如新增测试则 `npm run test`。 |
| 通过标准 | 所有公式从配置读参；TypeScript/build PASS；算例测试 PASS。 |

## Task 3：战斗领域空循环

| 项 | 内容 |
|---|---|
| 目标 | 建立 `BattleController` 状态机：PREP → COMBAT → SETTLE。 |
| 允许修改 | `src/game/battle/**`、`src/game/events/**`、`src/main.ts` 必要装配。 |
| 禁止事项 | 禁止实现复杂 UI；禁止写具体关卡内容到代码。 |
| 必须包含 | 固定 30 FPS sim tick；EventBus；空 battle 可跑完一局并进入结算。 |
| 验收命令 | `npm run quality:gate`。 |
| 通过标准 | 状态机可无渲染运行；无 TypeScript 错误；无魔法数硬编码。 |

## Task 4：地图路径与随机开放格位

| 项 | 内容 |
|---|---|
| 目标 | 实现路径模板随机、候选格位每局随机开放 2-3 个(产品拍板 2026-07-02,原 6 个)、开放格位五行随机。 |
| 允许修改 | `src/game/battle/map/**`、`src/config/maps.json`、必要渲染占位。 |
| 禁止事项 | 禁止固定只有一条路线；禁止固定开放格位。 |
| 必须包含 | 至少 3 套路径模板：直进压迫、折线路径、双入口汇流。 |
| 验收命令 | `npm run quality:gate`。 |
| 通过标准 | 同一关不同 seed 得到不同路径/开放格/五行；同一 seed 可复现。 |

## Task 5：基础渲染场景与水墨视觉占位

| 项 | 内容 |
|---|---|
| 目标 | 建立水墨国风占位场景：宣纸底、墨线路径、阵眼、本局开放格位(每局 2-3 个)、五行色符位。 |
| 允许修改 | `src/render/**`、`src/ui/**`、`src/style.css`、`src/config/visual.json`。 |
| 禁止事项 | 禁止纯塑料感彩色块；禁止颜色写死在渲染代码。 |
| 必须包含 | 视觉参数从 `visual.json` 读取；截图一眼能看出水墨/符箓方向。 |
| 验收命令 | `npm run quality:gate:capture`。 |
| 通过标准 | build PASS；生成截图；截图中可见路径、阵眼、格位、五行色与水墨基调。 |

## Task 6：符、怪、目标选择与承伤最小闭环

| 项 | 内容 |
|---|---|
| 目标 | 实现最小可玩闭环：怪沿路走、符自动攻击、漏怪扣阵眼血、胜负结算。 |
| 允许修改 | `src/game/battle/**`、`src/render/**`、`src/ui/**`、`src/main.ts`、`src/config/visual.json`(+schema/visual.ts,若渲染需要新参数)。**其余配置侧(数据+schema)本批已由 Claude 落定**(playerDerivation/R1 presence/相邻阈值/R3 lootCompensation/R2 override/targetingStrategyId),Codex 不得再改。 |
| 禁止事项 | 禁止把怪物 HP/攻击/速度写死到类里；禁止改 `src/game/formulas/**` 与 visual 之外的 `src/config/**`。 |
| 必须包含 | 8 类怪模板可配置；10 张符模板可配置；目标选择“离阵眼最近优先”，且实现为**可配置策略接口**(策略 id 进符配置,默认 nearest_to_core,裁定 R6)。数值校准须以**每局 2-3 开放格**为输出容量输入(产品拍板 2026-07-02,格位稀缺化)，并落地裁定 **R1 相生两档制**(同场弱/相邻强,系数入 balance+KNOBS 过五曲线)、**R2 双入口模板最少开 3 格**(模板级 openSlotCountRange override)、**R3 2 格局战利品补偿**(倍率过 sim)。详见 `docs/DESIGN_RULINGS.md`。 |
| 验收命令 | `npm run quality:gate:capture`。 |
| 通过标准 | 录屏或截图证明怪物推进、符攻击、阵眼扣血；quality gate PASS。 |

## Task 6.1：dev 调参台(?debug=1)——试运行工具,非正式 UI

| 项 | 内容 |
|---|---|
| 目标 | 浏览器内实时调参:曲线红绿(import `scripts/balance-core.mjs` 单一真相源)、旋钮覆写重算、真实战斗回放与容量曲线对照(还债 #3,校准债 #6)。**dev 专用(`?debug=1`+dev 构建),玩家不可见,不属于 T7 正式 UI。** |
| 允许修改 | `src/debug/**`(新建)、`src/main.ts`(守门动态 import + defaultLoadout 抽出)、`src/game/battle/combat/defaultLoadout.ts`(新增,从 main 抽出共享)。 |
| 禁止事项 | 禁改 `src/config/**`(本批零配置)、`src/game/formulas/**`、combat/controller/bus/map 既有行为;禁止在 src 侧复制 balance-core 公式;禁新增 npm 依赖;调参结果不落地(落地=balance-sim 全绿后 Claude 落配置)。 |
| 必须包含 | `shouldLoadDebugPanel` 纯函数守门;`computePanelModel(tables,overrides)`(未知键 throw/不改 tables);`replayBattle`(真实 CombatSimulation 全注入,统计按出生波归属);面板=红绿列表+旋钮编辑+回放对照表+"不落地"纪律横幅。接口契约钉死在 `tests/debug.gate.test.ts` 头注。 |
| 验收命令 | `npm run quality:gate -- --task T6.1`(面板视觉由 Claude 手动 `?debug=1` 截图人眼复核)。 |
| 通过标准 | debug.gate 8 用例 skip→PASS;既有 53 用例零回退;无 debug 参数时行为与 T6 完全一致。 |

## Task 7：灵机点、画符与融合的首版交互

| 项 | 内容 |
|---|---|
| 目标 | 实现第 2/4/6 波灵机点、符升级、基础画符评分、雷/冰/毒融合。 |
| 允许修改 | `src/game/battle/**`、`src/ui/**`、`src/config/fusion.json`。 |
| 禁止事项 | 禁止强制画符；画符失败不得惩罚玩家。 |
| 必须包含 | 画符 50/80/95 阈值；成功 +20%；雷/冰/毒效果来自配置。**PREP 阶段展示本关怪物五行构成**(图标/雷达,含 Boss 波标记,裁定 R4——对位决策成立的信息前提)。灵机点节奏维持 2/4/6 并埋点使用率(裁定 R5 待首测 A/B)。 |
| 验收命令 | `npm run quality:gate:capture`。 |
| 通过标准 | 不画符也能跑完；画符成功有水墨正反馈；融合效果可见。 |

## Task 8：首章 1-1 到 1-3 可玩切片

| 项 | 内容 |
|---|---|
| 目标 | 做出前三关教学切片，验证自动战斗、摆位、克制、基础奖励。 |
| 允许修改 | `src/game/**`、`src/render/**`、`src/ui/**`、配置表。 |
| 禁止事项 | 禁止实现 20 关之前跳过基础闭环验收。 |
| 必须包含 | 1-1 自动战斗；1-2 相生摆位；1-3 克制对位。 |
| 验收命令 | `npm run quality:gate:capture`。 |
| 通过标准 | 三关可进可结算；截图/录像证明核心玩法成立；Claude 验收 PASS 后才能扩展到 1-20。 |
