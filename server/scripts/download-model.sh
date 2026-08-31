#!/usr/bin/env bash
# Download a whisper.cpp ggml model into ./models
# Usage: scripts/download-model.sh [name]   e.g. small.en | medium | large-v3
set -euo pipefail

NAME="${1:-small.en}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/models"
OUT="$DIR/ggml-${NAME}.bin"
URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${NAME}.bin"

mkdir -p "$DIR"
if [[ -f "$OUT" ]]; then
  echo "already have $OUT"
  exit 0
fi
echo "downloading $NAME -> $OUT"
curl -L -f --progress-bar -o "$OUT" "$URL"
echo "done"
