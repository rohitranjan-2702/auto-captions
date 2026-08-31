# auto-captions

Add captions to a talking-head video — as a CLI or a one-page web UI.

## Structure

- **`server/`** — the caption pipeline + CLI.
  `ffprobe` (detect frame size/orientation) → `ffmpeg` (extract 16 kHz mono wav) →
  `whisper.cpp` (transcribe to timestamped segments) → styled `.ass` subtitle file
  sized to the frame → `ffmpeg` (burn in, or mux a soft `mov_text` track).
  Caption styles (`default` / `bold` / `minimal` / `karaoke`) are scale factors that
  auto-fit to the real video dimensions. See `server/README.md`.
- **`webapp/`** — Next.js UI over the CLI. Upload a video, pick a style/options, poll
  a job, play or download the captioned result. API routes spawn the server CLI and
  persist each job under `webapp/.data/<id>/`. See `webapp/README.md`.

## Requirements

- Node.js 20+, plus `pnpm` (`npm i -g pnpm`)
- `ffmpeg` and `whisper-cli` on `PATH` — `brew install ffmpeg whisper-cpp`
- A whisper model at `server/models/ggml-small.en.bin` (the run script downloads it)

## Run locally

```bash
./run.sh          # installs deps, fetches the model, starts the webapp on :3000
./run.sh --cli video.mp4 --style bold   # run the CLI instead of the webapp
```
