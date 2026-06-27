#!/usr/bin/env node
// 符塔 · 硬验收门禁（多阶段）。
// 阶段：结构 → 依赖 → 数值隔离 → TypeScript → 单测(含黄金算例) → 构建 →(可选)截图。
// 用法：
//   node scripts/quality-gate.mjs              基础门禁
//   node scripts/quality-gate.mjs --capture    含截图门禁(视觉任务必跑)
//   node scripts/quality-gate.mjs --task T2     额外校验该任务契约要求的阶段是否全过
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);
const withCapture = args.includes("--capture");
const taskIdx = args.indexOf("--task");
const taskId = taskIdx >= 0 ? args[taskIdx + 1] : null;
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` - ${detail}` : ""}`);
}
function checkPath(path, label = path) {
  record(label, existsSync(resolve(root, path)), path);
}
function run(name, command, cmdArgs) {
  const r = spawnSync(command, cmdArgs, { cwd: root, stdio: "inherit", shell: false });
  record(name, r.status === 0, `${command} ${cmdArgs.join(" ")}`);
}

// 0) 任务契约（如指定 --task）：施工前已约定的客观 DoD，先打印再据此判定。
let contract = null;
if (taskId) {
  const cpath = resolve(root, "acceptance/contracts.json");
  if (existsSync(cpath)) {
    contract = JSON.parse(readFileSync(cpath, "utf8")).tasks?.[taskId] ?? null;
  }
  if (contract) {
    console.log(`\n=== 任务契约 ${taskId}：${contract.title} ===`);
    console.log("Definition of Done:");
    for (const d of contract.definitionOfDone ?? []) console.log(`  - ${d}`);
    if (contract.evidence?.length) {
      console.log("必需证据:");
      for (const e of contract.evidence) console.log(`  - ${e}`);
    }
    if (contract.forbidden?.length) {
      console.log("红线(出现即 FAIL):");
      for (const f of contract.forbidden) console.log(`  - ${f}`);
    }
    console.log("");
  } else {
    console.log(`\n[warn] 未找到任务契约 ${taskId}，仅跑通用门禁。\n`);
  }
}

// 1) 结构
checkPath("CLAUDE.md");
checkPath("AGENTS.md");
checkPath(".claude/skills/godogen", "Claude godogen skill");
checkPath(".agents/skills/godogen", "Codex godogen skill");
checkPath("package.json");
checkPath("tsconfig.json");
checkPath("src/main.ts");
checkPath("docs/PROJECT_BRAIN.md");
checkPath("docs/WORKFLOW.md");
checkPath("docs/ACCEPTANCE_GATE.md");
checkPath("docs/DATA_ARCHITECTURE.md");
checkPath("docs/GAME_ARCHITECTURE.md");
checkPath("docs/VISUAL_DIRECTION.md");
checkPath("acceptance/contracts.json");

// 2) 依赖
{
  const ok = existsSync(resolve(root, "node_modules"));
  record("dependencies", ok, ok ? "node_modules present" : "node_modules missing; run npm install");
}

// 3) 数值隔离（底层逻辑三机器化门禁 · 代码侧）
run("isolation", "node", ["scripts/check-isolation.mjs"]);

// 3.5) 配置层完整性（底层逻辑三机器化门禁 · 数据侧）：11 张表齐全 + levels 交叉引用可解析
run("config tables", "node", ["scripts/check-config.mjs"]);

// 4) TypeScript
run("typescript", "npm", ["run", "check"]);

// 5) 单测（含黄金算例，公式落地后自动生效）
run("test", "npm", ["test"]);

// 6) 构建
run("build", "npm", ["run", "build"]);

// 7) 截图（可选；视觉任务必跑）
if (withCapture) {
  run("capture still", "npm", ["run", "capture:still"]);
  checkPath("screenshots/still.png", "capture artifact");
}

const pass = results.every((i) => i.pass);

// 任务契约要求的阶段是否全过
let contractPass = null;
if (contract?.requires?.length) {
  const byName = Object.fromEntries(results.map((r) => [r.name, r.pass]));
  const missing = contract.requires.filter((s) => !byName[s]);
  contractPass = missing.length === 0;
  console.log(
    `\n任务 ${taskId} 契约阶段：${contractPass ? "全部通过 ✅" : "未达标 ❌ -> " + missing.join(", ")}`,
  );
  if (contract.evidence?.length) {
    console.log("（人工复核）截图/录像证据是否满足上述必需证据，由 Claude 在验收结论中引用确认。");
  }
}

const reportPath = resolve(root, "reports/quality-gate.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  JSON.stringify(
    { pass, contractPass, task: taskId, withCapture, generatedAt: new Date().toISOString(), results },
    null,
    2,
  ),
);

const ok = pass && contractPass !== false;
console.log(`\nquality-gate: ${pass ? "PASS" : "FAIL"}${contractPass === false ? "（任务契约未达标）" : ""}`);
console.log(`report: ${reportPath}`);
process.exit(ok ? 0 : 1);
