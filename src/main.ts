import "./style.css";
import { BabylonApp } from "./app/BabylonApp";
import { loadGameConfig } from "./config";
import { BattleController } from "./game/battle/BattleController";
import { generateMap } from "./game/battle/map/MapGenerator";
import { EventBus } from "./game/events/EventBus";
import { createBattleScene } from "./render/battleScene";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("Missing #game-canvas");
}

const app = new BabylonApp(canvas);
const config = loadGameConfig();
const seed = readSeed();
const map = generateMap({ config, seed });
const bus = new EventBus();
const battle = new BattleController({ config, bus });

await app.load((a) => createBattleScene(a.engine, { config, map }));
battle.start();
app.start();
app.engine.runRenderLoop(() => {
  battle.tick(app.engine.getDeltaTime());
});

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
