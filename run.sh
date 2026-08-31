#!/usr/bin/env bash
# Set up and run auto-captions locally.
#   ./run.sh                       -> install deps + model, start the webapp on :3000
#   ./run.sh --cli <video> [opts]  -> run the server CLI instead
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

command -v ffmpeg >/dev/null      || { echo "missing ffmpeg (brew install ffmpeg)" >&2; exit 1; }
command -v whisper-cli >/dev/null || { echo "missing whisper-cli (brew install whisper-cpp)" >&2; exit 1; }
command -v pnpm >/dev/null        || { echo "missing pnpm (npm i -g pnpm)" >&2; exit 1; }

# server deps + whisper model
[ -d server/node_modules ] || (cd server && pnpm install)
[ -f server/models/ggml-small.en.bin ] || (cd server && pnpm run model)

if [ "${1:-}" = "--cli" ]; then
  shift
  exec pnpm --dir server exec tsx src/cli.ts "$@"
fi

# webapp
[ -d webapp/node_modules ] || (cd webapp && pnpm install)
echo "starting webapp on http://localhost:3000"
exec pnpm --dir webapp dev
