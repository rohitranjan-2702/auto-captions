# auto-captions

CLI that takes a talking-head video and outputs a version with burned-in (or soft) captions.

**Pipeline:** ffprobe (detect size/orientation) → ffmpeg (extract 16 kHz mono wav) → whisper.cpp (transcribe to timestamped segments) → ASS subtitle file (styled, sized to the frame) → ffmpeg (burn in or mux).

## Requirements

- Node.js 20+
- `ffmpeg` on PATH (`brew install ffmpeg`)
- `whisper-cli` on PATH (`brew install whisper-cpp`)
- A whisper model in `./models` — `npm run model` grabs `small.en`

## Setup

```bash
npm install
npm run model            # downloads models/ggml-small.en.bin
npm run build
```

## Usage

```bash
# dev (no build step)
npm run dev -- samples/sample.mp4 --style bold

# built
node dist/cli.js <video> [options]
```

### Options

| flag | default | meaning |
| --- | --- | --- |
| `-m, --model <name\|path>` | `small.en` | model alias (resolves to `models/ggml-<name>.bin`) or a `.bin` path |
| `-s, --style <preset>` | `default` | `default` \| `bold` \| `minimal` \| `karaoke` |
| `-l, --language <lang>` | `en` | spoken language, or `auto` to detect |
| `-o, --output <path>` | `<video>.captioned.<ext>` | output file |
| `--soft` | off | mux a toggleable `mov_text` track instead of burning pixels (no re-encode) |
| `--max-segment-len <chars>` | `42` | cap characters per caption cue; lower = shorter, snappier cues |
| `-t, --threads <n>` | whisper default | transcription CPU threads |
| `--keep-temp` | off | keep the intermediate wav/json and write a sidecar `.ass` |
| `--models-dir <path>` | `./models` | where `ggml-*.bin` models live |

On success the output video path is printed to stdout; progress goes to stderr.

## Caption styles & auto-fit

Presets live in `src/styles.ts` as plain objects (`STYLE_PRESETS`). They store
**scale factors**, not pixels — font size as a fraction of the video's short side,
margins as fractions of width/height, an outline/shadow ratio, and a glyph-aspect
hint for wrapping.

At render time the pipeline probes the real video with `ffprobe` (honouring
rotation metadata) and `resolveStyle()` turns those factors into concrete pixels:

- the `.ass` canvas (`PlayResX/Y`) is set to the actual frame size, so nothing is
  scaled or stretched by the `subtitles` filter
- font size scales off the **short side**, so a 1080p landscape clip and a
  1080-wide vertical reel get the same readable text height
- **portrait** videos get more vertical lift (clear of platform UI) and fewer
  characters per line; landscape/square sit in the lower third
- line-wrap width is computed from the usable frame width and font size, capped
  per preset, so captions never run past the safe margins

The pipeline logs what it picked, e.g.
`Captions: default style, 54px font, ≤31 chars/line, 86px from bottom.`

Add a preset by adding a key to `STYLE_PRESETS`.

### Word-by-word (`--style karaoke`)

The `karaoke` preset sets `mode: "karaoke"`. In this mode the pipeline runs
whisper with per-word timestamps (`-ml 1 -sow`), groups the words into short
single-line phrases (breaking on `karaokeMaxWords`, the char cap, or a silence
longer than `karaokeMaxGap`), and emits one ASS event per phrase with a `\kf`
sweep on each word — the highlight (`spokenColor`) fills each word across its
spoken duration, unspoken words sit in `unspokenColor`. `--max-segment-len` is
ignored for this style. Everything else (auto-fit font size, safe margins,
portrait lift, `--soft`) works the same.

## Layout

- `src/probe.ts` — `probeVideo` — ffprobe wrapper: display dimensions + orientation
- `src/audio.ts` — `extractAudio`
- `src/transcribe.ts` — shells out to `whisper-cli`, parses its JSON into cues
- `src/styles.ts` — `CaptionStyle` presets (scale factors), `resolveStyle`, ASS writer + word wrap
- `src/burn.ts` — `burnCaptions` (hard `subtitles=` filter, or soft mux)
- `src/pipeline.ts` — chains the steps, temp-file lifecycle
- `src/cli.ts` — commander + zod arg parsing

## Notes

- whisper.cpp is invoked as a subprocess, so the ASR binary is swappable without
  touching TS (e.g. a different local model later).
- Word-by-word / karaoke captions (`--style karaoke`) use whisper's per-word
  timestamps (`-ml 1 -sow`) and per-word ASS `\kf` sweep tags.
