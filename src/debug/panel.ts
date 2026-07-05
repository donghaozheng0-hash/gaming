import {
  SIM_SCRIPT,
  type BalanceSection,
  type BalanceTables,
  type CapacityRow,
} from "../../scripts/balance-core.mjs";
import type { GameConfig } from "../config";
import { computePanelModel, type KnobOverrides, type NumericKnobKey, type PanelModel } from "./panelModel";
import { replayBattle, type ReplayResult } from "./replay";

const panelId = "futa-debug-panel";
const styleId = "futa-debug-panel-style";

export function mountDebugPanel(opts: { config: GameConfig; seed: number }): void {
  document.getElementById(panelId)?.remove();
  ensureStyle();

  const tables = balanceTablesFromConfig(opts.config);
  let overrides: KnobOverrides = {};
  let collapsed = false;

  const root = element("aside", "debug-panel");
  root.id = panelId;

  const header = element("div", "debug-header");
  const title = element("div", "debug-title", "dev 调参台");
  const toggle = element("button", "debug-toggle", "收起");
  toggle.type = "button";
  header.append(title, toggle);

  const body = element("div", "debug-body");
  const banner = element(
    "div",
    "debug-banner",
    "仅试运行 · 不落地——旋钮覆写只影响本面板计算；正式落地须 balance-sim 全曲线绿后由 Claude 写入 src/config",
  );

  const status = element("div", "debug-status");
  const sectionsHost = element("div", "debug-section-list");
  const linesPre = document.createElement("pre");
  linesPre.className = "debug-lines";
  const linesDetails = document.createElement("details");
  linesDetails.className = "debug-details";
  const linesSummary = element("summary", "", "CLI 原文");
  linesDetails.append(linesSummary, linesPre);

  const knobsHost = element("div", "debug-knobs");
  const resetButton = element("button", "debug-button", "重置");
  resetButton.type = "button";

  const replayButton = element("button", "debug-button", "回放本局");
  replayButton.type = "button";
  const replayHost = element("div", "debug-replay");

  body.append(
    banner,
    section("曲线红绿", status, sectionsHost, linesDetails),
    section("旋钮覆写", knobsHost, resetButton),
    section("真实回放校准", replayButton, replayHost),
  );
  root.append(header, body);
  document.body.append(root);

  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    root.classList.toggle("is-collapsed", collapsed);
    toggle.textContent = collapsed ? "展开" : "收起";
  });

  resetButton.addEventListener("click", () => {
    overrides = {};
    refresh(true);
  });

  replayButton.addEventListener("click", () => {
    replayButton.disabled = true;
    replayHost.textContent = "回放中...";
    // rAF+setTimeout:先让"回放中..."真正上屏,再同步跑整局模拟(点击处理器内直接跑会冻结到结束都不渲染)。
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          // 对照列一律用【未覆写】基线模型:回放跑的是真实 config,
          // 混入旋钮覆写后的解析列会让校准表两侧参数集不一致(误导数值决策)。
          const baseline = computePanelModel(tables);
          const replay = replayBattle({
            config: opts.config,
            seed: opts.seed,
            requiredPower: opts.config.balance.progressionCurves.endlessTower.basePower,
            // join 键钉死为容量剧本的波表,不依赖 waveTemplates 的数组顺序。
            waveTemplateId: SIM_SCRIPT.capacity.waveTemplateId,
          });
          renderReplay(replayHost, replay, capacityRowsOf(baseline));
        } catch (error) {
          replayHost.textContent = errorMessage(error);
        } finally {
          replayButton.disabled = false;
        }
      }, 0);
    });
  });

  refresh(true);

  function refresh(renderKnobs: boolean): void {
    try {
      const model = computePanelModel(tables, overrides);
      renderStatus(status, model);
      renderSections(sectionsHost, model);
      linesPre.textContent = model.lines.join("\n");
      if (renderKnobs) renderKnobInputs(knobsHost, model, overrides, (key, value) => {
        overrides = value === undefined ? clearOverride(overrides, key) : setOverride(overrides, key, value);
        refresh(false);
      });
    } catch (error) {
      status.textContent = errorMessage(error);
      status.className = "debug-status is-bad";
    }
  }
}

function balanceTablesFromConfig(config: GameConfig): BalanceTables {
  return {
    balance: config.balance,
    infinite: config.infinite,
    fatigue: config.fatigue,
    monsters: config.monsters,
    waves: config.waves,
    runes: config.runes,
  };
}

function section(title: string, ...children: Node[]): HTMLElement {
  const host = element("section", "debug-section");
  host.append(element("h2", "debug-section-title", title), ...children);
  return host;
}

function renderStatus(host: HTMLElement, model: PanelModel): void {
  host.className = `debug-status ${model.ok ? "is-ok" : "is-bad"}`;
  host.textContent = model.ok ? "总判：全绿" : `总判：翻红 · ${model.failures.join("、")}`;
}

function renderSections(host: HTMLElement, model: PanelModel): void {
  host.replaceChildren(
    ...model.sections.map((item) => {
      const row = element("div", `debug-section-row ${item.ok ? "is-ok" : "is-bad"}`);
      row.append(element("span", "debug-light", item.ok ? "绿" : "红"), element("span", "", item.title));
      return row;
    }),
  );
}

function renderKnobInputs(
  host: HTMLElement,
  model: PanelModel,
  overrides: KnobOverrides,
  // 按键回调:最新 overrides 由挂载闭包持有,监听器不得捕获本次渲染的快照
  // (否则改第二个旋钮会静默丢弃第一个的覆写)。
  onChange: (key: NumericKnobKey, value: number | undefined) => void,
): void {
  const rows = Object.entries(model.knobs)
    .filter(isNumericEntry)
    .map(([key, value]) => {
      const label = element("label", "debug-knob");
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.value = String(overrides[key] ?? value);
      input.addEventListener("input", () => {
        if (input.value.trim() === "") {
          onChange(key, undefined);
          return;
        }

        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
          return;
        }

        onChange(key, parsed);
      });

      label.append(element("span", "", key), input);
      return label;
    });

  host.replaceChildren(...rows);
}

function setOverride(overrides: KnobOverrides, key: NumericKnobKey, value: number): KnobOverrides {
  return {
    ...overrides,
    [key]: value,
  };
}

function clearOverride(overrides: KnobOverrides, key: NumericKnobKey): KnobOverrides {
  const next: KnobOverrides = {
    ...overrides,
  };
  delete next[key];
  return next;
}

function renderReplay(host: HTMLElement, replay: ReplayResult, capacityRows: readonly CapacityRow[]): void {
  const summary = element(
    "div",
    "debug-replay-summary",
    `胜负:${replay.settled.victory ? "胜" : "负"} · coreHp:${format(replay.settled.coreHp)} · kills:${replay.settled.kills} · leaks:${replay.settled.leaks} · loot:${format(replay.settled.lootMultiplier)} · steps:${replay.settled.totalSteps}`,
  );
  const table = document.createElement("table");
  table.className = "debug-table";
  table.append(
    tableRow("th", ["波", "生", "杀", "漏", "发数", "解析怪数", "需求DPS", "2格比", "3格比", "密集"]),
    ...replay.rows.map((row) => {
      const capacity = capacityRows.find((item) => item.index === row.waveIndex);
      return tableRow("td", [
        String(row.waveIndex),
        String(row.spawned),
        String(row.kills),
        String(row.leaks),
        String(row.shotsFired),
        capacity === undefined ? "-" : String(capacity.totalCount),
        capacity === undefined ? "-" : format(capacity.demandDps),
        capacity === undefined ? "-" : format(capacity.ratio2),
        capacity === undefined ? "-" : format(capacity.ratio3),
        capacity?.dense ? "密" : "-",
      ]);
    }),
  );

  host.replaceChildren(summary, table);
}

function tableRow(tag: "td" | "th", cells: readonly string[]): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.append(
    ...cells.map((text) => {
      const cell = document.createElement(tag);
      cell.textContent = text;
      return cell;
    }),
  );
  return row;
}

function capacityRowsOf(model: PanelModel): readonly CapacityRow[] {
  const section = model.sections.find(
    (item): item is Extract<BalanceSection, { id: "capacity" }> => item.id === "capacity",
  );
  return section?.data.rows ?? [];
}

function isNumericEntry(entry: [string, unknown]): entry is [NumericKnobKey, number] {
  return typeof entry[1] === "number";
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

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureStyle(): void {
  if (document.getElementById(styleId) !== null) {
    return;
  }

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #${panelId} {
      position: fixed;
      top: 12px;
      right: 12px;
      bottom: 12px;
      width: min(520px, calc(100vw - 24px));
      z-index: 20;
      color: #1f2623;
      background: rgba(248, 250, 246, 0.96);
      border: 1px solid rgba(31, 38, 35, 0.18);
      box-shadow: 0 16px 50px rgba(0, 0, 0, 0.22);
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
    }
    #${panelId}.is-collapsed {
      bottom: auto;
      width: auto;
    }
    #${panelId}.is-collapsed .debug-body {
      display: none;
    }
    #${panelId} .debug-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(31, 38, 35, 0.14);
      background: #eef4ec;
    }
    #${panelId} .debug-title {
      font-weight: 700;
    }
    #${panelId} button {
      border: 1px solid rgba(31, 38, 35, 0.24);
      background: #ffffff;
      color: #1f2623;
      padding: 6px 10px;
      font: inherit;
      cursor: pointer;
    }
    #${panelId} button:hover {
      background: #e7efe4;
    }
    #${panelId} .debug-body {
      overflow: auto;
      padding: 12px;
    }
    #${panelId} .debug-banner {
      padding: 10px;
      border-left: 4px solid #9a5b00;
      background: #fff2d8;
      font-weight: 700;
      margin-bottom: 12px;
    }
    #${panelId} .debug-section {
      padding: 10px 0;
      border-top: 1px solid rgba(31, 38, 35, 0.12);
    }
    #${panelId} .debug-section:first-of-type {
      border-top: 0;
    }
    #${panelId} .debug-section-title {
      font-size: 14px;
      margin: 0 0 8px;
    }
    #${panelId} .debug-status {
      padding: 8px;
      margin-bottom: 8px;
      font-weight: 700;
    }
    #${panelId} .is-ok {
      background: #e7f6e7;
      color: #145c2e;
    }
    #${panelId} .is-bad {
      background: #ffe8e8;
      color: #8c1d1d;
    }
    #${panelId} .debug-section-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    #${panelId} .debug-section-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
    }
    #${panelId} .debug-light {
      min-width: 2em;
      font-weight: 700;
    }
    #${panelId} .debug-details {
      margin-top: 8px;
    }
    #${panelId} .debug-lines {
      max-height: 260px;
      overflow: auto;
      padding: 8px;
      background: #101411;
      color: #e7efe4;
      white-space: pre;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #${panelId} .debug-knobs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
    }
    #${panelId} .debug-knob {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    #${panelId} .debug-knob span {
      overflow-wrap: anywhere;
      color: #4b5550;
    }
    #${panelId} input {
      min-width: 0;
      border: 1px solid rgba(31, 38, 35, 0.24);
      padding: 6px;
      font: inherit;
      background: #ffffff;
      color: #1f2623;
    }
    #${panelId} .debug-replay-summary {
      margin: 8px 0;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    #${panelId} .debug-table {
      width: 100%;
      border-collapse: collapse;
      font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #${panelId} th,
    #${panelId} td {
      border: 1px solid rgba(31, 38, 35, 0.14);
      padding: 4px 5px;
      text-align: right;
      white-space: nowrap;
    }
    #${panelId} th {
      background: #eef4ec;
    }
    @media (max-width: 680px) {
      #${panelId} {
        left: 8px;
        right: 8px;
        top: 8px;
        bottom: 8px;
        width: auto;
      }
      #${panelId} .debug-section-list,
      #${panelId} .debug-knobs {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}
