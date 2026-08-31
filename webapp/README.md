# auto-captions webapp

Minimalist one-page UI over the `../server` CLI. Upload a video, choose a caption
style and options, and get the captioned video back to play in the browser or
download.

The visual design follows `../design/Auto Captions.dc.html` — Plus Jakarta Sans,
a warm off-white ground with a blue accent, a two-column stepped form with a
sticky live-preview panel. Tokens live at the top of `app/globals.css`.

## How it works

- `app/page.tsx` — the whole UI (client component): dropzone, style/language/soft
  options, progress log, `<video>` player + download link.
- `app/api/caption/route.ts` (`POST`) — saves the upload to a temp job dir and
  spawns the server CLI (`server/node_modules/.bin/tsx src/cli.ts …`). Returns a
  job id immediately.
- `app/api/caption/status/route.ts` (`GET ?id=`) — job status + streamed CLI log
  lines. The page polls this once a second.
- `app/api/caption/file/route.ts` (`GET ?id=` / `&download=1`) — streams the
  finished video with HTTP range support (seekable playback) or as an attachment.
- `app/api/_jobs.ts` — in-memory job registry (kept on `globalThis` so it
  survives dev HMR).

Each job's input and captioned output are persisted under `webapp/.data/<id>/`
(git-ignored). Job metadata (the id → paths map) is in-memory only, so after a
dev-server restart the files remain on disk but are no longer served; delete
`.data/` to reclaim space. Failed jobs delete their own dir.

## Prerequisites

Same as the server: `ffmpeg` and `whisper-cli` on `PATH`, and
`server/models/ggml-small.en.bin` present (`cd ../server && npm run model`).
Also run `pnpm install` in `../server` so its `tsx` binary exists.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

If the server lives somewhere other than `../server`, set
`AUTO_CAPTIONS_SERVER_DIR` to its path.

## Options exposed

| UI control        | CLI flag              |
| ----------------- | --------------------- |
| Style             | `--style`             |
| Language          | `--language`          |
| Max chars / cue   | `--max-segment-len`   |
| Soft subtitles    | `--soft`              |

Model is fixed to `small.en`. Upload cap is 500 MB.
