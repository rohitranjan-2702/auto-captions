import { randomUUID } from "node:crypto";
import path from "node:path";

export type JobStatus = "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  /** progress lines streamed from the CLI (stderr) */
  log: string[];
  /** absolute path to the finished captioned video (when status === "done") */
  outputPath?: string;
  /** original upload filename, used for the download name */
  downloadName: string;
  /** mime type to serve the output with */
  contentType: string;
  error?: string;
  createdAt: number;
}

/**
 * Jobs live in memory. Next's dev server re-evaluates route modules on HMR, so we
 * stash the map on globalThis to keep running jobs visible across reloads.
 */
const store: Map<string, Job> =
  (globalThis as { __autoCaptionJobs__?: Map<string, Job> }).__autoCaptionJobs__ ??
  new Map();
(globalThis as { __autoCaptionJobs__?: Map<string, Job> }).__autoCaptionJobs__ = store;

export function createJob(downloadName: string, contentType: string): Job {
  const job: Job = {
    id: randomUUID(),
    status: "running",
    log: [],
    downloadName,
    contentType,
    createdAt: Date.now(),
  };
  store.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

/** Persisted, git-ignored output tree: webapp/.data/<id>/ */
export function jobDir(id: string): string {
  return path.join(process.cwd(), ".data", id);
}
