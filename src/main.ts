import "./style.css";
import { BabylonApp } from "./app/BabylonApp";
import { loadGameConfig } from "./config";
import { shouldLoadDebugPanel } from "./debug/gate";
import { assembleBattle } from "./game/battle/combat/assembleBattle";
import { createBattleScene } from "./render/battleScene";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("Missing #game-canvas");
}

const app = new BabylonApp(canvas);
const config = loadGameConfig();
const seed = readSeed();
const { map, bus, loadout, simulation, battle } = assembleBattle({
  config,
  seed,
  requiredPower: config.balance.progressionCurves.endlessTower.basePower,
});

await app.load((a) => createBattleScene(a.engine, { config, map, simulation, bus, loadout }));
battle.start();
app.start();
app.engine.runRenderLoop(() => {
  battle.tick(app.engine.getDeltaTime());
});

// 外层 import.meta.env.DEV 是静态守门:生产构建时整块连同动态 chunk 被摇树剔除,
// 因此内层 isDev 实参在此恒为 true(gate 的完整语义由尺子单测钉住)。
if (import.meta.env.DEV && shouldLoadDebugPanel(window.location.search, true)) {
  import("./debug/panel")
    .then((module) => module.mountDebugPanel({ config, seed }))
    .catch((error: unknown) => {
      console.error("[debug] 调参台加载失败:", error);
    });
}

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}

function readSeed(): number {
  const value = new URLSearchParams(location.search).get("seed");
  if (value === null) return 1;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 1;
}
