import { execa } from "execa";

/**
 * Escape a path for use inside the ffmpeg `subtitles=` filter argument.
 * Colons and backslashes are filter-syntax metacharacters.
 */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export interface BurnOptions {
  /** mux as a soft (toggleable) subtitle track instead of burning pixels */
  soft?: boolean;
  /** audio bitrate for the re-encoded track (hard path only) */
  audioBitrate?: string;
}

/**
 * Produce `outPath` from `videoPath` + `assPath`.
 * - hard (default): re-encode video with the subtitles filter; carry the
 *   original audio through (re-encoded to AAC so it always lands in an MP4
 *   regardless of the source codec)
 * - soft: copy the original video + audio, add the subtitles as a mov_text track
 *
 * Both paths map the source audio explicitly with a trailing `?` so a silent
 * (audio-less) input still succeeds instead of aborting.
 */
export async function burnCaptions(
  videoPath: string,
  assPath: string,
  outPath: string,
  opts: BurnOptions = {},
): Promise<string> {
  if (opts.soft) {
    await execa("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-i",
      assPath,
      "-map",
      "0:v",
      "-map",
      "0:a?",
      "-map",
      "1",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-c:s",
      "mov_text",
      "-metadata:s:s:0",
      "language=eng",
      "-movflags",
      "+faststart",
      outPath,
    ]);
  } else {
    await execa("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      `subtitles='${escapeFilterPath(assPath)}'`,
      "-c:a",
      "aac",
      "-b:a",
      opts.audioBitrate ?? "192k",
      "-movflags",
      "+faststart",
      outPath,
    ]);
  }
  return outPath;
}
