import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import type { NextRequest } from "next/server";
import { getJob } from "../../_jobs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
  if (!id) return new Response("missing id", { status: 400 });

  const job = getJob(id);
  if (!job || job.status !== "done" || !job.outputPath) {
    return new Response("not ready", { status: 404 });
  }

  let size: number;
  try {
    size = (await stat(job.outputPath)).size;
  } catch {
    return new Response("output missing", { status: 404 });
  }

  const disposition =
    params.get("download") === "1"
      ? `attachment; filename="${job.downloadName}"`
      : `inline; filename="${job.downloadName}"`;

  const baseHeaders: Record<string, string> = {
    "Content-Type": job.contentType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposition,
    "Cache-Control": "no-store",
  };

  const range = request.headers.get("range");
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : size - 1;
    if (start >= size || end >= size || start > end) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const stream = Readable.toWeb(
      createReadStream(job.outputPath, { start, end }),
    ) as unknown as NodeWebReadableStream<Uint8Array>;
    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(job.outputPath),
  ) as unknown as NodeWebReadableStream<Uint8Array>;
  return new Response(stream as unknown as BodyInit, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
