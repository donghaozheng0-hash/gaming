import { loadGameConfig, type GameConfig } from "../config";

type StyleboardSectionId = "entry" | "hud" | "monsters" | "draw";
type ElementKey = "metal" | "wood" | "water" | "fire" | "earth";

export interface StyleboardSection {
  id: StyleboardSectionId;
  title: string;
}

export interface MonsterSketchSpec {
  monsterId: string;
  name: string;
  feature: string;
}

interface StyleboardColors {
  paper: string;
  ink: string;
  seal: string;
  metal: string;
  wood: string;
  water: string;
  fire: string;
  earth: string;
  thunder: string;
  gold: string;
}

interface Point {
  x: number;
  y: number;
}

export const STYLEBOARD_SECTIONS: ReadonlyArray<StyleboardSection> = [
  { id: "entry", title: "入场界面" },
  { id: "hud", title: "战斗 HUD" },
  { id: "monsters", title: "八怪图鉴" },
  { id: "draw", title: "画符交互示意" },
];

const MONSTER_FEATURES_BY_ID: Readonly<Record<string, string>> = {
  normal_yaobing: "基本墨团直立,一笔重顿的头部",
  swarm_xiaoyao: "三小团簇拥,错落高低",
  fast_yao: "低伏前倾,身后两道拖尾流线",
  armored_yao: "方厚块身形,横向三笔甲片",
  shield_yao: "常规墨团,体外一圈半透明环晕",
  split_yao: "双瓣墨团,中缝一道留白细线",
  elite_yaojiang: "竖长身形,头顶双角,肩部重笔",
  chapter_boss: "大墨团约常规二倍,体表朱砂裂纹与底部威压晕圈",
};

const MONSTER_ACCENT_BY_ID: Readonly<Record<string, ElementKey>> = {
  normal_yaobing: "wood",
  swarm_xiaoyao: "water",
  fast_yao: "fire",
  armored_yao: "metal",
  shield_yao: "earth",
  split_yao: "wood",
  elite_yaojiang: "water",
  chapter_boss: "earth",
};

export const MONSTER_SKETCH_SPECS: readonly MonsterSketchSpec[] = loadGameConfig().monsters.monsters.map(
  (monster) => ({
    monsterId: monster.id,
    name: monster.name,
    feature: requiredText(MONSTER_FEATURES_BY_ID, monster.id, "monster sketch feature"),
  }),
);

const boardId = "futa-styleboard";
const styleId = "futa-styleboard-style";
let activeCleanup: (() => void) | undefined;

export function mountStyleboard(opts: { config: GameConfig }): void {
  activeCleanup?.();
  ensureStyle();

  const colors = colorsFromConfig(opts.config);
  hideHostElement("game-canvas");
  hideHostElement("hud");

  const root = element("div", "styleboard-root");
  root.id = boardId;
  applyPaletteVariables(root, colors);

  const redrawJobs: Array<() => void> = [];
  const nav = element("nav", "styleboard-nav");
  nav.setAttribute("aria-label", "styleboard sections");
  for (const section of STYLEBOARD_SECTIONS) {
    const link = element("a", "", section.id);
    link.href = `#styleboard-${section.id}`;
    nav.append(link);
  }

  const header = element("header", "styleboard-header");
  header.append(element("div", "styleboard-kicker", "dev 草图评审页"), element("h1", "", "雾山五行风格草图板"), nav);

  const main = element("main", "styleboard-main");
  main.append(
    entrySection(colors, redrawJobs),
    hudSection(colors, redrawJobs),
    monstersSection(colors, redrawJobs),
    drawSection(colors, redrawJobs),
  );

  root.append(header, main);
  document.body.append(root);

  const controller = new AbortController();
  const redraw = (): void => {
    for (const job of redrawJobs) job();
  };
  window.addEventListener("resize", redraw, { signal: controller.signal });
  requestAnimationFrame(redraw);

  activeCleanup = () => {
    controller.abort();
    root.remove();
  };
}

function entrySection(colors: StyleboardColors, redrawJobs: Array<() => void>): HTMLElement {
  const canvas = sketchCanvas("入场界面草图");
  redrawJobs.push(() => paintEntry(canvas, colors));
  return sectionShell("entry", "入场界面", "宣纸留白 / 淡墨远山 / 朱印入塔", canvas);
}

function hudSection(colors: StyleboardColors, redrawJobs: Array<() => void>): HTMLElement {
  const canvas = sketchCanvas("战斗 HUD 草图");
  redrawJobs.push(() => paintHud(canvas, colors));
  return sectionShell("hud", "战斗 HUD", "顶栏卷轴 / R4 情报条 / 底部符栏 · 非交互", canvas);
}

function monstersSection(colors: StyleboardColors, redrawJobs: Array<() => void>): HTMLElement {
  const section = sectionShell("monsters", "八怪图鉴", "墨团为体 / 笔触勾边 / 五行色一处晕染");
  const grid = element("div", "monster-grid");

  for (const spec of MONSTER_SKETCH_SPECS) {
    const card = element("article", "monster-card");
    const canvas = sketchCanvas(`${spec.name} 水墨剪影`);
    canvas.classList.add("monster-canvas");
    const meta = element("div", "monster-meta");
    meta.append(element("strong", "", spec.name), element("code", "", spec.monsterId), element("p", "", spec.feature));
    card.append(canvas, meta);
    grid.append(card);
    redrawJobs.push(() => paintMonster(canvas, spec, colors));
  }

  section.append(grid);
  return section;
}

function drawSection(colors: StyleboardColors, redrawJobs: Array<() => void>): HTMLElement {
  const canvas = sketchCanvas("画符评分反馈草图");
  redrawJobs.push(() => paintDraw(canvas, colors));
  return sectionShell("draw", "画符交互示意", "评分阈值 50/80/95,来自 balance 配置——本页仅样式示意", canvas);
}

function sectionShell(id: StyleboardSectionId, title: string, subtitle: string, canvas?: HTMLCanvasElement): HTMLElement {
  const section = element("section", "styleboard-section");
  section.id = `styleboard-${id}`;
  const head = element("div", "section-head");
  head.append(element("h2", "", title), element("p", "", subtitle));
  section.append(head);
  if (canvas !== undefined) {
    const frame = element("div", "canvas-frame");
    frame.append(canvas);
    section.append(frame);
  }
  return section;
}

function sketchCanvas(label: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "styleboard-canvas";
  canvas.setAttribute("aria-label", label);
  return canvas;
}

function paintEntry(canvas: HTMLCanvasElement, colors: StyleboardColors): void {
  const { ctx, width, height } = setupCanvas(canvas, 1120, 700, colors);
  drawPaperTexture(ctx, width, height, colors, 101);
  drawMountainLayer(ctx, width, height, colors, 0.34, 0.18, 0.10, 11);
  drawMountainLayer(ctx, width, height, colors, 0.48, 0.22, 0.17, 23);
  drawMountainLayer(ctx, width, height, colors, 0.62, 0.18, 0.24, 37);

  drawCalligraphy(ctx, "符塔", width * 0.5, height * 0.36, Math.min(132, width * 0.14), colors);
  drawSealButton(ctx, width * 0.5, height * 0.69, Math.min(128, width * 0.12), colors);

  ctx.save();
  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = 0.74;
  ctx.font = `${Math.max(16, width * 0.022)}px "Songti SC", "STSong", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("每日三局·塔无尽头", width * 0.5, height * 0.84);
  ctx.restore();
}

function paintHud(canvas: HTMLCanvasElement, colors: StyleboardColors): void {
  const { ctx, width, height } = setupCanvas(canvas, 1120, 660, colors);
  drawPaperTexture(ctx, width, height, colors, 202);

  const frame = {
    x: width * 0.055,
    y: height * 0.09,
    w: width * 0.89,
    h: width * 0.89 * 9 / 16,
  };
  if (frame.y + frame.h > height * 0.92) frame.h = height * 0.82;

  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 4;
  roughRect(ctx, frame.x, frame.y, frame.w, frame.h, 9, 217);
  ctx.stroke();
  ctx.restore();

  drawCombatPlaceholder(ctx, frame.x, frame.y, frame.w, frame.h, colors);
  drawScrollBar(ctx, frame.x + 26, frame.y + 22, frame.w - 52, 62, colors);
  drawR4Info(ctx, frame.x + 36, frame.y + 96, frame.w - 72, 76, colors);
  drawRuneBar(ctx, frame.x + 46, frame.y + frame.h - 128, frame.w - 92, 94, colors);

  ctx.save();
  ctx.fillStyle = colors.seal;
  ctx.font = `700 ${Math.max(16, width * 0.017)}px "Songti SC", serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("非交互", frame.x + frame.w - 28, frame.y + frame.h - 22);
  ctx.restore();
}

function paintMonster(canvas: HTMLCanvasElement, spec: MonsterSketchSpec, colors: StyleboardColors): void {
  const { ctx, width, height } = setupCanvas(canvas, 320, 240, colors);
  drawPaperTexture(ctx, width, height, colors, hashText(spec.monsterId));

  const accentKey = requiredElementKey(MONSTER_ACCENT_BY_ID, spec.monsterId);
  const accent = colors[accentKey];
  const cx = width * 0.5;
  const cy = height * 0.53;

  switch (spec.monsterId) {
    case "normal_yaobing":
      drawInkBlob(ctx, cx, cy, width * 0.16, height * 0.25, 301, colors, { color: accent, dx: 0.2, dy: -0.18 });
      drawInkBlob(ctx, cx - width * 0.02, cy - height * 0.24, width * 0.12, height * 0.1, 302, colors);
      break;
    case "swarm_xiaoyao":
      drawInkBlob(ctx, cx - width * 0.12, cy + height * 0.03, width * 0.11, height * 0.16, 321, colors, {
        color: accent,
        dx: -0.08,
        dy: -0.12,
      });
      drawInkBlob(ctx, cx + width * 0.05, cy - height * 0.03, width * 0.13, height * 0.2, 322, colors, {
        color: accent,
        dx: 0.12,
        dy: -0.08,
      });
      drawInkBlob(ctx, cx + width * 0.18, cy + height * 0.05, width * 0.1, height * 0.14, 323, colors);
      break;
    case "fast_yao":
      dryBrushLine(ctx, [
        { x: cx - width * 0.34, y: cy + height * 0.08 },
        { x: cx - width * 0.02, y: cy - height * 0.04 },
      ], width * 0.055, colors.ink, 0.34, 351);
      dryBrushLine(ctx, [
        { x: cx - width * 0.38, y: cy + height * 0.17 },
        { x: cx - width * 0.04, y: cy + height * 0.05 },
      ], width * 0.037, colors.ink, 0.28, 352);
      drawInkBlob(ctx, cx + width * 0.08, cy + height * 0.02, width * 0.22, height * 0.13, 353, colors, {
        color: accent,
        dx: 0.1,
        dy: -0.1,
      });
      drawInkBlob(ctx, cx + width * 0.28, cy - height * 0.05, width * 0.09, height * 0.08, 354, colors);
      break;
    case "armored_yao":
      drawBoxBody(ctx, cx, cy, width * 0.34, height * 0.39, colors, accent);
      break;
    case "shield_yao":
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.36;
      ctx.lineWidth = width * 0.035;
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * 0.24, height * 0.31, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawInkBlob(ctx, cx, cy, width * 0.16, height * 0.23, 381, colors, { color: accent, dx: -0.1, dy: -0.14 });
      break;
    case "split_yao":
      drawInkBlob(ctx, cx - width * 0.075, cy, width * 0.14, height * 0.24, 391, colors, {
        color: accent,
        dx: -0.12,
        dy: -0.08,
      });
      drawInkBlob(ctx, cx + width * 0.075, cy, width * 0.14, height * 0.24, 392, colors);
      ctx.save();
      ctx.strokeStyle = colors.paper;
      ctx.lineWidth = width * 0.018;
      ctx.beginPath();
      ctx.moveTo(cx, cy - height * 0.24);
      ctx.quadraticCurveTo(cx + width * 0.03, cy, cx - width * 0.01, cy + height * 0.25);
      ctx.stroke();
      ctx.restore();
      break;
    case "elite_yaojiang":
      drawInkBlob(ctx, cx, cy + height * 0.02, width * 0.15, height * 0.35, 401, colors, {
        color: accent,
        dx: 0.15,
        dy: -0.2,
      });
      dryBrushLine(ctx, [
        { x: cx - width * 0.07, y: cy - height * 0.34 },
        { x: cx - width * 0.15, y: cy - height * 0.47 },
      ], width * 0.026, colors.ink, 0.84, 402);
      dryBrushLine(ctx, [
        { x: cx + width * 0.07, y: cy - height * 0.34 },
        { x: cx + width * 0.15, y: cy - height * 0.47 },
      ], width * 0.026, colors.ink, 0.84, 403);
      dryBrushLine(ctx, [
        { x: cx - width * 0.24, y: cy - height * 0.02 },
        { x: cx + width * 0.24, y: cy - height * 0.04 },
      ], width * 0.052, colors.ink, 0.78, 404);
      break;
    case "chapter_boss":
      ctx.save();
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = width * 0.035;
      ctx.beginPath();
      ctx.ellipse(cx, cy + height * 0.29, width * 0.34, height * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawInkBlob(ctx, cx, cy, width * 0.28, height * 0.31, 431, colors, { color: accent, dx: -0.2, dy: 0.08 });
      drawCracks(ctx, cx, cy, width, height, colors);
      break;
    default:
      drawInkBlob(ctx, cx, cy, width * 0.16, height * 0.22, 499, colors, { color: accent, dx: 0, dy: 0 });
      break;
  }
}

function paintDraw(canvas: HTMLCanvasElement, colors: StyleboardColors): void {
  const { ctx, width, height } = setupCanvas(canvas, 1120, 620, colors);
  drawPaperTexture(ctx, width, height, colors, 505);

  const talisman = { x: width * 0.065, y: height * 0.1, w: width * 0.29, h: height * 0.76 };
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 3;
  roughRect(ctx, talisman.x, talisman.y, talisman.w, talisman.h, 10, 511);
  ctx.stroke();
  ctx.restore();
  drawThunderPath(ctx, talisman.x, talisman.y, talisman.w, talisman.h, colors.thunder, colors.ink, 1);

  const states = [
    { label: "<50", caption: "墨迹涣散", alpha: 0.24, edge: "" },
    { label: "≥50", caption: "成符", alpha: 0.78, edge: "" },
    { label: "≥80", caption: "笔锋朱边 +20%", alpha: 0.9, edge: colors.seal },
    { label: "≥95", caption: "金光描边 完美", alpha: 0.96, edge: colors.gold },
  ];
  const startX = width * 0.43;
  const gap = width * 0.025;
  const cardW = (width * 0.51 - gap * 3) / 4;
  const cardH = height * 0.56;
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    const x = startX + index * (cardW + gap);
    const y = height * 0.18;
    ctx.save();
    ctx.strokeStyle = colors.ink;
    ctx.globalAlpha = 0.44;
    ctx.lineWidth = 2;
    roughRect(ctx, x, y, cardW, cardH, 8, 540 + index);
    ctx.stroke();
    ctx.restore();

    if (state.edge !== "") {
      ctx.save();
      ctx.strokeStyle = state.edge;
      ctx.globalAlpha = state.edge === colors.gold ? 0.72 : 0.82;
      ctx.lineWidth = state.edge === colors.gold ? 6 : 4;
      roughRect(ctx, x + 8, y + 8, cardW - 16, cardH - 16, 8, 560 + index);
      ctx.stroke();
      ctx.restore();
    }

    drawMiniRune(ctx, x, y, cardW, cardH, colors, state.alpha, 570 + index);
    ctx.save();
    ctx.fillStyle = colors.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.max(18, width * 0.019)}px "Songti SC", serif`;
    ctx.fillText(state.label, x + cardW * 0.5, y + cardH + height * 0.07);
    ctx.font = `${Math.max(13, width * 0.012)}px "Songti SC", serif`;
    ctx.fillText(state.caption, x + cardW * 0.5, y + cardH + height * 0.12);
    ctx.restore();
  }
}

function colorsFromConfig(config: GameConfig): StyleboardColors {
  const { palette } = config.visual;
  return {
    paper: palette.surface.paper,
    ink: palette.ink.main,
    seal: palette.ink.warning,
    metal: palette.elements.metal.primary,
    wood: palette.elements.wood.primary,
    water: palette.elements.water.primary,
    fire: palette.elements.fire.primary,
    earth: palette.elements.earth.primary,
    thunder: palette.fusedElements.thunder.primary,
    gold: palette.fusedElements.yang.primary,
  };
}

function applyPaletteVariables(root: HTMLElement, colors: StyleboardColors): void {
  root.style.setProperty("--paper", colors.paper);
  root.style.setProperty("--ink", colors.ink);
  root.style.setProperty("--seal", colors.seal);
  root.style.setProperty("--metal", colors.metal);
  root.style.setProperty("--wood", colors.wood);
  root.style.setProperty("--water", colors.water);
  root.style.setProperty("--fire", colors.fire);
  root.style.setProperty("--earth", colors.earth);
  root.style.setProperty("--thunder", colors.thunder);
  root.style.setProperty("--gold", colors.gold);
}

function setupCanvas(
  canvas: HTMLCanvasElement,
  fallbackWidth: number,
  fallbackHeight: number,
  colors: StyleboardColors,
): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(canvas.clientWidth || fallbackWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight || fallbackHeight));
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("[styleboard] 2D canvas unavailable");
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawPaperTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: StyleboardColors,
  seed: number,
): void {
  const next = mulberry32(seed);
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.lineCap = "round";
  for (let index = 0; index < 96; index += 1) {
    const x = next() * width;
    const y = next() * height;
    const length = 18 + next() * 54;
    ctx.globalAlpha = 0.018 + next() * 0.025;
    ctx.lineWidth = 0.5 + next() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (next() - 0.5) * 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMountainLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: StyleboardColors,
  baseRatio: number,
  amplitudeRatio: number,
  alpha: number,
  seed: number,
): void {
  const next = mulberry32(seed);
  const baseY = height * baseRatio;
  const amplitude = height * amplitudeRatio;
  ctx.save();
  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, baseY);
  const steps = 9;
  for (let index = 0; index <= steps; index += 1) {
    const x = width * index / steps;
    const crest = baseY - amplitude * (0.28 + next() * 0.72);
    ctx.lineTo(x, crest);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCalligraphy(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colors: StyleboardColors,
): void {
  const next = mulberry32(701);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${size}px "STKaiti", "Kaiti SC", "Songti SC", serif`;
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 5; pass += 1) {
    const offsetX = (next() - 0.5) * size * 0.06;
    const offsetY = (next() - 0.5) * size * 0.045;
    ctx.save();
    ctx.translate(x + offsetX, y + offsetY);
    ctx.rotate((next() - 0.5) * 0.045);
    ctx.globalAlpha = pass === 0 ? 0.95 : 0.18;
    ctx.fillStyle = colors.ink;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 0.36;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = size * 0.038;
  ctx.strokeText(text, x, y + size * 0.015);
  ctx.restore();
}

function drawSealButton(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  colors: StyleboardColors,
): void {
  const x = cx - size * 0.5;
  const y = cy - size * 0.5;
  ctx.save();
  ctx.fillStyle = colors.seal;
  roughRect(ctx, x, y, size, size, 4, 801);
  ctx.fill();
  ctx.strokeStyle = colors.seal;
  ctx.lineWidth = 5;
  roughRect(ctx, x - 7, y - 7, size + 14, size + 14, 4, 802);
  ctx.stroke();
  ctx.fillStyle = colors.paper;
  ctx.font = `900 ${size * 0.3}px "STKaiti", "Kaiti SC", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("入", cx, cy - size * 0.16);
  ctx.fillText("塔", cx, cy + size * 0.19);
  ctx.restore();
}

function drawCombatPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + width * 0.1, y + height * 0.58);
  ctx.bezierCurveTo(x + width * 0.28, y + height * 0.32, x + width * 0.42, y + height * 0.78, x + width * 0.58, y + height * 0.52);
  ctx.bezierCurveTo(x + width * 0.72, y + height * 0.3, x + width * 0.8, y + height * 0.42, x + width * 0.91, y + height * 0.35);
  ctx.stroke();

  const elementDots: Array<{ color: string; x: number; y: number }> = [
    { color: colors.wood, x: 0.23, y: 0.48 },
    { color: colors.fire, x: 0.38, y: 0.69 },
    { color: colors.metal, x: 0.55, y: 0.48 },
    { color: colors.water, x: 0.7, y: 0.36 },
    { color: colors.earth, x: 0.8, y: 0.57 },
  ];
  for (const dot of elementDots) {
    ctx.globalAlpha = 0.54;
    ctx.fillStyle = dot.color;
    ctx.beginPath();
    ctx.arc(x + width * dot.x, y + height * dot.y, Math.max(8, width * 0.014), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawScrollBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.fillStyle = colors.paper;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 3;
  roughRect(ctx, x, y, width, height, 6, 901);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.ink;
  ctx.textBaseline = "middle";
  ctx.font = `800 ${height * 0.38}px "Songti SC", serif`;
  ctx.textAlign = "left";
  ctx.fillText("第 12 层", x + width * 0.055, y + height * 0.52);
  ctx.textAlign = "center";
  ctx.fillText("第 3/7 波", x + width * 0.5, y + height * 0.52);
  ctx.textAlign = "right";
  ctx.fillText("灵机", x + width * 0.86, y + height * 0.52);

  for (let index = 0; index < 3; index += 1) {
    ctx.globalAlpha = index === 0 ? 0.95 : 0.28;
    ctx.beginPath();
    ctx.arc(x + width * (0.89 + index * 0.035), y + height * 0.52, height * 0.105, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawR4Info(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.fillStyle = colors.paper;
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.88;
  ctx.lineWidth = 2;
  roughRect(ctx, x, y, width, height, 5, 921);
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.ink;
  ctx.font = `700 ${height * 0.23}px "Songti SC", serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("本关五行构成", x + width * 0.035, y + height * 0.5);

  const entries: Array<{ label: string; color: string; dots: number }> = [
    { label: "木", color: colors.wood, dots: 3 },
    { label: "火", color: colors.fire, dots: 2 },
    { label: "土", color: colors.earth, dots: 4 },
    { label: "金", color: colors.metal, dots: 2 },
    { label: "水", color: colors.water, dots: 3 },
  ];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const cx = x + width * (0.28 + index * 0.115);
    ctx.fillStyle = entry.color;
    ctx.globalAlpha = 0.86;
    ctx.beginPath();
    ctx.arc(cx, y + height * 0.38, height * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.paper;
    ctx.font = `800 ${height * 0.18}px "Songti SC", serif`;
    ctx.textAlign = "center";
    ctx.fillText(entry.label, cx, y + height * 0.38);
    ctx.fillStyle = colors.ink;
    ctx.globalAlpha = 0.74;
    for (let dot = 0; dot < entry.dots; dot += 1) {
      ctx.beginPath();
      ctx.arc(cx - height * 0.12 + dot * height * 0.08, y + height * 0.67, height * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.seal;
  const flagX = x + width * 0.91;
  ctx.beginPath();
  ctx.moveTo(flagX, y + height * 0.23);
  ctx.lineTo(flagX + width * 0.045, y + height * 0.32);
  ctx.lineTo(flagX, y + height * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(flagX, y + height * 0.22);
  ctx.lineTo(flagX, y + height * 0.78);
  ctx.stroke();
  ctx.fillStyle = colors.ink;
  ctx.font = `700 ${height * 0.16}px "Songti SC", serif`;
  ctx.textAlign = "center";
  ctx.fillText("Boss 7", flagX + width * 0.018, y + height * 0.74);
  ctx.restore();
}

function drawRuneBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: StyleboardColors,
): void {
  const cardW = width * 0.12;
  const gap = width * 0.025;
  const entries: Array<{ color: string; seed: number }> = [
    { color: colors.fire, seed: 1001 },
    { color: colors.water, seed: 1002 },
    { color: colors.wood, seed: 1003 },
    { color: colors.metal, seed: 1004 },
  ];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const cardX = x + index * (cardW + gap);
    ctx.save();
    ctx.fillStyle = colors.paper;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 2;
    roughRect(ctx, cardX, y, cardW, height, 5, entry.seed);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = entry.color;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.moveTo(cardX + cardW * 0.74, y + 0);
    ctx.lineTo(cardX + cardW, y + 0);
    ctx.lineTo(cardX + cardW, y + height * 0.27);
    ctx.closePath();
    ctx.fill();
    drawRuneGlyph(ctx, cardX + cardW * 0.5, y + height * 0.52, Math.min(cardW, height) * 0.32, colors.ink, entry.seed);
    ctx.restore();
  }

  const bx = x + width * 0.78;
  const by = y + height * 0.48;
  dryBrushLine(ctx, [
    { x: bx, y: by - height * 0.32 },
    { x: bx + width * 0.09, y: by + height * 0.2 },
  ], height * 0.09, colors.ink, 0.78, 1050);
  ctx.save();
  ctx.fillStyle = colors.seal;
  ctx.globalAlpha = 0.84;
  ctx.beginPath();
  ctx.ellipse(bx + width * 0.105, by + height * 0.26, height * 0.1, height * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.ink;
  ctx.font = `700 ${height * 0.22}px "Songti SC", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("画符", bx + width * 0.18, by);
  ctx.restore();
}

function drawBoxBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  colors: StyleboardColors,
  accent: string,
): void {
  ctx.save();
  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = 0.9;
  roughRect(ctx, cx - width * 0.5, cy - height * 0.5, width, height, 7, 360);
  ctx.fill();
  ctx.clip();
  drawColorBleed(ctx, cx + width * 0.15, cy - height * 0.1, width * 0.27, height * 0.2, accent, 0.52);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = colors.paper;
  ctx.lineCap = "round";
  ctx.lineWidth = height * 0.052;
  for (let index = 0; index < 3; index += 1) {
    const yy = cy - height * 0.18 + index * height * 0.17;
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.33, yy);
    ctx.lineTo(cx + width * 0.32, yy + height * 0.025);
    ctx.stroke();
  }
  ctx.restore();
}

function drawInkBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  colors: StyleboardColors,
  accent?: { color: string; dx: number; dy: number },
): void {
  ctx.save();
  ctx.fillStyle = colors.ink;
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.9;
  blobPath(ctx, cx, cy, rx, ry, seed);
  ctx.fill();
  ctx.lineWidth = Math.max(2, Math.min(rx, ry) * 0.18);
  ctx.globalAlpha = 0.82;
  ctx.stroke();
  if (accent !== undefined) {
    ctx.clip();
    drawColorBleed(ctx, cx + rx * accent.dx, cy + ry * accent.dy, rx * 0.62, ry * 0.44, accent.color, 0.56);
  }
  ctx.restore();
}

function drawColorBleed(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let index = 0; index < 4; index += 1) {
    ctx.globalAlpha = alpha / (index + 1.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (1 + index * 0.24), ry * (1 + index * 0.22), 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCracks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.strokeStyle = colors.seal;
  ctx.globalAlpha = 0.86;
  ctx.lineCap = "round";
  ctx.lineWidth = width * 0.014;
  const cracks: ReadonlyArray<ReadonlyArray<Point>> = [
    [
      { x: cx - width * 0.03, y: cy - height * 0.2 },
      { x: cx + width * 0.03, y: cy - height * 0.08 },
      { x: cx - width * 0.01, y: cy + height * 0.04 },
      { x: cx + width * 0.07, y: cy + height * 0.18 },
    ],
    [
      { x: cx + width * 0.12, y: cy - height * 0.11 },
      { x: cx + width * 0.18, y: cy + height * 0.01 },
      { x: cx + width * 0.14, y: cy + height * 0.12 },
    ],
  ];
  for (const crack of cracks) {
    ctx.beginPath();
    ctx.moveTo(crack[0].x, crack[0].y);
    for (let index = 1; index < crack.length; index += 1) {
      ctx.lineTo(crack[index].x, crack[index].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawThunderPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  thunder: string,
  ink: string,
  alpha: number,
): void {
  const points = [
    { x: x + width * 0.58, y: y + height * 0.08 },
    { x: x + width * 0.37, y: y + height * 0.32 },
    { x: x + width * 0.61, y: y + height * 0.34 },
    { x: x + width * 0.42, y: y + height * 0.62 },
    { x: x + width * 0.68, y: y + height * 0.58 },
    { x: x + width * 0.48, y: y + height * 0.88 },
  ];
  ctx.save();
  dryBrushLine(ctx, points, width * 0.055, ink, alpha * 0.62, 610);
  dryBrushLine(ctx, points, width * 0.027, thunder, alpha * 0.72, 611);
  ctx.restore();
}

function drawMiniRune(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: StyleboardColors,
  alpha: number,
  seed: number,
): void {
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(3, width * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + width * 0.5, y + height * 0.18);
  ctx.lineTo(x + width * 0.34, y + height * 0.42);
  ctx.lineTo(x + width * 0.56, y + height * 0.45);
  ctx.lineTo(x + width * 0.4, y + height * 0.72);
  ctx.lineTo(x + width * 0.64, y + height * 0.68);
  ctx.stroke();
  if (alpha < 0.4) {
    const next = mulberry32(seed);
    ctx.fillStyle = colors.ink;
    for (let dot = 0; dot < 18; dot += 1) {
      ctx.globalAlpha = 0.08 + next() * 0.16;
      ctx.beginPath();
      ctx.arc(x + width * (0.25 + next() * 0.5), y + height * (0.18 + next() * 0.58), width * (0.012 + next() * 0.018), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawRuneGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  seed: number,
): void {
  const next = mulberry32(seed);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.74;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.14, cy - size * 0.72);
  ctx.lineTo(cx + size * 0.1, cy - size * 0.18);
  ctx.lineTo(cx - size * 0.2 + next() * size * 0.1, cy + size * 0.12);
  ctx.lineTo(cx + size * 0.18, cy + size * 0.68);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy - size * 0.03);
  ctx.lineTo(cx + size * 0.38, cy - size * 0.08);
  ctx.stroke();
  ctx.restore();
}

function dryBrushLine(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<Point>,
  width: number,
  color: string,
  alpha: number,
  seed: number,
): void {
  const next = mulberry32(seed);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 4; pass += 1) {
    ctx.globalAlpha = alpha * (0.22 + next() * 0.24);
    ctx.lineWidth = width * (0.55 + next() * 0.65);
    ctx.beginPath();
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const x = point.x + (next() - 0.5) * width * 0.48;
      const y = point.y + (next() - 0.5) * width * 0.48;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  const next = mulberry32(seed);
  const points: Point[] = [];
  const count = 18;
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * 2 * index / count;
    const scale = 0.82 + next() * 0.28;
    points.push({
      x: cx + Math.cos(angle) * rx * scale,
      y: cy + Math.sin(angle) * ry * scale,
    });
  }

  ctx.beginPath();
  const first = midpoint(points[0], points[1]);
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index <= count; index += 1) {
    const current = points[index % count];
    const nextPoint = points[(index + 1) % count];
    const mid = midpoint(current, nextPoint);
    ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
  }
  ctx.closePath();
}

function roughRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  wobble: number,
  seed: number,
): void {
  const next = mulberry32(seed);
  const jitter = (): number => (next() - 0.5) * wobble;
  ctx.beginPath();
  ctx.moveTo(x + jitter(), y + jitter());
  ctx.lineTo(x + width + jitter(), y + jitter());
  ctx.lineTo(x + width + jitter(), y + height + jitter());
  ctx.lineTo(x + jitter(), y + height + jitter());
  ctx.closePath();
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hideHostElement(id: string): void {
  const node = document.getElementById(id);
  if (node instanceof HTMLElement) {
    node.hidden = true;
  }
}

function requiredText(record: Readonly<Record<string, string>>, key: string, label: string): string {
  const value = record[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`[styleboard] missing ${label}: ${key}`);
  }
  return value;
}

function requiredElementKey(record: Readonly<Record<string, ElementKey>>, key: string): ElementKey {
  const value = record[key];
  if (value === undefined) {
    throw new Error(`[styleboard] missing monster accent: ${key}`);
  }
  return value;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function ensureStyle(): void {
  if (document.getElementById(styleId) !== null) {
    return;
  }

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #${boardId} {
      --soft-ink: color-mix(in srgb, var(--ink) 58%, transparent);
      --faint-ink: color-mix(in srgb, var(--ink) 18%, transparent);
      position: fixed;
      inset: 0;
      z-index: 1000;
      overflow: auto;
      color: var(--ink);
      background: var(--paper);
      font: 15px/1.55 "Songti SC", "STSong", "Noto Serif SC", serif;
      letter-spacing: 0;
    }
    #${boardId} * {
      box-sizing: border-box;
    }
    #${boardId} .styleboard-header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px 24px;
      align-items: center;
      padding: 16px clamp(18px, 4vw, 54px);
      background: color-mix(in srgb, var(--paper) 94%, transparent);
      border-bottom: 1px solid var(--faint-ink);
    }
    #${boardId} .styleboard-kicker {
      grid-column: 1 / -1;
      font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--seal);
    }
    #${boardId} h1,
    #${boardId} h2,
    #${boardId} p {
      margin: 0;
    }
    #${boardId} h1 {
      font-size: 28px;
      line-height: 1.1;
      font-weight: 900;
    }
    #${boardId} .styleboard-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    #${boardId} .styleboard-nav a {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 4px 10px;
      border: 1px solid var(--soft-ink);
      color: var(--ink);
      text-decoration: none;
      font: 700 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${boardId} .styleboard-nav a:hover {
      color: var(--seal);
      border-color: var(--seal);
    }
    #${boardId} .styleboard-main {
      display: grid;
      gap: 34px;
      padding: 28px clamp(18px, 4vw, 54px) 56px;
    }
    #${boardId} .styleboard-section {
      scroll-margin-top: 112px;
      display: grid;
      gap: 14px;
      border-top: 2px solid var(--ink);
      padding-top: 16px;
    }
    #${boardId} .section-head {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
    }
    #${boardId} h2 {
      font-size: 22px;
      line-height: 1.2;
      font-weight: 900;
    }
    #${boardId} .section-head p {
      max-width: 560px;
      text-align: right;
      color: var(--soft-ink);
      font: 700 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${boardId} .canvas-frame {
      border: 1px solid var(--faint-ink);
      background: var(--paper);
      min-height: 320px;
    }
    #${boardId} .styleboard-canvas {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
    }
    #${boardId} #styleboard-entry .styleboard-canvas {
      aspect-ratio: 16 / 10;
    }
    #${boardId} #styleboard-draw .styleboard-canvas {
      aspect-ratio: 18 / 10;
    }
    #${boardId} .monster-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    #${boardId} .monster-card {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 10px;
      min-width: 0;
      border: 1px solid var(--faint-ink);
      padding: 10px;
      background: color-mix(in srgb, var(--paper) 92%, transparent);
    }
    #${boardId} .monster-canvas {
      aspect-ratio: 4 / 3;
      border-bottom: 1px solid var(--faint-ink);
    }
    #${boardId} .monster-meta {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    #${boardId} .monster-meta strong {
      font-size: 16px;
      line-height: 1.25;
    }
    #${boardId} .monster-meta code {
      color: var(--seal);
      font: 700 12px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-wrap: anywhere;
    }
    #${boardId} .monster-meta p {
      color: var(--soft-ink);
      font-size: 13px;
      line-height: 1.35;
    }
    @media (max-width: 900px) {
      #${boardId} .styleboard-header,
      #${boardId} .section-head {
        display: grid;
        grid-template-columns: 1fr;
      }
      #${boardId} .styleboard-nav {
        justify-content: flex-start;
      }
      #${boardId} .section-head p {
        text-align: left;
      }
      #${boardId} .monster-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 560px) {
      #${boardId} h1 {
        font-size: 23px;
      }
      #${boardId} .styleboard-main {
        padding-inline: 12px;
      }
      #${boardId} .monster-grid {
        grid-template-columns: 1fr;
      }
      #${boardId} .canvas-frame {
        min-height: 220px;
      }
    }
  `;
  document.head.append(style);
}
