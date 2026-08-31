import { execa } from "execa";

export type Orientation = "landscape" | "portrait" | "square";

export interface VideoInfo {
  /** display width in pixels (after any rotation metadata is applied) */
  width: number;
  /** display height in pixels (after any rotation metadata is applied) */
  height: number;
  orientation: Orientation;
}

interface FfprobeStream {
  width?: number;
  height?: number;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
}

/**
 * Read the first video stream's *display* dimensions. ffmpeg auto-rotates frames
 * before the subtitles filter runs, so a 1920x1080 clip tagged rotate=90 is
 * really shown as 1080x1920 — we swap accordingly.
 */
export async function probeVideo(videoPath: string, bin = "ffprobe"): Promise<VideoInfo> {
  const { stdout } = await execa(bin, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:stream_side_data=rotation:stream_tags=rotate",
    "-of",
    "json",
    videoPath,
  ]);

  const stream: FfprobeStream | undefined = JSON.parse(stdout).streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error(`could not read video dimensions from ${videoPath}`);
  }

  let width = Number(stream.width);
  let height = Number(stream.height);

  let rotation = 0;
  const sd = stream.side_data_list?.find((d) => typeof d.rotation === "number");
  if (sd?.rotation !== undefined) rotation = sd.rotation;
  else if (stream.tags?.rotate) rotation = Number(stream.tags.rotate);

  const norm = (((Math.round(rotation) % 360) + 360) % 360);
  if (norm === 90 || norm === 270) [width, height] = [height, width];

  const orientation: Orientation =
    width > height ? "landscape" : width < height ? "portrait" : "square";

  return { width, height, orientation };
}
