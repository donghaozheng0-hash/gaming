#!/usr/bin/env bash
# 用 codex(非交互)按 Claude 签发的施工简报实施指定任务，随后自动跑硬门禁。
# 用法: scripts/codex-build.sh T1
# 依赖: codex 已在 PATH(由 Claude 接好)，且代理能干净访问 chatgpt.com。
set -euo pipefail
cd "$(dirname "$0")/.."

TASK="${1:?用法: scripts/codex-build.sh <TaskID>，例如 T1}"
BRIEF="docs/briefs/${TASK}.md"
[ -f "$BRIEF" ] || { echo "缺少施工简报 ${BRIEF} (应由 Claude 先写好)"; exit 1; }

if ! command -v codex >/dev/null 2>&1; then
  echo "错误：codex 不在 PATH。"
  echo "修复：ln -sf '/Applications/Codex.app/Contents/Resources/codex' /opt/homebrew/bin/codex"
  exit 1
fi

# 注：不做 curl 连通性预检——raw curl 对 chatgpt.com 会拿 Cloudflare 403/SSL 误报，
# 而带认证 token 的 codex 客户端实际可连。若真断网，下面的 codex exec 会自行报错退出。

echo "▶ [1/2] codex 施工 ${TASK}（sandbox=workspace-write）…"
codex exec --sandbox workspace-write - < "$BRIEF"

echo ""
echo "▶ [2/2] 运行硬门禁…"
# 视觉任务(契约 requires 含 "capture still")自动追加截图门禁
needs_capture="$(node -e "const c=(require('./acceptance/contracts.json').tasks['$TASK']||{});process.stdout.write(((c.requires||[]).includes('capture still'))?'1':'0')" 2>/dev/null || echo 0)"
if [ "$needs_capture" = "1" ]; then
  npm run quality:gate:capture -- --task "$TASK"
else
  npm run quality:gate -- --task "$TASK"
fi
