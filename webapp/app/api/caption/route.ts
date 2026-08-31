import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createJob, jobDir, type Job } from "../_jobs";

export const runtime = "nodejs";
// Captioning a clip can take a while; don't let the platform time the route out.
export const maxDuration = 600;

const SERVER_DIR =
  process.env.AUTO_CAPTIONS_SERVER_DIR ??
  path.resolve(process.cwd(), "..", "server");

const STYLES = new Set(["default", "bold", "minimal", "karaoke"]);
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

const EXT_CONTENT_TYPE: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".m4v": "video/mp4",
};

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("video");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "no video file provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `video exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` },
      { status: 413 },
    );
  }

  const style = String(form.get("style") ?? "default");
  if (!STYLES.has(style)) {
    return Response.json({ error: `unknown style: ${style}` }, { status: 400 });
  }
  const language = (String(form.get("language") ?? "en").trim() || "en").slice(0, 12);
  const soft = form.get("soft") === "true";
  const maxSegmentLenRaw = Number(form.get("maxSegmentLen") ?? 42);
  const maxSegmentLen =
    Number.isFinite(maxSegmentLenRaw) && maxSegmentLenRaw > 0
      ? Math.min(200, Math.round(maxSegmentLenRaw))
      : 42;

  const srcExt = (path.extname(file.name) || ".mp4").toLowerCase();
  const outExt = soft ? ".mp4" : srcExt in EXT_CONTENT_TYPE ? srcExt : ".mp4";
  const contentType = EXT_CONTENT_TYPE[outExt] ?? "video/mp4";
  const baseName = path.basename(file.name, path.extname(file.name)) || "video";

  const job = createJob(`${baseName}.captioned${outExt}`, contentType);
  const dir = jobDir(job.id);
  await mkdir(dir, { recursive: true });

  const inputPath = path.join(dir, `input${srcExt}`);
  const outputPath = path.join(dir, `output${outExt}`);
  await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

  const args = [
    "src/cli.ts",
    inputPath,
    "--style",
    style,
    "--language",
    language,
    "--max-segment-len",
    String(maxSegmentLen),
    "-o",
    outputPath,
  ];
  if (soft) args.push("--soft");

  runPipeline(job, args, outputPath, dir);

  return Response.json({ id: job.id });
}

function runPipeline(job: Job, args: string[], outputPath: string, dir: string) {
  const tsx = path.join(SERVER_DIR, "node_modules", ".bin", "tsx");
  const child = spawn(tsx, args, { cwd: SERVER_DIR, env: process.env });

  const push = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) job.log.push(line.trim());
    }
    if (job.log.length > 500) job.log.splice(0, job.log.length - 500);
  };
  child.stderr.on("data", push);
  child.stdout.on("data", push);

  child.on("error", (err) => {
    job.status = "error";
    job.error = `failed to start pipeline: ${err.message}`;
  });

  child.on("close", (code) => {
    if (job.status === "error") return;
    if (code === 0) {
      job.status = "done";
      job.outputPath = outputPath;
    } else {
      job.status = "error";
      job.error =
        job.log.slice(-4).join(" | ") || `pipeline exited with code ${code}`;
      rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
}
