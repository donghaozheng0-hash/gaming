import type { GameConfig } from "../config";
import type { FusionRecipe } from "../config/schema/fusion";
import { scoreStroke } from "../game/battle/draw/recognition";
import type {
  CombatLoadoutEntry,
  CombatSimulation,
  DrawCooldownState,
} from "../game/battle/combat/CombatSimulation";
import { summarizeWaveElements } from "../game/battle/intel";
import type { RunProgression } from "../game/battle/run/RunProgression";
import type { Vec2 } from "../game/battle/map/MapGenerator";
import type { EventBus } from "../game/events/EventBus";

interface BattleInteractionUiDeps {
  config: GameConfig;
  bus: EventBus;
  simulation: CombatSimulation;
  run: RunProgression;
  loadout: readonly CombatLoadoutEntry[];
  waveTemplateId?: string;
}

type MenuMode = "upgrade" | "fusion";

interface UiState {
  intelCompact: boolean;
  menuOpen: boolean;
  menuMode: MenuMode;
  selectedFusionSlot: number;
  selectingDrawSlot: boolean;
  drawingSlot: number | null;
  feedback: FeedbackState | null;
  settled: boolean;
  render: () => void;
  setFeedback: (feedback: FeedbackState) => void;
}

interface FeedbackState {
  text: string;
  detail: string;
  tier: string;
}

interface FusionAvailability {
  ok: boolean;
  missing: string[];
}

const elementLabels: Record<string, string> = {
  metal: "金",
  wood: "木",
  water: "水",
  fire: "火",
  earth: "土",
};

const fusionLabels: Record<string, string> = {
  thunder: "雷",
  ice: "冰",
  poison: "毒",
  ghost: "幽",
  yang: "阳",
  yin: "阴",
};

let activeCleanup: (() => void) | undefined;

export function mountBattleInteractionUi(deps: BattleInteractionUiDeps): () => void {
  activeCleanup?.();

  const host = document.querySelector<HTMLElement>("#hud");
  if (host === null) {
    throw new Error("Missing #hud");
  }

  const state: UiState = {
    intelCompact: false,
    menuOpen: false,
    menuMode: "upgrade",
    selectedFusionSlot: deps.loadout[0]?.slotIndex ?? 0,
    selectingDrawSlot: false,
    drawingSlot: null,
    feedback: null,
    settled: false,
    render: () => undefined,
    setFeedback: () => undefined,
  };
  const root = el("div", "battle-ui-root");
  applyRootStyle(root, deps.config);
  host.append(root);

  let feedbackTimer: number | undefined;
  const setFeedback = (feedback: FeedbackState): void => {
    state.feedback = feedback;
    if (feedbackTimer !== undefined) {
      window.clearTimeout(feedbackTimer);
    }
    feedbackTimer = window.setTimeout(() => {
      state.feedback = null;
      render();
    }, deps.config.visual.battleUi.feedbackDurationMs);
    render();
  };

  const render = (): void => {
    const activeDrawOverlay = root.querySelector<HTMLElement>(".battle-ui-draw-overlay");
    if (state.drawingSlot !== null && activeDrawOverlay !== null) {
      activeDrawOverlay.style.right = px(debugPanelRightInset(deps.config));
      return;
    }

    root.replaceChildren(
      renderIntel(deps, state),
      renderSlotStrip(deps),
      renderDrawEntry(deps, state),
      renderLingji(deps, state),
      ...(state.feedback === null ? [] : [renderFeedback(deps, state.feedback)]),
      ...(state.selectingDrawSlot ? [renderDrawSelector(deps, state)] : []),
      ...(state.drawingSlot === null ? [] : [renderDrawOverlay(deps, state)]),
    );
  };
  state.render = render;
  state.setFeedback = setFeedback;

  const rerender = (): void => render();
  const unsubscribers = [
    deps.bus.on("wave.started", () => {
      state.intelCompact = true;
      render();
    }),
    deps.bus.on("lingji.granted", rerender),
    deps.bus.on("lingji.spent", rerender),
    deps.bus.on("essence.dropped", rerender),
    deps.bus.on("rune.upgraded", rerender),
    deps.bus.on("rune.fused", rerender),
    deps.bus.on("draw.scored", rerender),
    deps.bus.on("battle.settled", () => {
      state.settled = true;
      state.menuOpen = false;
      state.selectingDrawSlot = false;
      state.drawingSlot = null;
      render();
    }),
  ];
  const cooldownTimer = window.setInterval(render, deps.config.visual.battleUi.cooldownRefreshMs);
  render();

  activeCleanup = () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    window.clearInterval(cooldownTimer);
    if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
    root.remove();
  };

  return activeCleanup;
}

function renderIntel(deps: BattleInteractionUiDeps, state: UiState): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const palette = deps.config.visual.palette;
  const summary = summarizeWaveElements(deps.config, deps.waveTemplateId);
  const panel = el("section", "battle-ui-intel");
  panel.style.position = "absolute";
  panel.style.left = px(ui.hudMarginPx);
  panel.style.top = px(ui.hudMarginPx);
  panel.style.right = state.intelCompact ? "" : px(ui.hudMarginPx);
  panel.style.width = state.intelCompact ? px(ui.intelCompactWidthPx) : "";
  panel.style.pointerEvents = "auto";
  panel.style.backgroundColor = palette.surface.paper;
  panel.style.borderColor = palette.ink.main;
  panel.style.borderStyle = "solid";
  panel.style.borderWidth = px(1);
  panel.style.borderRadius = px(ui.controlRadiusPx);
  panel.style.padding = px(ui.panelPaddingPx);
  panel.style.color = palette.ink.main;
  panel.style.boxSizing = "border-box";

  const title = el("div", "battle-ui-title", state.intelCompact ? "情报" : "本波五行情报");
  title.style.fontWeight = "700";
  panel.append(title);

  const row = el("div", "battle-ui-intel-row");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = px(ui.panelGapPx);
  row.style.marginTop = px(ui.panelGapPx);

  for (const item of summary.rows) {
    const chip = el("div", "battle-ui-element-chip");
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = px(ui.panelGapPx / 2);
    chip.style.minHeight = px(ui.iconSizePx);
    const icon = elementIcon(deps.config, item.element);
    const count = el("span", "battle-ui-count", `${item.potentialCount}`);
    count.style.fontVariantNumeric = "tabular-nums";
    chip.append(icon, count);
    row.append(chip);
  }
  panel.append(row);

  if (!state.intelCompact && summary.bossWaveIndexes.length > 0) {
    const boss = el("div", "battle-ui-boss");
    boss.style.marginTop = px(ui.panelGapPx);
    boss.style.color = palette.ink.warning;
    boss.textContent = `⚑ ${summary.bossWaveIndexes.join(" / ")}`;
    panel.append(boss);
  }

  return panel;
}

function renderSlotStrip(deps: BattleInteractionUiDeps): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const palette = deps.config.visual.palette;
  const state = deps.run.state();
  const strip = el("section", "battle-ui-slots");
  strip.style.position = "absolute";
  strip.style.left = "50%";
  strip.style.bottom = px(ui.hudMarginPx);
  strip.style.transform = "translateX(-50%)";
  strip.style.display = "flex";
  strip.style.gap = px(ui.panelGapPx);
  strip.style.pointerEvents = "auto";

  for (const entry of deps.loadout) {
    const rune = findRune(deps.config, entry.runeId);
    const card = el("div", "battle-ui-slot-card");
    styleCard(card, deps.config);
    card.style.width = px(ui.runeCardWidthPx);
    card.style.minHeight = px(ui.runeCardHeightPx);
    card.style.color = palette.ink.main;
    const name = el("strong", "", rune.name);
    const level = el("span", "", `Lv+${state.upgradeLevels[entry.slotIndex] ?? 0}`);
    card.append(name, level);
    const fusion = state.fusions[entry.slotIndex];
    if (fusion !== null) {
      const badge = el("span", "battle-ui-fusion-badge", labelForFusion(fusion));
      badge.style.color = colorForFusion(deps.config, fusion);
      badge.style.borderColor = colorForFusion(deps.config, fusion);
      badge.style.borderStyle = "solid";
      badge.style.borderWidth = px(1);
      badge.style.borderRadius = px(ui.controlRadiusPx);
      badge.style.padding = `${px(1)} ${px(ui.panelGapPx / 2)}`;
      card.append(badge);
    }
    strip.append(card);
  }

  return strip;
}

function renderDrawEntry(deps: BattleInteractionUiDeps, state: UiState): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const panel = el("section", "battle-ui-draw-entry");
  panel.style.position = "absolute";
  panel.style.left = px(ui.hudMarginPx);
  panel.style.bottom = px(ui.hudMarginPx);
  panel.style.pointerEvents = "auto";

  const button = commandButton(deps.config, "✎ 画符");
  button.disabled = state.settled;
  button.addEventListener("click", () => {
    state.selectingDrawSlot = !state.selectingDrawSlot;
    state.menuOpen = false;
    state.render();
  });
  panel.append(button);
  return panel;
}

function renderLingji(deps: BattleInteractionUiDeps, state: UiState): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const palette = deps.config.visual.palette;
  const wrap = el("section", "battle-ui-lingji");
  wrap.style.position = "absolute";
  wrap.style.right = px(lingjiRightMargin(deps.config));
  wrap.style.bottom = px(ui.hudMarginPx);
  wrap.style.pointerEvents = "auto";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "row-reverse";
  wrap.style.alignItems = "flex-end";
  wrap.style.gap = px(ui.panelGapPx);

  const button = document.createElement("button");
  button.type = "button";
  button.style.width = px(ui.lingjiButtonSizePx);
  button.style.height = px(ui.lingjiButtonSizePx);
  button.style.borderRadius = px(ui.controlRadiusPx);
  button.style.borderStyle = "solid";
  button.style.borderWidth = px(2);
  button.style.borderColor = palette.ink.main;
  button.style.backgroundColor = palette.surface.paper;
  button.style.color = palette.ink.main;
  button.style.cursor = state.settled ? "default" : "pointer";
  button.disabled = state.settled;
  button.append(renderLingjiDots(deps));
  button.addEventListener("click", () => {
    state.menuOpen = !state.menuOpen;
    state.selectingDrawSlot = false;
    state.render();
  });
  wrap.append(button);

  if (state.menuOpen) {
    wrap.append(renderLingjiMenu(deps, state));
  }

  return wrap;
}

function lingjiRightMargin(config: GameConfig): number {
  return Math.max(config.visual.battleUi.hudMarginPx, debugPanelRightInset(config));
}

function debugPanelRightInset(config: GameConfig): number {
  const ui = config.visual.battleUi;
  const debugPanel = document.querySelector<HTMLElement>("#futa-debug-panel");
  if (debugPanel === null) {
    return 0;
  }

  const panelRect = debugPanel.getBoundingClientRect();
  if (panelRect.width === 0 || panelRect.height === 0) {
    return 0;
  }

  return Math.max(0, window.innerWidth - panelRect.left + ui.panelGapPx);
}

function renderLingjiDots(deps: BattleInteractionUiDeps): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const palette = deps.config.visual.palette;
  const state = deps.run.state();
  const dots = el("div", "battle-ui-lingji-dots");
  dots.style.display = "flex";
  dots.style.justifyContent = "center";
  dots.style.gap = px(ui.panelGapPx / 2);
  dots.style.pointerEvents = "none";

  for (let index = 0; index < deps.config.balance.battle.maxLingjiPointsPerRun; index += 1) {
    const dot = el("span");
    dot.style.width = px(ui.iconSizePx / 2);
    dot.style.height = px(ui.iconSizePx / 2);
    dot.style.borderRadius = "50%";
    dot.style.borderStyle = "solid";
    dot.style.borderWidth = px(1);
    dot.style.borderColor = palette.ink.main;
    dot.style.backgroundColor = index < state.lingjiPoints ? palette.ink.main : palette.surface.paper;
    dots.append(dot);
  }

  return dots;
}

function renderLingjiMenu(deps: BattleInteractionUiDeps, state: UiState): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const menu = el("div", "battle-ui-menu");
  styleCard(menu, deps.config);
  menu.style.width = px(ui.menuWidthPx);
  menu.style.padding = px(ui.panelPaddingPx);
  menu.style.display = "flex";
  menu.style.flexDirection = "column";
  menu.style.gap = px(ui.panelGapPx);

  const tabs = el("div", "battle-ui-tabs");
  tabs.style.display = "flex";
  tabs.style.gap = px(ui.panelGapPx);
  tabs.append(
    modeButton(deps.config, "升级", state.menuMode === "upgrade", () => {
      state.menuMode = "upgrade";
      state.render();
    }),
    modeButton(deps.config, "融合", state.menuMode === "fusion", () => {
      state.menuMode = "fusion";
      state.render();
    }),
  );
  menu.append(tabs, state.menuMode === "upgrade" ? renderUpgradePanel(deps) : renderFusionPanel(deps, state));
  return menu;
}

function renderUpgradePanel(deps: BattleInteractionUiDeps): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const state = deps.run.state();
  const panel = el("div", "battle-ui-upgrade-panel");
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = px(ui.panelGapPx);

  for (const entry of deps.loadout) {
    const rune = findRune(deps.config, entry.runeId);
    const button = commandButton(
      deps.config,
      `${rune.name} · Lv+${state.upgradeLevels[entry.slotIndex] ?? 0}`,
    );
    button.disabled = state.lingjiPoints < 1;
    applyDisabledStyle(button, deps.config, button.disabled);
    button.addEventListener("click", () => {
      if (state.lingjiPoints >= 1) {
        deps.run.upgradeRune(entry.slotIndex);
      }
    });
    panel.append(button);
  }

  return panel;
}

function renderFusionPanel(deps: BattleInteractionUiDeps, state: UiState): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const panel = el("div", "battle-ui-fusion-panel");
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = px(ui.panelGapPx);

  const slotRow = el("div", "battle-ui-fusion-slots");
  slotRow.style.display = "flex";
  slotRow.style.gap = px(ui.panelGapPx);
  for (const entry of deps.loadout) {
    const rune = findRune(deps.config, entry.runeId);
    const button = modeButton(deps.config, rune.name, state.selectedFusionSlot === entry.slotIndex, () => {
      state.selectedFusionSlot = entry.slotIndex;
      state.render();
    });
    slotRow.append(button);
  }
  panel.append(slotRow);

  const openRecipeIds = deps.config.fusion.unlockSchedule[0]?.recipeIds ?? [];
  for (const recipeId of openRecipeIds) {
    const recipe = findRecipe(deps.config, recipeId);
    const availability = fusionAvailability(deps, recipe);
    const button = commandButton(deps.config, `${recipe.name} · ${recipe.baseElements.map(labelForElement).join("+")}`);
    button.disabled = !availability.ok;
    applyDisabledStyle(button, deps.config, button.disabled);
    button.style.justifyContent = "space-between";
    const missing = el("span", "", availability.ok ? "可融合" : availability.missing.join(" / "));
    missing.style.marginLeft = px(ui.panelGapPx);
    missing.style.fontSize = "0.86em";
    button.append(missing);
    button.addEventListener("click", () => {
      if (availability.ok) {
        deps.run.fuseRune(state.selectedFusionSlot, recipe.id);
      }
    });
    panel.append(button);
  }

  return panel;
}

function renderDrawSelector(deps: BattleInteractionUiDeps, state: UiState): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const panel = el("section", "battle-ui-draw-selector");
  styleCard(panel, deps.config);
  panel.style.position = "absolute";
  panel.style.left = px(ui.hudMarginPx);
  panel.style.bottom = px(ui.hudMarginPx + ui.buttonHeightPx + ui.panelGapPx);
  panel.style.padding = px(ui.panelPaddingPx);
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = px(ui.panelGapPx);
  panel.style.pointerEvents = "auto";

  for (const entry of deps.loadout) {
    const rune = findRune(deps.config, entry.runeId);
    const cooldown = deps.simulation.getDrawCooldown(entry.slotIndex);
    const label = cooldown.ready ? rune.name : `${rune.name} · ${cooldown.remainingSeconds.toFixed(1)}s`;
    const button = commandButton(deps.config, label);
    button.disabled = !cooldown.ready || state.settled;
    applyDisabledStyle(button, deps.config, button.disabled);
    button.addEventListener("click", () => {
      if (cooldown.ready) {
        state.drawingSlot = entry.slotIndex;
        state.selectingDrawSlot = false;
        state.render();
      }
    });
    panel.append(button);
  }

  return panel;
}

function renderDrawOverlay(
  deps: BattleInteractionUiDeps,
  state: UiState,
): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const palette = deps.config.visual.palette;
  const overlay = el("section", "battle-ui-draw-overlay");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.right = px(debugPanelRightInset(deps.config));
  overlay.style.pointerEvents = "auto";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = px(ui.drawOverlayPaddingPx);
  overlay.style.boxSizing = "border-box";

  const scrim = el("div", "battle-ui-scrim");
  scrim.style.position = "absolute";
  scrim.style.inset = "0";
  scrim.style.backgroundColor = palette.ink.main;
  scrim.style.opacity = String(ui.scrimOpacity);
  overlay.append(scrim);

  const paper = el("div", "battle-ui-draw-paper");
  paper.style.position = "relative";
  paper.style.width = "100%";
  paper.style.maxWidth = px(ui.drawPaperMaxWidthPx);
  paper.style.height = "100%";
  paper.style.maxHeight = px(ui.drawPaperMaxHeightPx);
  paper.style.backgroundColor = palette.surface.paper;
  paper.style.opacity = String(ui.paperOpacity);
  paper.style.borderStyle = "solid";
  paper.style.borderWidth = px(2);
  paper.style.borderColor = palette.ink.warning;
  paper.style.borderRadius = px(ui.controlRadiusPx);
  paper.style.overflow = "hidden";
  paper.style.touchAction = "none";

  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  paper.append(canvas);
  overlay.append(paper);

  const entry = deps.loadout.find((candidate) => candidate.slotIndex === state.drawingSlot);
  if (entry !== undefined) {
    const rune = findRune(deps.config, entry.runeId);
    attachDrawCanvas(canvas, deps, rune, entry.slotIndex, state);
  }

  return overlay;
}

function attachDrawCanvas(
  canvas: HTMLCanvasElement,
  deps: BattleInteractionUiDeps,
  rune: GameConfig["runes"]["runes"][number],
  slotIndex: number,
  state: UiState,
): void {
  const points: Vec2[] = [];
  let drawing = false;

  const redraw = (): void => {
    resizeCanvas(canvas, deps.config);
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    drawTemplate(ctx, canvas, deps.config, rune.drawTemplate);
    drawStroke(ctx, canvas, deps.config, points);
  };

  requestAnimationFrame(redraw);
  // capture/release 失败(指针已失效、pointercancel 竞争等)不得中断画符提交链。
  const capturePointer = (event: PointerEvent): void => {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // 忽略:捕获只是优化拖出画布的体验,失败不影响轨迹采集
    }
  };
  const releasePointer = (event: PointerEvent): void => {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // 忽略:同上
    }
  };
  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    points.length = 0;
    capturePointer(event);
    points.push(normalizedPoint(canvas, event));
    redraw();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    points.push(normalizedPoint(canvas, event));
    redraw();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!drawing) return;
    drawing = false;
    releasePointer(event);
    points.push(normalizedPoint(canvas, event));
    submitDrawStroke(deps, rune, slotIndex, points, state);
  });
  canvas.addEventListener("pointercancel", () => {
    drawing = false;
    state.drawingSlot = null;
    state.render();
  });
}

function submitDrawStroke(
  deps: BattleInteractionUiDeps,
  rune: GameConfig["runes"]["runes"][number],
  slotIndex: number,
  points: readonly Vec2[],
  state: UiState,
): void {
  const score = scoreStroke(points, rune.drawTemplate);
  state.drawingSlot = null;

  try {
    const result = deps.simulation.submitDraw(slotIndex, score);
    state.setFeedback(feedbackFor(deps.config, score, result.tier, result.bonus));
  } catch (error) {
    state.setFeedback({
      text: "冷却中",
      detail: error instanceof Error ? error.message : "draw rejected",
      tier: "none",
    });
  }
}

function feedbackFor(config: GameConfig, score: number, tier: string, bonus: number): FeedbackState {
  const pct = Math.round(bonus * 100);
  if (tier === "perfect") {
    return { text: "金边", detail: `${Math.round(score)} · +${pct}%`, tier };
  }
  if (tier === "full") {
    return { text: "朱边", detail: `${Math.round(score)} · +${pct}%`, tier };
  }
  if (tier === "partial") {
    return { text: "成符", detail: `${Math.round(score)} · +${pct}%`, tier };
  }

  void config;
  return { text: "涣散", detail: `${Math.round(score)}`, tier };
}

function renderFeedback(deps: BattleInteractionUiDeps, feedback: FeedbackState): HTMLElement {
  const ui = deps.config.visual.battleUi;
  const panel = el("aside", "battle-ui-feedback");
  styleCard(panel, deps.config);
  panel.style.position = "absolute";
  panel.style.left = "50%";
  panel.style.top = "50%";
  panel.style.transform = "translate(-50%, -50%)";
  panel.style.padding = px(ui.panelPaddingPx);
  panel.style.pointerEvents = "none";
  panel.style.textAlign = "center";
  panel.style.borderColor = feedbackColor(deps.config, feedback.tier);
  panel.append(el("strong", "", feedback.text), el("div", "", feedback.detail));
  return panel;
}

function fusionAvailability(deps: BattleInteractionUiDeps, recipe: FusionRecipe): FusionAvailability {
  const state = deps.run.state();
  const missing: string[] = [];
  const loadoutElements = new Set(deps.loadout.map((entry) => findRune(deps.config, entry.runeId).element));

  for (const element of recipe.baseElements) {
    if (!loadoutElements.has(element)) {
      missing.push(`缺${labelForElement(element)}符`);
    }
  }

  if (state.lingjiPoints < recipe.cost.lingjiPoints) {
    missing.push("缺灵机");
  }

  for (const element of deps.config.balance.elements.ids) {
    const required = recipe.cost.essences[element] ?? 0;
    if (state.essences[element] < required) {
      missing.push(`缺${labelForElement(element)}精`);
    }
  }

  return { ok: missing.length === 0, missing };
}

function resizeCanvas(canvas: HTMLCanvasElement, config: GameConfig): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(config.visual.battleUi.drawPaperMaxWidthPx / 2, rect.width);
  const height = Math.max(config.visual.battleUi.drawPaperMaxHeightPx / 2, rect.height);
  if (canvas.width !== Math.round(width)) canvas.width = Math.round(width);
  if (canvas.height !== Math.round(height)) canvas.height = Math.round(height);
}

function drawTemplate(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: GameConfig,
  template: readonly Vec2[],
): void {
  const palette = config.visual.palette;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.strokeStyle = palette.ink.main;
  ctx.globalAlpha = config.visual.battleUi.disabledOpacity;
  ctx.lineWidth = config.visual.battleUi.drawTemplateStrokeWidthPx;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawPolyline(ctx, canvas, template);
  ctx.restore();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: GameConfig,
  points: readonly Vec2[],
): void {
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = config.visual.palette.ink.warning;
  ctx.lineWidth = config.visual.battleUi.drawStrokeWidthPx;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawPolyline(ctx, canvas, points);
  ctx.restore();
}

function drawPolyline(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, points: readonly Vec2[]): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x * canvas.width, points[index].y * canvas.height);
  }
  ctx.stroke();
}

function normalizedPoint(canvas: HTMLCanvasElement, event: PointerEvent): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(0, 1, (event.clientX - rect.left) / rect.width),
    y: clamp(0, 1, (event.clientY - rect.top) / rect.height),
  };
}

function elementIcon(config: GameConfig, element: string): HTMLElement {
  const ui = config.visual.battleUi;
  const palette = config.visual.palette;
  const icon = el("span", "battle-ui-element-icon", labelForElement(element));
  const color = colorForElement(config, element);
  icon.style.width = px(ui.iconSizePx);
  icon.style.height = px(ui.iconSizePx);
  icon.style.display = "inline-flex";
  icon.style.alignItems = "center";
  icon.style.justifyContent = "center";
  icon.style.borderRadius = "50%";
  icon.style.borderStyle = "solid";
  icon.style.borderWidth = px(2);
  icon.style.borderColor = palette.ink.main;
  icon.style.backgroundColor = element === "metal" ? palette.ink.main : palette.surface.paper;
  icon.style.color = element === "metal" ? color : palette.ink.main;
  icon.style.boxSizing = "border-box";
  return icon;
}

function commandButton(config: GameConfig, label: string): HTMLButtonElement {
  const ui = config.visual.battleUi;
  const palette = config.visual.palette;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.minHeight = px(ui.buttonHeightPx);
  button.style.borderRadius = px(ui.controlRadiusPx);
  button.style.borderStyle = "solid";
  button.style.borderWidth = px(1);
  button.style.borderColor = palette.ink.main;
  button.style.backgroundColor = palette.surface.paper;
  button.style.color = palette.ink.main;
  button.style.cursor = "pointer";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.gap = px(ui.panelGapPx);
  button.style.padding = `${px(1)} ${px(ui.panelPaddingPx)}`;
  button.style.font = "inherit";
  return button;
}

function modeButton(config: GameConfig, label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const button = commandButton(config, label);
  if (active) {
    button.style.backgroundColor = config.visual.palette.ink.main;
    button.style.color = config.visual.palette.surface.paper;
  }
  button.addEventListener("click", onClick);
  return button;
}

function styleCard(element: HTMLElement, config: GameConfig): void {
  const ui = config.visual.battleUi;
  const palette = config.visual.palette;
  element.style.backgroundColor = palette.surface.paper;
  element.style.borderColor = palette.ink.main;
  element.style.borderStyle = "solid";
  element.style.borderWidth = px(1);
  element.style.borderRadius = px(ui.controlRadiusPx);
  element.style.boxSizing = "border-box";
  element.style.color = palette.ink.main;
}

function applyRootStyle(root: HTMLElement, config: GameConfig): void {
  const ui = config.visual.battleUi;
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.pointerEvents = "none";
  root.style.zIndex = String(ui.zIndex);
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.letterSpacing = "0";
}

function applyDisabledStyle(element: HTMLElement, config: GameConfig, disabled: boolean): void {
  element.style.opacity = disabled ? String(config.visual.battleUi.disabledOpacity) : "1";
  element.style.cursor = disabled ? "default" : "pointer";
}

function feedbackColor(config: GameConfig, tier: string): string {
  if (tier === "perfect") return colorForFusion(config, "yang");
  if (tier === "full") return config.visual.palette.ink.warning;
  return config.visual.palette.ink.main;
}

function colorForElement(config: GameConfig, element: string): string {
  const palette = config.visual.palette.elements[element];
  if (palette === undefined) return config.visual.palette.ink.main;
  return palette.primary;
}

function colorForFusion(config: GameConfig, fusion: string): string {
  const palette = config.visual.palette.fusedElements[fusion];
  if (palette === undefined) return config.visual.palette.ink.warning;
  return palette.primary;
}

function findRune(config: GameConfig, runeId: string): GameConfig["runes"]["runes"][number] {
  const rune = config.runes.runes.find((candidate) => candidate.id === runeId);
  if (rune === undefined) throw new Error(`runes.runes unknown rune "${runeId}"`);
  return rune;
}

function findRecipe(config: GameConfig, recipeId: string): FusionRecipe {
  const recipe = config.fusion.recipes.find((candidate) => candidate.id === recipeId);
  if (recipe === undefined) throw new Error(`fusion.recipes unknown recipe "${recipeId}"`);
  return recipe;
}

function labelForElement(element: string): string {
  return elementLabels[element] ?? element;
}

function labelForFusion(fusion: string): string {
  return fusionLabels[fusion] ?? fusion;
}

function px(value: number): string {
  return `${value}px`;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== undefined && className.length > 0) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
