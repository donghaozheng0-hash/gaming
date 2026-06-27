#!/usr/bin/env node
// 数值隔离自动门禁 —— 底层逻辑三的机器化执行。
// 扫描领域层，禁止：1) 硬编码平衡数值（白名单外的数字字面量）；2) 引入 Babylon。
// 配置：acceptance/isolation.config.json。测试/声明文件豁免。
// 单行豁免：在该行加注释标记（默认 "iso-ok: 原因"），仅供极少数结构性常数，滥用会被 Claude 评审驳回。
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";

const root = process.cwd();
const cfg = JSON.parse(
  readFileSync(resolve(root, "acceptance/isolation.config.json"), "utf8"),
);
const allow = new Set((cfg.allowNumbers ?? [-1, 0, 1, 2]).map(Number));
const marker = cfg.allowMarker ?? "iso-ok";
const ignore = cfg.ignore ?? [];
const forbidden = cfg.forbiddenImports ?? [];
const allowedPrefixes = cfg.allowedImportPrefixes ?? [];

function listFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...listFiles(p));
    } else if (
      name.endsWith(".ts") &&
      !ignore.some((s) => name.endsWith(s) || p.endsWith(s))
    ) {
      out.push(p);
    }
  }
  return out;
}

// 去掉注释与字符串，保留换行以维持行号；返回与原文等长的"代码骨架"。
function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let state = "code"; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { state = "sq"; out += " "; i++; continue; }
      if (c === '"') { state = "dq"; out += " "; i++; continue; }
      if (c === "`") { state = "tpl"; out += " "; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += "\n"; } else out += " ";
      i++; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { state = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    // 字符串：处理转义、保留换行
    const q = state === "sq" ? "'" : state === "dq" ? '"' : "`";
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (c === q) { state = "code"; out += " "; i++; continue; }
    out += c === "\n" ? "\n" : " "; i++; continue;
  }
  return out;
}

const numRe =
  /(?<![\w.$])-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const violations = [];
const dirs = (cfg.scan ?? []).map((d) => resolve(root, d));
let scanned = 0;

for (const dir of dirs) {
  for (const file of listFiles(dir)) {
    scanned++;
    const src = readFileSync(file, "utf8");
    const rawLines = src.split("\n");
    const codeLines = stripCommentsAndStrings(src).split("\n");
    const rel = file.slice(root.length + 1);
    for (let li = 0; li < codeLines.length; li++) {
      const rawLine = rawLines[li] ?? "";
      if (rawLine.includes(marker)) continue; // 行级豁免

      // 禁止的 import（在原始行上判断模块说明符）
      const imp =
        rawLine.match(/from\s+['"]([^'"]+)['"]/) ||
        rawLine.match(/import\s*\(\s*['"]([^'"]+)['"]/) ||
        rawLine.match(/import\s+['"]([^'"]+)['"]/);
      if (imp) {
        const spec = imp[1];
        if (
          forbidden.some((f) => spec.startsWith(f)) &&
          !allowedPrefixes.some((p) => spec.startsWith(p))
        ) {
          violations.push({ file: rel, line: li + 1, kind: "import", text: spec });
        }
      }

      // 魔法数字（在去注释/字符串后的代码骨架上判断）
      let m;
      numRe.lastIndex = 0;
      while ((m = numRe.exec(codeLines[li]))) {
        const tok = m[0];
        const val = /^-?0[xX]/.test(tok) ? parseInt(tok, 16) : Number(tok);
        if (!allow.has(val)) {
          violations.push({
            file: rel,
            line: li + 1,
            kind: "number",
            text: tok,
            snippet: rawLine.trim().slice(0, 100),
          });
        }
      }
    }
  }
}

mkdirSync(resolve(root, "reports"), { recursive: true });
writeFileSync(
  resolve(root, "reports/isolation.json"),
  JSON.stringify(
    { scanned, violations, generatedAt: new Date().toISOString() },
    null,
    2,
  ),
);

if (scanned === 0) {
  console.log(
    "[isolation] PENDING - 领域层目录尚未建立(src/game/{formulas,battle,meta,events})，暂无文件可扫描。Codex 落地后本门禁自动生效。",
  );
  process.exit(0);
}

if (violations.length) {
  console.error(
    `\n[isolation] FAIL - 发现 ${violations.length} 处隔离违规（领域层禁止硬编码平衡数值 / 引入 Babylon）：`,
  );
  for (const v of violations.slice(0, 50)) {
    if (v.kind === "import")
      console.error(`  ${v.file}:${v.line}  禁止引入 -> ${v.text}`);
    else
      console.error(
        `  ${v.file}:${v.line}  魔法数字 ${v.text}  | ${v.snippet}`,
      );
  }
  if (violations.length > 50)
    console.error(`  ... 其余 ${violations.length - 50} 处见 reports/isolation.json`);
  console.error(
    `\n修复方式：把数值移入 src/config/**，业务只读配置跑公式；确属结构性常数需保留请在该行加注释 "${marker}: 原因"（会被 Claude 评审）。`,
  );
  process.exit(1);
}

console.log(
  `[isolation] PASS - 扫描 ${scanned} 个领域文件，无硬编码平衡数值 / 无禁用引入。`,
);
process.exit(0);
