import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  copyFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractAudio } from "./audio.js";
import { transcribe, resolveModelPath } from "./transcribe.js";
import { burnCaptions } from "./burn.js";
import { probeVideo } from "./probe.js";
import {
  buildAss,
  buildKaraokeAss,
  resolveStyle,
  STYLE_PRESETS,
  type StylePresetName,
} from "./styles.js";

export interface PipelineOptions {
  model: string;
  style: StylePresetName;
  language: string;
  soft: boolean;
  output?: string;
  keepTemp: boolean;
  threads?: number;
  maxSegmentLen?: number;
  modelsDir: string;
}

export interface PipelineResult {
  outputPath: string;
  assPath: string;
  cueCount: number;
  tempDir: string;
  keptTemp: boolean;
}

type Logger = (msg: string) => void;

export async function run(
  videoPath: string,
  opts: PipelineOptions,
  log: Logger = () => {},
): Promise<PipelineResult> {
  const modelPath = resolveModelPath(opts.model, opts.modelsDir);
  await access(modelPath).catch(() => {
    throw new Error(
      `model not found: ${modelPath}\n` +
        `  download one with:  npm run model -- ${opts.model}`,
    );
  });
  const style = STYLE_PRESETS[opts.style];
  if (!style) throw new Error(`unknown style preset: ${opts.style}`);

  const ext = opts.soft ? ".mp4" : path.extname(videoPath) || ".mp4";
  const outputPath =
    opts.output ??
    path.join(
      path.dirname(videoPath),
      path.basename(videoPath).replace(/\.[^.]+$/, "") + ".captioned" + ext,
    );

  const tempDir = await mkdtemp(path.join(tmpdir(), "auto-captions-"));
  let keptTemp = false;
  try {
    const video = await probeVideo(videoPath);
    log(`Video: ${video.width}x${video.height} (${video.orientation}).`);

    log("Extracting audio (16 kHz mono wav)…");
    const wav = await extractAudio(videoPath, tempDir);

    const karaoke = style.mode === "karaoke";
    log(`Transcribing with ${path.basename(modelPath)}…`);
    const cues = await transcribe(wav, {
      modelPath,
      language: opts.language,
      threads: opts.threads,
      maxSegmentLen: opts.maxSegmentLen,
      wordTimestamps: karaoke,
    });
    if (cues.length === 0)
      throw new Error("no speech detected — nothing to caption");
    log(`Got ${cues.length} ${karaoke ? "word" : "caption"} cues.`);

    const r = resolveStyle(style, video);
    log(
      `Captions: ${opts.style} style${karaoke ? " (word-by-word)" : ""}, ` +
        `${r.fontSize}px font, ≤${r.maxCharsPerLine} chars/line, ` +
        `${r.marginV}px from bottom.`,
    );
    const assPath = path.join(tempDir, "captions.ass");
    const assText = karaoke
      ? buildKaraokeAss(cues, style, video)
      : buildAss(cues, style, video);
    await writeFile(assPath, assText, "utf8");

    log(
      opts.soft
        ? "Muxing soft subtitle track…"
        : "Burning captions into video…",
    );
    await burnCaptions(videoPath, assPath, outputPath, { soft: opts.soft });

    let finalAss = assPath;
    if (opts.keepTemp) {
      const sidecar = outputPath.replace(/\.[^.]+$/, "") + ".ass";
      await copyFile(assPath, sidecar).catch(() => {});
      finalAss = sidecar;
      keptTemp = true;
    }

    log(`Done → ${outputPath}`);
    return {
      outputPath,
      assPath: finalAss,
      cueCount: cues.length,
      tempDir,
      keptTemp,
    };
  } finally {
    if (!opts.keepTemp) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    } else {
      log(`Kept intermediates in ${tempDir}`);
    }
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
