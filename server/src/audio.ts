import { execa } from "execa";
import path from "node:path";

/**
 * Extract a 16 kHz mono PCM WAV from a video — the format whisper.cpp expects.
 * Returns the path to the written wav.
 */
export async function extractAudio(videoPath: string, outDir: string): Promise<string> {
  const wavPath = path.join(outDir, path.basename(videoPath).replace(/\.[^.]+$/, "") + ".wav");
  await execa("ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    wavPath,
  ]);
  return wavPath;
}
