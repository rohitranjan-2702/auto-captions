import { execa } from "execa";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CaptionCue } from "./styles.js";

export interface TranscribeOptions {
  /** path to a whisper.cpp ggml model .bin */
  modelPath: string;
  /** spoken language, or "auto" */
  language: string;
  /** number of CPU threads */
  threads?: number;
  /**
   * Max characters per whisper segment. Smaller = more, shorter cues, which
   * generally reads better as captions. 0 disables the limit.
   */
  maxSegmentLen?: number;
  /**
   * Emit one cue per word (whisper `-ml 1 -sow`) instead of per sentence.
   * Overrides maxSegmentLen. Needed for karaoke / word-by-word captions.
   */
  wordTimestamps?: boolean;
  /** whisper-cli binary name/path */
  bin?: string;
}

interface WhisperJson {
  transcription: Array<{
    offsets: { from: number; to: number };
    text: string;
  }>;
}

/**
 * Run whisper.cpp over a wav and return caption cues (times in seconds).
 * Writes "<wav without ext>.json" next to the wav as a side effect.
 */
export async function transcribe(
  wavPath: string,
  opts: TranscribeOptions,
): Promise<CaptionCue[]> {
  const bin = opts.bin ?? "whisper-cli";
  const outBase = wavPath.replace(/\.[^.]+$/, "");
  const args = [
    "-m",
    opts.modelPath,
    "-f",
    wavPath,
    "-l",
    opts.language,
    "-of",
    outBase,
    "--output-json",
    "--no-prints",
  ];
  if (opts.threads) args.push("-t", String(opts.threads));
  if (opts.wordTimestamps) {
    args.push("-ml", "1", "-sow");
  } else if (opts.maxSegmentLen && opts.maxSegmentLen > 0) {
    args.push("-ml", String(opts.maxSegmentLen), "-sow");
  }

  await execa(bin, args, { stdout: "ignore", stderr: "inherit" });

  const jsonPath = outBase + ".json";
  const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as WhisperJson;

  const cues: CaptionCue[] = [];
  for (const seg of parsed.transcription) {
    const text = seg.text.trim();
    if (!text) continue;
    const start = seg.offsets.from / 1000;
    const end = seg.offsets.to / 1000;
    if (end <= start) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

/** Resolve a model alias ("small.en") or a path to an actual .bin path. */
export function resolveModelPath(modelArg: string, modelsDir: string): string {
  if (modelArg.endsWith(".bin")) return modelArg;
  return path.join(modelsDir, `ggml-${modelArg}.bin`);
}
