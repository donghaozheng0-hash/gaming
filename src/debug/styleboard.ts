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

interface SketchBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STYLEBOARD_SECTIONS: ReadonlyArray<StyleboardSection> = [
  { id: "entry", title: "入场界面" },
  { id: "hud", title: "战斗 HUD" },
  { id: "monsters", title: "八怪图鉴" },
  { id: "draw", title: "画符交互示意" },
];

const MONSTER_FEATURES_BY_ID: Readonly<Record<string, string>> = {
  normal_yaobing: "佝偻直立小妖:圆头尖耳、弓背短腿、右手拖棒,腹部木绿晕染",
  swarm_xiaoyao: "三只鼠蝠小妖品字簇拥:大耳细尾、六眼亮点,背部晕染",
  fast_yao: "低伏疾奔四足兽:尖吻、两伸两蹬、直尾飞白拖尾,肩胛火红",
  armored_yao: "驮甲龟犀形:三层弧甲、短粗四足、小头探出,甲面土金晕染",
  shield_yao: "持杖直立小妖法师:瘦长披袍、双手举杖、身前半透明符盾",
  split_yao: "双头连体妖:宽躯双头、顶至腹留白裂缝、四短腿、两瓣晕染",
  elite_yaojiang: "披甲直立武将:宽肩双角、披风、长刀触地、朱砂双眼",
  chapter_boss: "弓背巨兽:隆背低头独角、双臂拳撑、朱砂裂纹与足下威压晕圈",
};

const MONSTER_ACCENT_BY_ID: Readonly<Record<string, ElementKey>> = {
  normal_yaobing: "wood",
  swarm_xiaoyao: "wood",
  fast_yao: "fire",
  armored_yao: "earth",
  shield_yao: "water",
  split_yao: "water",
  elite_yaojiang: "fire",
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
  const section = sectionShell("monsters", "八怪图鉴", "强剪影 / 头眼肢体可读 / 五行色一处晕染");
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
  drawMountainLayer(ctx, width, height, colors, 0.52, 0.16, 0.1, 11);
  drawMountainLayer(ctx, width, height, colors, 0.58, 0.19, 0.16, 23);
  drawMountainLayer(ctx, width, height, colors, 0.64, 0.21, 0.24, 37);

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
  const eye = monsterEyeColor(spec.monsterId, accent, colors);
  const box = {
    x: width * 0.08,
    y: height * 0.08,
    w: width * 0.84,
    h: height * 0.78,
  };

  switch (spec.monsterId) {
    case "normal_yaobing":
      drawNormalYaobing(ctx, box, colors, accent, eye);
      break;
    case "swarm_xiaoyao":
      drawSwarmXiaoyao(ctx, box, colors, accent, eye);
      break;
    case "fast_yao":
      drawFastYao(ctx, box, colors, accent, eye);
      break;
    case "armored_yao":
      drawArmoredYao(ctx, box, colors, accent);
      break;
    case "shield_yao":
      drawShieldYao(ctx, box, colors, accent, eye);
      break;
    case "split_yao":
      drawSplitYao(ctx, box, colors, accent, eye);
      break;
    case "elite_yaojiang":
      drawEliteYaojiang(ctx, box, colors, accent);
      break;
    case "chapter_boss":
      drawChapterBoss(ctx, { x: width * 0.04, y: height * 0.02, w: width * 0.92, h: height * 0.9 }, colors, accent);
      break;
    default:
      drawInkBlob(ctx, width * 0.5, height * 0.5, width * 0.16, height * 0.22, 499, colors, {
        color: accent,
        dx: 0,
        dy: 0,
      });
      break;
  }
}

function monsterEyeColor(monsterId: string, accent: string, colors: StyleboardColors): string {
  if (monsterId === "elite_yaojiang" || monsterId === "chapter_boss") return colors.seal;
  if (monsterId === "armored_yao") return colors.metal;
  return accent;
}

function drawNormalYaobing(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
  eye: string,
): void {
  const cx = box.x + box.w * 0.49;
  const ground = box.y + box.h * 0.88;
  const hip = box.y + box.h * 0.62;
  dryBrushLine(ctx, [
    { x: cx - box.w * 0.06, y: hip },
    { x: cx - box.w * 0.14, y: ground },
  ], box.w * 0.034, colors.ink, 0.82, 3001);
  dryBrushLine(ctx, [
    { x: cx + box.w * 0.05, y: hip },
    { x: cx + box.w * 0.12, y: ground },
  ], box.w * 0.032, colors.ink, 0.8, 3002);
  dryBrushLine(ctx, [
    { x: cx + box.w * 0.11, y: box.y + box.h * 0.48 },
    { x: cx + box.w * 0.26, y: box.y + box.h * 0.72 },
    { x: cx + box.w * 0.28, y: ground },
  ], box.w * 0.032, colors.ink, 0.8, 3003);
  dryBrushLine(ctx, [
    { x: cx + box.w * 0.3, y: box.y + box.h * 0.66 },
    { x: cx + box.w * 0.32, y: ground + box.h * 0.05 },
  ], box.w * 0.022, colors.ink, 0.84, 3004);
  dryBrushLine(ctx, [
    { x: cx - box.w * 0.1, y: box.y + box.h * 0.48 },
    { x: cx - box.w * 0.21, y: box.y + box.h * 0.6 },
  ], box.w * 0.028, colors.ink, 0.72, 3005);

  ctx.save();
  ctx.translate(cx, box.y + box.h * 0.52);
  ctx.rotate(-0.24);
  drawInkBlob(ctx, 0, 0, box.w * 0.13, box.h * 0.23, 3006, colors, { color: accent, dx: 0.2, dy: 0.18 });
  drawInkBlob(ctx, -box.w * 0.045, -box.h * 0.25, box.w * 0.1, box.h * 0.085, 3007, colors);
  drawEar(ctx, -box.w * 0.13, -box.h * 0.3, box.w * 0.07, -0.45, colors);
  drawEar(ctx, box.w * 0.025, -box.h * 0.33, box.w * 0.062, 0.2, colors);
  drawEye(ctx, -box.w * 0.08, -box.h * 0.26, box.w * 0.014, eye, colors);
  drawEye(ctx, -box.w * 0.03, -box.h * 0.255, box.w * 0.012, eye, colors);
  ctx.restore();
}

function drawSwarmXiaoyao(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
  eye: string,
): void {
  drawMouseYao(ctx, box.x + box.w * 0.49, box.y + box.h * 0.57, box.w * 0.43, 3111, colors, accent, eye, 1.08);
  drawMouseYao(ctx, box.x + box.w * 0.33, box.y + box.h * 0.42, box.w * 0.34, 3121, colors, accent, eye, 0.74);
  drawMouseYao(ctx, box.x + box.w * 0.66, box.y + box.h * 0.45, box.w * 0.32, 3131, colors, accent, eye, 0.68);
}

function drawMouseYao(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  seed: number,
  colors: StyleboardColors,
  accent: string,
  eye: string,
  eyeScale: number,
): void {
  dryBrushLine(ctx, [
    { x: cx - size * 0.28, y: cy + size * 0.1 },
    { x: cx - size * 0.52, y: cy + size * 0.02 },
    { x: cx - size * 0.63, y: cy - size * 0.16 },
  ], size * 0.045, colors.ink, 0.72, seed);
  drawInkBlob(ctx, cx, cy, size * 0.18, size * 0.16, seed + 1, colors, { color: accent, dx: 0.1, dy: -0.2 });
  drawEar(ctx, cx - size * 0.09, cy - size * 0.15, size * 0.1, -0.6, colors);
  drawEar(ctx, cx + size * 0.08, cy - size * 0.15, size * 0.1, 0.6, colors);
  dryBrushLine(ctx, [
    { x: cx - size * 0.08, y: cy + size * 0.13 },
    { x: cx - size * 0.14, y: cy + size * 0.23 },
  ], size * 0.028, colors.ink, 0.62, seed + 2);
  dryBrushLine(ctx, [
    { x: cx + size * 0.08, y: cy + size * 0.13 },
    { x: cx + size * 0.15, y: cy + size * 0.23 },
  ], size * 0.028, colors.ink, 0.62, seed + 3);
  drawEye(ctx, cx - size * 0.055, cy - size * 0.02, size * 0.019 * eyeScale, eye, colors);
  drawEye(ctx, cx + size * 0.035, cy - size * 0.018, size * 0.017 * eyeScale, eye, colors);
}

function drawFastYao(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
  eye: string,
): void {
  const px = (value: number): number => box.x + box.w * value;
  const py = (value: number): number => box.y + box.h * value;

  taperedDryBrushLine(ctx, [{ x: px(0.72), y: py(0.46) }, { x: px(0.92), y: py(0.42) }], box.w * 0.046, colors.ink, 0.82, 3211);
  dryBrushLine(ctx, [{ x: px(0.88), y: py(0.4) }, { x: px(1.08), y: py(0.36) }], box.w * 0.018, colors.ink, 0.24, 3212);
  dryBrushLine(ctx, [{ x: px(0.88), y: py(0.48) }, { x: px(1.1), y: py(0.49) }], box.w * 0.016, colors.ink, 0.2, 3213);

  for (const limb of [
    [{ x: px(0.3), y: py(0.58) }, { x: px(0.18), y: py(0.78) }],
    [{ x: px(0.34), y: py(0.6) }, { x: px(0.26), y: py(0.8) }],
    [{ x: px(0.62), y: py(0.55) }, { x: px(0.74), y: py(0.78) }],
    [{ x: px(0.66), y: py(0.52) }, { x: px(0.8), y: py(0.74) }],
  ] as const) {
    taperedDryBrushLine(ctx, limb, box.w * 0.038, colors.ink, 0.84, 3220 + Math.round(limb[0].x));
  }

  ctx.save();
  ctx.translate(px(0.485), py(0.48));
  ctx.rotate(-0.17);
  drawInkBlob(ctx, 0, 0, box.w * 0.25, box.h * 0.11, 3214, colors, { color: accent, dx: -0.42, dy: 0.12 });
  ctx.restore();

  drawInkShape(ctx, [
    { x: px(0.25), y: py(0.52) },
    { x: px(0.12), y: py(0.58) },
    { x: px(0.2), y: py(0.49) },
    { x: px(0.31), y: py(0.48) },
  ], colors.ink, 0.9);
  drawInkShape(ctx, [
    { x: px(0.2), y: py(0.48) },
    { x: px(0.29), y: py(0.39) },
    { x: px(0.3), y: py(0.5) },
  ], colors.ink, 0.88);
  drawEye(ctx, px(0.18), py(0.54), box.w * 0.015, eye, colors);
}

function drawArmoredYao(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
): void {
  const cx = box.x + box.w * 0.49;
  const cy = box.y + box.h * 0.58;
  const ground = box.y + box.h * 0.82;
  for (const offset of [-0.23, -0.06, 0.14, 0.3]) {
    dryBrushLine(ctx, [
      { x: cx + box.w * offset, y: cy + box.h * 0.12 },
      { x: cx + box.w * (offset - 0.02), y: ground },
    ], box.w * 0.044, colors.ink, 0.82, 3311 + Math.round((offset + 1) * 100));
  }
  drawInkBlob(ctx, cx, cy, box.w * 0.33, box.h * 0.22, 3312, colors, { color: accent, dx: 0.08, dy: -0.3 });
  drawInkBlob(ctx, cx + box.w * 0.35, cy - box.h * 0.03, box.w * 0.105, box.h * 0.085, 3313, colors);
  drawArmorShellGaps(ctx, cx, cy, box, colors);
  drawEye(ctx, cx + box.w * 0.38, cy - box.h * 0.05, box.w * 0.014, colors.earth, colors);
  drawEye(ctx, cx + box.w * 0.38, cy - box.h * 0.05, box.w * 0.008, colors.metal, colors);
}

function drawShieldYao(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
  eye: string,
): void {
  const px = (value: number): number => box.x + box.w * value;
  const py = (value: number): number => box.y + box.h * value;

  dryBrushLine(ctx, [{ x: px(0.5), y: py(0.14) }, { x: px(0.52), y: py(0.6) }], box.w * 0.018, colors.ink, 0.86, 3411);
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = box.w * 0.018;
  ctx.beginPath();
  ctx.ellipse(px(0.51), py(0.14), box.w * 0.036, box.h * 0.035, 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  dryBrushLine(ctx, [{ x: px(0.42), y: py(0.42) }, { x: px(0.46), y: py(0.32) }, { x: px(0.5), y: py(0.3) }], box.w * 0.024, colors.ink, 0.76, 3412);
  dryBrushLine(ctx, [{ x: px(0.58), y: py(0.42) }, { x: px(0.55), y: py(0.32) }, { x: px(0.52), y: py(0.3) }], box.w * 0.024, colors.ink, 0.76, 3413);

  ctx.save();
  ctx.fillStyle = colors.ink;
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(px(0.5), py(0.3));
  ctx.lineTo(px(0.64), py(0.82));
  ctx.lineTo(px(0.36), py(0.82));
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = box.w * 0.022;
  ctx.stroke();
  ctx.clip();
  drawColorBleed(ctx, px(0.5), py(0.74), box.w * 0.12, box.h * 0.08, accent, 0.54);
  ctx.restore();

  dryBrushLine(ctx, [{ x: px(0.38), y: py(0.79) }, { x: px(0.24), y: py(0.85) }], box.w * 0.036, colors.ink, 0.4, 3414);
  drawInkShape(ctx, [
    { x: px(0.5), y: py(0.17) },
    { x: px(0.55), y: py(0.25) },
    { x: px(0.46), y: py(0.25) },
  ], colors.ink, 0.86);
  drawInkBlob(ctx, px(0.5), py(0.24), box.w * 0.06, box.h * 0.06, 3415, colors);
  drawEye(ctx, px(0.47), py(0.24), box.w * 0.011, eye, colors);
  drawEye(ctx, px(0.53), py(0.24), box.w * 0.011, eye, colors);
  drawShieldRing(ctx, px(0.5), py(0.5), box.w * 0.22, box.h * 0.28, colors, accent);
}

function drawSplitYao(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
  eye: string,
): void {
  const cx = box.x + box.w * 0.5;
  const cy = box.y + box.h * 0.57;
  const ground = box.y + box.h * 0.86;
  for (const offset of [-0.23, -0.09, 0.11, 0.25]) {
    dryBrushLine(ctx, [
      { x: cx + box.w * offset, y: cy + box.h * 0.13 },
      { x: cx + box.w * (offset + 0.03), y: ground },
    ], box.w * 0.032, colors.ink, 0.74, 3510 + Math.round((offset + 1) * 100));
  }
  drawInkBlob(ctx, cx - box.w * 0.08, cy, box.w * 0.17, box.h * 0.24, 3511, colors, {
    color: accent,
    dx: -0.18,
    dy: -0.02,
  });
  drawInkBlob(ctx, cx + box.w * 0.08, cy, box.w * 0.17, box.h * 0.24, 3512, colors, {
    color: accent,
    dx: 0.18,
    dy: 0.08,
  });
  drawInkBlob(ctx, cx - box.w * 0.1, box.y + box.h * 0.31, box.w * 0.09, box.h * 0.08, 3513, colors);
  drawInkBlob(ctx, cx + box.w * 0.1, box.y + box.h * 0.31, box.w * 0.09, box.h * 0.08, 3514, colors);
  dryBrushLine(ctx, [
    { x: cx - box.w * 0.25, y: cy - box.h * 0.01 },
    { x: cx - box.w * 0.35, y: cy + box.h * 0.06 },
  ], box.w * 0.035, colors.ink, 0.68, 3515);
  dryBrushLine(ctx, [
    { x: cx + box.w * 0.25, y: cy - box.h * 0.01 },
    { x: cx + box.w * 0.35, y: cy + box.h * 0.06 },
  ], box.w * 0.035, colors.ink, 0.68, 3516);
  drawSeam(ctx, cx, box.y + box.h * 0.25, box.y + box.h * 0.76, box.w, colors);
  drawEye(ctx, cx - box.w * 0.105, box.y + box.h * 0.31, box.w * 0.012, eye, colors);
  drawEye(ctx, cx + box.w * 0.105, box.y + box.h * 0.31, box.w * 0.012, eye, colors);
}

function drawEliteYaojiang(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
): void {
  const px = (value: number): number => box.x + box.w * value;
  const py = (value: number): number => box.y + box.h * value;

  ctx.save();
  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = 0.32;
  ctx.beginPath();
  ctx.moveTo(px(0.35), py(0.34));
  ctx.bezierCurveTo(px(0.28), py(0.5), px(0.24), py(0.66), px(0.28), py(0.8));
  ctx.bezierCurveTo(px(0.39), py(0.7), px(0.43), py(0.52), px(0.39), py(0.35));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  taperedDryBrushLine(ctx, [{ x: px(0.42), y: py(0.62) }, { x: px(0.4), y: py(0.88) }], box.w * 0.047, colors.ink, 0.86, 3610);
  taperedDryBrushLine(ctx, [{ x: px(0.58), y: py(0.62) }, { x: px(0.6), y: py(0.88) }], box.w * 0.047, colors.ink, 0.86, 3611);
  dryBrushLine(ctx, [{ x: px(0.36), y: py(0.88) }, { x: px(0.45), y: py(0.88) }], box.w * 0.028, colors.ink, 0.82, 3612);
  dryBrushLine(ctx, [{ x: px(0.55), y: py(0.88) }, { x: px(0.64), y: py(0.88) }], box.w * 0.028, colors.ink, 0.82, 3613);

  ctx.save();
  ctx.fillStyle = colors.ink;
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.91;
  ctx.beginPath();
  ctx.moveTo(px(0.33), py(0.34));
  ctx.lineTo(px(0.67), py(0.34));
  ctx.lineTo(px(0.61), py(0.64));
  ctx.lineTo(px(0.39), py(0.64));
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = box.w * 0.022;
  ctx.stroke();
  ctx.clip();
  drawColorBleed(ctx, px(0.5), py(0.48), box.w * 0.13, box.h * 0.1, accent, 0.52);
  ctx.restore();

  drawInkBlob(ctx, px(0.35), py(0.35), box.w * 0.07, box.h * 0.055, 3614, colors);
  drawInkBlob(ctx, px(0.65), py(0.35), box.w * 0.07, box.h * 0.055, 3615, colors);
  dryBrushLine(ctx, [{ x: px(0.62), y: py(0.43) }, { x: px(0.7), y: py(0.48) }], box.w * 0.026, colors.ink, 0.78, 3616);
  dryBrushLine(ctx, [{ x: px(0.7), y: py(0.3) }, { x: px(0.72), y: py(0.86) }], box.w * 0.02, colors.ink, 0.88, 3617);
  dryBrushLine(ctx, [{ x: px(0.66), y: py(0.31) }, { x: px(0.76), y: py(0.31) }], box.w * 0.016, colors.ink, 0.86, 3618);
  drawInkShape(ctx, [
    { x: px(0.71), y: py(0.84) },
    { x: px(0.735), y: py(0.88) },
    { x: px(0.69), y: py(0.88) },
  ], colors.ink, 0.86);

  drawInkBlob(ctx, px(0.5), py(0.27), box.w * 0.07, box.h * 0.07, 3619, colors);
  taperedDryBrushLine(ctx, [{ x: px(0.46), y: py(0.21) }, { x: px(0.43), y: py(0.15) }, { x: px(0.48), y: py(0.11) }], box.w * 0.029, colors.ink, 0.9, 3620);
  taperedDryBrushLine(ctx, [{ x: px(0.54), y: py(0.21) }, { x: px(0.57), y: py(0.15) }, { x: px(0.52), y: py(0.11) }], box.w * 0.029, colors.ink, 0.9, 3621);
  drawEye(ctx, px(0.47), py(0.27), box.w * 0.011, colors.seal, colors);
  drawEye(ctx, px(0.53), py(0.27), box.w * 0.011, colors.seal, colors);
}

function drawChapterBoss(
  ctx: CanvasRenderingContext2D,
  box: SketchBox,
  colors: StyleboardColors,
  accent: string,
): void {
  const cx = box.x + box.w * 0.5;
  const cy = box.y + box.h * 0.56;
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = box.w * 0.04;
  ctx.beginPath();
  ctx.ellipse(cx, box.y + box.h * 0.88, box.w * 0.36, box.h * 0.08, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  dryBrushLine(ctx, [
    { x: cx - box.w * 0.24, y: cy + box.h * 0.07 },
    { x: cx - box.w * 0.36, y: box.y + box.h * 0.8 },
  ], box.w * 0.06, colors.ink, 0.82, 3711);
  dryBrushLine(ctx, [
    { x: cx + box.w * 0.24, y: cy + box.h * 0.07 },
    { x: cx + box.w * 0.35, y: box.y + box.h * 0.8 },
  ], box.w * 0.06, colors.ink, 0.82, 3712);
  drawInkBlob(ctx, cx, cy, box.w * 0.32, box.h * 0.27, 3713, colors, { color: accent, dx: -0.16, dy: -0.34 });
  drawInkBlob(ctx, cx - box.w * 0.08, cy - box.h * 0.08, box.w * 0.23, box.h * 0.2, 3714, colors);
  drawInkBlob(ctx, cx + box.w * 0.03, cy + box.h * 0.02, box.w * 0.16, box.h * 0.12, 3715, colors);
  drawInkBlob(ctx, cx - box.w * 0.37, box.y + box.h * 0.83, box.w * 0.08, box.h * 0.055, 3716, colors);
  drawInkBlob(ctx, cx + box.w * 0.37, box.y + box.h * 0.83, box.w * 0.08, box.h * 0.055, 3717, colors);
  dryBrushLine(ctx, [
    { x: cx + box.w * 0.02, y: cy - box.h * 0.2 },
    { x: cx + box.w * 0.03, y: cy - box.h * 0.42 },
  ], box.w * 0.03, colors.ink, 0.9, 3718);
  drawEye(ctx, cx - box.w * 0.03, cy - box.h * 0.03, box.w * 0.018, colors.seal, colors);
  drawEye(ctx, cx + box.w * 0.045, cy - box.h * 0.035, box.w * 0.018, colors.seal, colors);
  drawCracks(ctx, cx, cy, box.w, box.h, colors);
}

function drawEar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.7);
  ctx.lineTo(size * 0.52, size * 0.42);
  ctx.lineTo(-size * 0.42, size * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(2, radius * 2.4);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.98;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = colors.paper;
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = Math.max(1, radius * 0.34);
  ctx.stroke();
  ctx.restore();
}

function drawInkShape(ctx: CanvasRenderingContext2D, points: ReadonlyArray<Point>, color: string, alpha: number): void {
  if (points.length < 3) return;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha * 0.72;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.08);
  ctx.stroke();
  ctx.restore();
}

function drawArmorShellGaps(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  box: SketchBox,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.strokeStyle = colors.paper;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.78;
  ctx.lineWidth = box.h * 0.035;
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath();
    ctx.ellipse(
      cx - box.w * 0.02,
      cy - box.h * (0.12 - index * 0.095),
      box.w * (0.26 - index * 0.025),
      box.h * (0.1 + index * 0.012),
      0.03,
      Math.PI * 1.04,
      Math.PI * 1.96,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function robePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  robeTop: number,
  robeBottom: number,
  width: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.12, robeTop);
  ctx.lineTo(cx + width * 0.11, robeTop - (robeBottom - robeTop) * 0.04);
  ctx.lineTo(cx + width * 0.17, robeBottom);
  ctx.lineTo(cx - width * 0.19, robeBottom + (robeBottom - robeTop) * 0.02);
  ctx.closePath();
}

function drawShieldRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colors: StyleboardColors,
  accent: string,
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = Math.max(3, rx * 0.13);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, -0.08, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = Math.max(4, rx * 0.11);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, -0.08, Math.PI * 0.1, Math.PI * 1.22);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, -0.08, Math.PI * 1.48, Math.PI * 1.92);
  ctx.stroke();

  ctx.strokeStyle = colors.paper;
  ctx.globalAlpha = 0.76;
  ctx.lineWidth = Math.max(3, rx * 0.055);
  dryBrushLine(ctx, [
    { x: cx - rx * 0.62, y: cy - ry * 0.12 },
    { x: cx - rx * 0.35, y: cy + ry * 0.05 },
  ], rx * 0.05, colors.paper, 0.76, 3420);
  dryBrushLine(ctx, [
    { x: cx + rx * 0.32, y: cy + ry * 0.34 },
    { x: cx + rx * 0.62, y: cy + ry * 0.2 },
  ], rx * 0.05, colors.paper, 0.76, 3421);
  ctx.restore();
}

function drawSeam(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
  width: number,
  colors: StyleboardColors,
): void {
  ctx.save();
  ctx.strokeStyle = colors.paper;
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = width * 0.018;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - width * 0.01, top);
  ctx.quadraticCurveTo(x + width * 0.035, (top + bottom) * 0.48, x - width * 0.005, bottom);
  ctx.stroke();
  ctx.restore();
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
  footRatio: number,
  amplitudeRatio: number,
  alpha: number,
  seed: number,
): void {
  const next = mulberry32(seed);
  const footY = height * footRatio;
  const amplitude = height * amplitudeRatio;
  const crestPoints: Point[] = [];
  const segmentCount = (2 + seed % 3) * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height * 0.66);
  ctx.clip();

  for (let index = 0; index <= segmentCount; index += 1) {
    const edge = index === 0 || index === segmentCount;
    const x = edge ? width * index / segmentCount : width * (index + (next() - 0.5) * 0.16) / segmentCount;
    const peak = index % 2 === 1;
    const lift = peak ? amplitude * (0.54 + next() * 0.38) : amplitude * (0.04 + next() * 0.16);
    crestPoints.push({ x, y: footY - lift });
  }

  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = alpha;
  ctx.shadowColor = colors.ink;
  ctx.shadowBlur = Math.max(8, amplitude * 0.16);
  ctx.beginPath();
  ctx.moveTo(0, footY);
  for (const point of crestPoints) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.lineTo(width, footY);
  ctx.closePath();
  ctx.fill();

  dryBrushLine(ctx, crestPoints, Math.max(4, amplitude * 0.055), colors.ink, Math.min(0.38, alpha * 1.45), seed + 100);
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
    const isMetal = entry.label === "金";
    ctx.fillStyle = isMetal ? colors.ink : entry.color;
    ctx.globalAlpha = 0.86;
    ctx.beginPath();
    ctx.arc(cx, y + height * 0.38, height * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.ink;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = Math.max(2, height * 0.026);
    ctx.stroke();
    ctx.fillStyle = isMetal ? entry.color : colors.paper;
    ctx.globalAlpha = 1;
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

function taperedDryBrushLine(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<Point>,
  width: number,
  color: string,
  alpha: number,
  seed: number,
): void {
  if (points.length < 2) return;
  const next = mulberry32(seed);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 4; pass += 1) {
    const passAlpha = alpha * (0.2 + next() * 0.25);
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const progress = index / Math.max(1, points.length - 2);
      ctx.globalAlpha = passAlpha;
      ctx.lineWidth = width * (0.9 - progress * 0.48) * (0.72 + next() * 0.38);
      ctx.beginPath();
      ctx.moveTo(start.x + (next() - 0.5) * width * 0.36, start.y + (next() - 0.5) * width * 0.36);
      ctx.lineTo(end.x + (next() - 0.5) * width * 0.28, end.y + (next() - 0.5) * width * 0.28);
      ctx.stroke();
    }
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
