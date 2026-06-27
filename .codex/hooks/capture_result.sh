#!/usr/bin/env bash
set -euo pipefail

RESULT="${1:-screenshots/result/1}"
URL="${2:-http://127.0.0.1:5173}"
DURATION="${3:-15}"

mkdir -p screenshots/result .capture
rm -rf "$RESULT"
mkdir -p "$RESULT"

npm run check
npm run build

SERVER_PID=""
if ! node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$URL"; then
    npm run dev > .capture/vite.log 2>&1 &
    SERVER_PID="$!"
    trap 'if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi' EXIT

    for _ in $(seq 1 60); do
        if node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$URL"; then
            break
        fi
        sleep 0.5
    done

    node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$URL" || {
        echo "error: Vite dev server did not become ready at $URL" >&2
        sed -n '1,160p' .capture/vite.log >&2 || true
        exit 1
    }
fi

node scripts/capture.mjs video "$RESULT" "$DURATION" "$URL"

ffmpeg -y -i "$RESULT/video.webm" \
    -c:v libx264 -pix_fmt yuv420p -preset medium -crf 22 -movflags +faststart \
    "$RESULT/video.mp4"
