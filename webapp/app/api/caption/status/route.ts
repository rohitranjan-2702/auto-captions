import type { NextRequest } from "next/server";
import { getJob } from "../../_jobs";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const job = getJob(id);
  if (!job) return Response.json({ error: "unknown job" }, { status: 404 });

  return Response.json({
    id: job.id,
    status: job.status,
    log: job.log,
    error: job.error ?? null,
    ready: job.status === "done",
  });
}
