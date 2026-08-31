#!/usr/bin/env node
import { Command } from "commander";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { run, type PipelineOptions } from "./pipeline.js";
import { STYLE_PRESETS } from "./styles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MODELS_DIR = path.join(PROJECT_ROOT, "models");

const optsSchema = z.object({
  model: z.string().default("small.en"),
  style: z.enum(Object.keys(STYLE_PRESETS) as [string, ...string[]]).default("default"),
  language: z.string().default("en"),
  soft: z.boolean().default(false),
  output: z.string().optional(),
  keepTemp: z.boolean().default(false),
  threads: z.coerce.number().int().positive().optional(),
  maxSegmentLen: z.coerce.number().int().positive().default(42),
  modelsDir: z.string().default(DEFAULT_MODELS_DIR),
});

const program = new Command();

program
  .name("auto-captions")
  .description("Transcribe a talking-head video and burn in (or mux) captions.")
  .argument("<video>", "path to the input video")
  .option("-m, --model <name|path>", "whisper model alias or .bin path", "small.en")
  .option("-s, --style <preset>", `caption style: ${Object.keys(STYLE_PRESETS).join(" | ")}`, "default")
  .option("-l, --language <lang>", "spoken language ('auto' to detect)", "en")
  .option("--soft", "mux a toggleable subtitle track instead of burning in", false)
  .option("-o, --output <path>", "output video path")
  .option("--keep-temp", "keep intermediate wav/json/ass files", false)
  .option("-t, --threads <n>", "whisper CPU threads")
  .option("--max-segment-len <chars>", "cap characters per caption cue (shorter = snappier)", "42")
  .option("--models-dir <path>", "directory holding ggml-*.bin models", DEFAULT_MODELS_DIR)
  .action(async (video: string, raw: Record<string, unknown>) => {
    const parsed = optsSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Invalid options:", z.prettifyError(parsed.error));
      process.exitCode = 1;
      return;
    }
    const opts = parsed.data as unknown as PipelineOptions;

    try {
      await access(video);
    } catch {
      console.error(`Input video not found: ${video}`);
      process.exitCode = 1;
      return;
    }

    try {
      const res = await run(video, opts, (m) => console.error(m));
      console.log(res.outputPath);
    } catch (err) {
      console.error(`\nFailed: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program.parseAsync();
