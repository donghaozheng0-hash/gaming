# 符塔 · 整体架构（GAME ARCHITECTURE）

> 维护：Claude（架构与模块边界）。实现：Codex（按 `docs/CODEX_TASKS.md` 逐批落地）。
> 本文遵循 Godogen `architecture.md` 立场：**OOP 优先 + 组合复用 + 数据驱动**；Babylon 只负责渲染/场景图/输入/动画，不承载玩法规则。
> 上位约束：CLAUDE.md 与 `docs/PROJECT_BRAIN.md` 的四条底层逻辑凌驾于本文之上；与本文冲突时以四条逻辑为准。

---

## 1. 架构总览（一句话）

《符塔》是「自动战斗 + 可选手绘」的玄幻画符塔防 Roguelite。架构按 **四层 + 事件总线** 切分，玩法规则集中在领域层、数值全部外置到配置层、Babylon 限定在表现层，三者通过 `EventBus` 解耦。**局内确定性模拟（30 FPS 定步长）与渲染分离**，保证手机端稳定、可埋点、可回放、可单测复现总设计算例。

```text
                 ┌─────────────────────────────────────────────┐
                 │              app (BabylonApp)                 │  引擎/画布/渲染循环/定步长驱动
                 └───────────────┬───────────────────────────────┘
                                 │ 注入 ConfigService（冻结只读）
        ┌────────────────────────┼─────────────────────────────────┐
        ▼                        ▼                                  ▼
 ┌──────────────┐     ┌────────────────────────┐         ┌────────────────────┐
 │ config 配置层 │ ──▶ │   domain 领域层         │ ──事件──▶ │ render/ui 表现层    │
 │ 纯数据 + Schema│     │ 公式 / 规则 / 状态机     │ ◀─输入── │ Babylon 渲染 + 水墨UI │
 └──────────────┘     └────────────────────────┘         └────────────────────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │  EventBus    │ 领域→表现 单向广播；输入→领域 语义动作
                          └─────────────┘
```

四层职责与目录见 `docs/DATA_ARCHITECTURE.md` 第 2/3 节（配置层、领域层 `src/game/`、表现层 `src/render/`）。本文在其基础上钉死**对象模型、核心循环、模块边界、确定性与性能策略**。

---

## 2. 核心循环（局内 1–3 分钟，对应总设计 2.4）

一局是一个显式状态机 `BattleController`，三段不可乱序：

```text
PREP（准备 ~15s）          COMBAT（波次战斗 90–120s）            SETTLE（结算 瞬间）
──────────────────        ─────────────────────────────        ─────────────────────
抽地图路径模板             WaveScheduler 按 waves 配置分波刷怪     判定胜负（7 波清完 / 阵眼破）
随机开放 2-3 格 + 随机五行  Monster 沿 Path 推进                  发奖 / 解锁扫荡 / 复活流程
玩家从 5 符中择符入格       Rune 自动选目标→DamageSystem 出伤      触发 level_end 埋点
（自动战斗玩家可直接开打）   阵眼承伤（CorePillar，承伤公式）        回到局外 Meta
                          第 2/4/6 波给灵机点（升级 / 融合）
                          可选：DrawRuneSystem 画符增伤
```

**主动决策点上限 = 4**（布阵 1 次 + 灵机点 3 次），由 `BattleController` 强约束，禁止任何系统额外插入“必须实时操作”的入口（底层逻辑一硬约束）。自动战斗为默认态：玩家不画符、不点灵机点也能跑完一局（系统自动选默认升级），零惩罚。

局外是另一个轻量循环 `MetaController`：出战配置（选 5 符）→ 进图 → 结算回收资源 → 养成（境界/符/五行修为/装备）→ 再进图。功能入口随境界解锁逐个开放（总设计 3.3），由 `ProgressionService` 控制可见性，呼应“不糊脸 10 个入口”。

---

## 3. 对象模型（OOP + 组合）

遵循 Godogen 立场：**玩法对象拥有 Babylon 节点**；行为用组合而非深继承；密集重复模拟（大量怪物）走轻量数据化系统。

### 3.1 顶层服务（单例，App 启动时装配）

| 对象 | 职责 | 依赖 |
|---|---|---|
| `BabylonApp` | 引擎、画布、渲染循环、固定步长累加器（已 scaffold） | — |
| `ConfigService` | 统一加载/校验/冻结全部配置，业务只向它取数 | config 层 |
| `SceneManager` | 战斗场景与局外场景的创建/切换/销毁 | BabylonApp |
| `EventBus` | 领域事件单向广播；类型安全的事件枚举 | — |
| `InputManager` | 把指针/手势翻译成**语义动作**（拖拽放符、画符笔迹、点击灵机点），不在玩法里散读原始事件 | BabylonApp |
| `AudioManager` | 音效/BGM（首测可后置） | — |
| `SaveService` | 局外存档（境界、资源、符等级、出战配置）持久化 | — |
| `TelemetryService` | 埋点（总设计 8.4 埋点表），事件经 EventBus 收集 | EventBus |

### 3.2 战斗领域（`src/game/battle/`）

| 对象 | 类型 | 职责 | 关键公式/配置 |
|---|---|---|---|
| `BattleController` | 状态机 | 三段流程、决策点门控、胜负判定、复活流程 | levels / waves |
| `MapLayout` | 值对象 | 抽路径模板、每局随机开放 2-3 格、每格随机五行 | maps |
| `Path` | 值对象 | 路径采样点、长度、怪物沿路推进 | maps（1000 单位） |
| `WaveScheduler` | 系统 | 按波次时间表刷怪、控制刷怪间隔 | waves / monsters |
| `Monster` | 玩法对象（拥有 mesh） | 五行、HP/护盾/攻击/速度、沿路移动、到阵眼触发承伤 | monsters（系数×R） |
| `MonsterSystem` | 数据化系统 | 集中模拟全部怪移动/目标推进（避免每怪散落 observable） | balance |
| `RuneSlot` | 玩法对象 | 区域格：位置、射程、本局随机五行、是否开放 | maps（格位类型表） |
| `Rune` | 玩法对象（拥有 mesh） | 出战符：五行、攻速、射程、品质、当前等级 | runes |
| `TargetingSystem` | 系统 | 离阵眼最近优先 + 同距优先级（Boss/精英>护盾>疾行>普通） | balance |
| `DamageSystem` | 纯函数模块 | 输出公式 4.3：基础×品质×相生×克制×(1+画功) | balance / fusion |
| `CorePillar`（阵眼） | 玩法对象 | HP=生命三围、DEF 减伤、承伤公式 4.4、告急/破阵 | balance（K=600） |
| `LingjiSystem`（灵机点） | 系统 | 第 2/4/6 波各 1 点；升级符(+15%) 或 触发融合 | balance / fusion |
| `FusionSystem` | 系统 | 配方匹配、消耗灵机点+五行精、合成元素技与克制 | fusion |
| `DrawRuneSystem`（画符） | 系统 | 笔迹采集→$1/方向序列识别→吻合度0~100%→分档加成 | balance（80/50 阈值、冷却） |

**组合行为**（mixin / component，跨怪与符复用）：`Damageable`（HP/护盾扣减）、`ElementTag`（五行/合成元素归属）、`Movable`（沿路径推进）、`Lifetime`（清理）、`Attacker`（攻速节拍+目标）、`StatusEffect`（减速/冻结/DoT/恐惧）。

### 3.3 局外养成领域（`src/game/meta/`）

| 对象 | 职责 | 配置 |
|---|---|---|
| `MetaController` | 局外主循环、入口解锁门控 | progression |
| `ProgressionService`（修为境界） | 道行经验→层→突破，基础三围平台，功能解锁 | cultivation / progression |
| `CultivationService`（五行修为） | 5 系专精、属性点分配、圆满克制 | cultivation |
| `LoadoutService`（出战配置） | 选定 5 符 + 各自五行 | runes |
| `RuneUpgradeService` | 符升级/升品消耗与攻击成长 | runes |
| `EconomyService` | 资源产出/消耗流向、副本次数、扫荡、广告点 | economy |
| `PowerService`（战力） | 三围战力公式 + 8 养成线加权、期望总战力、推荐战力对比 | balance / economy |

战力/伤害/承伤等**纯函数**集中在 `src/game/formulas/`，输入全部来自配置喂参，不内嵌任何数字，作为单测基准复现总设计第五部分算例（见 DATA_ARCHITECTURE 第 5 节）。

### 3.4 表现层（`src/render/`、`src/ui/`）

| 对象 | 职责 | 约束 |
|---|---|---|
| `InkSceneStyler` | 纸纹背景、留白、水墨描边后处理、阵眼太极纹样 | 色板/参数读 visual.json |
| `ElementEffects` | 五行/合成元素特效母题（泼墨/飞白/符箓/墨晕） | 见 VISUAL_DIRECTION 第 3 节 |
| `RuneView` / `MonsterView` | 把领域对象状态映射成 mesh/材质/动画，监听 EventBus | 不含玩法规则 |
| `CorePillarView` | 阵眼掉血→墨色变淡/龟裂/朱砂描边 | visual.json |
| `UIController` | 竖屏单手 UI、布阵/灵机点/画符/养成界面、转场墨晕 | DOM overlay 或 Babylon GUI |
| `DrawRuneView` | 画符笔迹追光、墨花绽放正反馈 | visual.json |

表现层**只读领域状态、只渲染、只发语义输入**，不得写玩法数值或规则（违反判 FAIL）。

---

## 4. 模块边界（依赖方向铁律）

```text
config  ←──读── domain  ──事件──▶  render / ui
  ▲                │                    │
  └──── 所有层只读、冻结 ───────────────┘   输入：ui/render ──语义动作──▶ domain
```

- **config 不依赖任何层**：纯数据 + Schema，无 Babylon、无 import 业务。
- **domain 只依赖 config**：禁止 `import @babylonjs/*`（除纯数学类型）。玩法可在无渲染下跑通（利于单测 / headless 模拟）。
- **render/ui 依赖 domain + config（只读）**：通过 `EventBus` 接收领域事件、通过 `InputManager` 回传语义动作；不得反向写入领域规则数值。
- **跨模块通信只走 EventBus + 语义动作**，禁止把核心规则塞进 mesh.metadata、匿名回调或散落 observable（Godogen 反模式）。

事件举例（领域→表现）：`monster.spawned/moved/died`、`rune.fired`、`damage.dealt`、`core.damaged/critical/broken`、`wave.started/ended`、`lingji.granted`、`fusion.cast`、`drawrune.scored`、`battle.settled`。这些事件同时是 `TelemetryService` 的埋点源（一套事件两用）。

---

## 5. 确定性模拟与性能

底层逻辑一要求“扛得住随时被打断”，底层逻辑二要求“爽且可复现”，VISUAL_DIRECTION 要求 30/25 FPS：

1. **固定步长战斗模拟**：战斗逻辑以 30 FPS 定步长推进（`BabylonApp` 累加 deltaTime → 跑整数个 sim tick），渲染按真实帧率插值。低端机掉帧不改变战斗结果。
2. **种子化 RNG**：每局地图随机（路径/开放格/格位五行）、掉落、Boss 分阶段用**按局种子**的 RNG，保证回放与埋点可复现，便于平衡校准。
3. **怪物走数据化系统**：大量怪的移动/目标推进/承伤集中在 `MonsterSystem` 批处理，对象池复用 mesh，不为每只怪挂独立 observable。
4. **特效可降级**：`ElementEffects` 按设备档位限制粒子数/后处理，满屏特效下保 ≥25 FPS（VISUAL_DIRECTION 性能红线）。
5. **领域无渲染依赖**：战斗可在 headless 下跑完一局用于自动化平衡测试（通过率曲线验证，对应 ACCEPTANCE_GATE 通过率指标）。

---

## 6. 三类玩家爽点如何在架构里成立（底层逻辑二）

| 玩家 | 架构落点 | 可量化验收 |
|---|---|---|
| 摸鱼/手残 | 自动战斗默认态 + 灵机点自动默认选择 + 画符零惩罚 | 全程不操作可稳定推图，无负反馈 |
| 肝帝 | `ProgressionService` 等级不封顶 + 无尽符塔（后续）+ 圆满可反复追 | 永远有可追数值 |
| 氪佬 | `PowerService` 8 养成线加权战力，效率/外观付费、强度不独占 | 不卖一锤定音碾压（红线） |
| 免费/技术 | `DamageSystem` 相生×1.3·克制×1.5·画功+20% 三件套，同符差 3 倍；技巧补差封顶 ~25–30% | 复现 5.1 算例 444→1326；越级有活路 |

“下限（数值咬合）”与“上限（技巧收益）”都必须由**配置喂参 + 公式计算**得出，不得在代码里硬写分支或期望值。

---

## 7. 与其他规范的关系

- **数值/配置隔离**：`docs/DATA_ARCHITECTURE.md`（强制门禁）。本文的领域层公式所需常数全部来自其 `balance` 等配置表。
- **视觉方向**：`docs/VISUAL_DIRECTION.md`（水墨国风、五行色板、特效母题、验收）。本文表现层对象按其规范实现。
- **施工任务**：`docs/CODEX_TASKS.md`（第一批任务、文件范围、验收标准、执行顺序）。
- **门禁**：`docs/ACCEPTANCE_GATE.md`（硬门禁核准值）。架构变更需 Claude 评审，不由 Codex 自行扩张模块职责。

## 8. 首测范围内 / 外（与 PROJECT_BRAIN 一致）

- **做**：4 层架构 + ConfigService + 1 条战斗循环（路径/刷怪/阵眼/承伤/布阵/相生/克制/护盾/画符/灵机点/融合）+ 局外境界与符/五行修为养成 + 20 关 + 1 材料本 + 1 突破本 + 10 符 + 8 类怪。
- **不做（首测）**：PvP、宗门、跨服、灵兽、灵宝、复杂词条、实时联机。架构为它们**预留事件与服务接口**（如 `PowerService` 8 线权重已含灵兽/灵宝占位），但不实现。
