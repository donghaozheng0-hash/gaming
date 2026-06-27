#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

claude -p "$(cat docs/CLAUDE_SUPERVISOR_PROMPT.md)" \
  --permission-mode acceptEdits \
  --add-dir /Users/justin/Downloads
