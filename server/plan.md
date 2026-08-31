# Auto-Captions Pipeline — Implementation Plan

**Goal:** CLI tool that takes a talking-head video and outputs a version with burned-in (or soft) captions.

**Stack:** TypeScript + Node.js + whisper.cpp (shelled out to) + ffmpeg

---

## 1. Project setup

- `npm init`, TypeScript config (`tsc --init`), `tsx` or `ts-node` for dev runs
- Install deps: `ffmpeg` (brew, invoked as a subprocess — no need for a wrapper lib, but `fluent-ffmpeg` or plain `execa`/`child_process.spawn` both work fine)
- Install/build `whisper.cpp` (brew or build from source) — invoke its CLI binary directly via `child_process`, since there's no need for a native Node binding; this keeps the whisper.cpp binary swappable (e.g. for Parakeet-MLX later) without touching TS code
- Download a whisper model (start with `small` or `medium` for speed/accuracy balance; `large-v3` if accuracy matters more than speed)
- Useful npm packages: `execa` (subprocess handling with better ergonomics than raw `child_process`), `commander` or `yargs` (CLI parsing), `zod` (validate CLI args/config)

## 2. Audio extraction

- `extractAudio(videoPath: string): Promise<string>` (returns wav path)
- ffmpeg: `-vn -acodec pcm_s16le -ar 16000 -ac 1` (16kHz mono, what Whisper expects)
- Run via `execa('ffmpeg', [...args])`

## 3. Transcription

- `transcribe(wavPath: string): Promise<string>` (returns srt path)
- Shell out to whisper.cpp's `main`/`whisper-cli` binary with `--output-srt`, parse stdout/exit code
- Store word-level timestamps too (whisper.cpp supports `--output-json` with word timings) if planning animated/word-by-word captions later

## 4. Caption styling

- `styleSrt(srtPath: string, style: CaptionStyle): Promise<string>` (returns `.ass` path)
- Write a small SRT→ASS converter, or shell out to ffmpeg's built-in conversion and post-process the `.ass` for style overrides
- Define: font, size, color, outline/shadow, position (bottom-third, below talking head), max chars/line, line-break logic
- `CaptionStyle` as a TS interface/type; keep presets (e.g. `default`, `bold`, `minimal`) in a config object so they're easy to extend

## 5. Burn-in (or soft subs)

- `burnCaptions(videoPath: string, assPath: string, opts: { soft?: boolean }): Promise<string>`
- ffmpeg: `-vf "subtitles=captions.ass"` (hardcoded) — default path
- Optional `--soft` flag for `-c:s mov_text` mux instead (toggleable captions, no re-encode)

## 6. CLI wrapper

- `caption.ts video.mp4 [--model small|medium|large-v3] [--style default|bold|minimal] [--soft] [--output out.mp4]`
- Build with `commander`, entry point compiled to a `bin` script (or run via `tsx` during dev)
- Chain steps 2→5, clean up intermediate files unless `--keep-temp`

## 7. Test & validate

- Run on 1–2 sample videos
- Check: timing sync, line wrapping, readability, edge cases (silence, overlapping speech, filler words)

## 8. (Optional next iteration)

- ~~Word-by-word animated caption style (needs word-level timestamps → per-word `.ass` karaoke tags)~~ — done: `--style karaoke` (whisper `-ml 1 -sow` → per-word `\kf` sweep)
- Batch mode for multiple videos
- Auto-detect video orientation to adjust caption position/size (vertical vs horizontal)

---

**Suggested build order for Claude Code:** 1 → 2 → 3 → 5 (basic burn-in with default SRT styling) → get an end-to-end working version fast → then layer in 4 (styling) and 6 (CLI polish).

**Note on Node + whisper.cpp:** there's no need for a native npm binding — shelling out to the compiled `whisper.cpp` binary via `execa`/`child_process` is simpler, keeps the pipeline binary-agnostic (easy to swap in a different local ASR binary later), and avoids native module build headaches on Apple Silicon.
