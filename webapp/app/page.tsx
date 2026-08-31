"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

const STYLES = [
  {
    value: "default",
    name: "Classic",
    hint: "White, bold, sits low in frame",
    sample: "Clean and clear",
  },
  {
    value: "bold",
    name: "Punchy",
    hint: "Yellow caps with a thick outline",
    sample: "Loud & punchy",
  },
  {
    value: "minimal",
    name: "Minimal",
    hint: "Light type, no shadow, stays out of the way",
    sample: "quiet and simple",
  },
  {
    value: "karaoke",
    name: "Karaoke",
    hint: "Each word lights up as it's spoken",
    sample: "word by word",
  },
] as const;

const LANGS: [string, string][] = [
  ["English", "en"],
  ["Detect automatically", "auto"],
  ["Spanish", "es"],
  ["French", "fr"],
  ["German", "de"],
  ["Portuguese", "pt"],
  ["Italian", "it"],
  ["Hindi", "hi"],
  ["Japanese", "ja"],
];

const STAGES: { re: RegExp; pct: number; label: string }[] = [
  { re: /Extracting audio/i, pct: 16, label: "Listening to the audio…" },
  { re: /Transcribing with/i, pct: 32, label: "Listening to the audio…" },
  { re: /Got \d+ (?:caption|word) cues/i, pct: 66, label: "Writing the captions…" },
  { re: /Burning captions|Muxing soft/i, pct: 86, label: "Rendering your video…" },
];

function stageOf(log: string[]) {
  let cur = { pct: 8, label: "Starting up…" };
  const joined = log.join("\n");
  for (const s of STAGES) if (s.re.test(joined)) cur = { pct: s.pct, label: s.label };
  return cur;
}

function parseCues(log: string[]): string | null {
  const m = log.join("\n").match(/Got (\d+) (caption|word) cues/);
  return m ? `${m[1]} ${m[2] === "word" ? "words" : "cues"}` : null;
}

const SAMPLE = "Nobody tells you this part";

function sampleWords(style: string): { t: string; s: CSSProperties }[] {
  const parts = SAMPLE.split(" ");
  const base: CSSProperties = {
    fontSize: 20,
    lineHeight: 1.35,
    fontWeight: 700,
    color: "#fff",
  };
  if (style === "bold")
    return parts.map((t) => ({
      t: t.toUpperCase(),
      s: {
        ...base,
        fontWeight: 800,
        color: "#FFE84A",
        WebkitTextStroke: "2px #000",
        letterSpacing: "0.01em",
      },
    }));
  if (style === "minimal")
    return parts.map((t) => ({
      t,
      s: { ...base, fontWeight: 400, fontSize: 18, color: "rgba(255,255,255,0.95)" },
    }));
  if (style === "karaoke")
    return parts.map((t, i) => ({
      t,
      s:
        i === 2
          ? { ...base, background: "oklch(0.6 0.19 150)", borderRadius: 5, padding: "0 5px" }
          : { ...base, color: i > 2 ? "rgba(255,255,255,0.5)" : "#fff" },
    }));
  return parts.map((t) => ({
    t,
    s: { ...base, textShadow: "0 2px 8px rgba(0,0,0,0.65)" },
  }));
}

function StyleSample({ value, text }: { value: string; text: string }) {
  if (value === "bold")
    return (
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "#FFE84A",
          textTransform: "uppercase",
          letterSpacing: "0.01em",
          WebkitTextStroke: "1.4px #000",
        }}
      >
        {text}
      </span>
    );
  if (value === "minimal")
    return (
      <span style={{ fontSize: 12.5, fontWeight: 400, color: "rgba(255,255,255,0.95)" }}>
        {text}
      </span>
    );
  if (value === "karaoke") {
    const parts = text.split(" ");
    return (
      <span className="flex items-end gap-1">
        {parts.map((p, i) => (
          <span
            key={i}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: i === 2 ? "rgba(255,255,255,0.5)" : "#fff",
              background: i === 1 ? "oklch(0.6 0.19 150)" : undefined,
              borderRadius: i === 1 ? 4 : undefined,
              padding: i === 1 ? "0 4px" : undefined,
            }}
          >
            {p}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#fff",
        textShadow: "0 2px 6px rgba(0,0,0,0.7)",
      }}
    >
      {text}
    </span>
  );
}

function PreviewShell({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[0_6px_24px_rgba(20,20,50,0.06)]">
      <div className="mb-[14px] flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span className="text-[12.5px] text-[var(--muted-2)]">{note}</span>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-[13px] bg-[oklch(0.26_0.015_265)]">
        {children}
      </div>
    </div>
  );
}

function SampleOverlay({
  words,
  tag,
}: {
  words: { t: string; s: CSSProperties }[];
  tag: string;
}) {
  return (
    <>
      <div className="absolute top-3 left-[14px] font-mono text-[11px] text-white/60">
        {tag}
      </div>
      <div className="absolute inset-x-0 bottom-[34px] flex justify-center px-7">
        <div className="flex flex-wrap justify-center gap-[6px] text-center">
          {words.map((w, i) => (
            <span key={i} style={w.s}>
              {w.t}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-[14px] bottom-3 flex items-center gap-[10px]">
        <div className="grid size-[22px] place-items-center rounded-full bg-white/[0.16]">
          <div className="ml-[2px] size-0 border-y-[4.5px] border-l-[7px] border-y-transparent border-l-white" />
        </div>
        <div className="h-[3px] flex-1 overflow-hidden rounded-[2px] bg-white/20">
          <div className="h-full w-[38%] bg-white" />
        </div>
        <span className="font-mono text-[10.5px] text-white/70">preview</span>
      </div>
    </>
  );
}

function readMeta(file: File): Promise<string> {
  return new Promise((resolve) => {
    const mb = `${(file.size / 1024 / 1024).toFixed(0)} MB`;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const secs = Math.round(v.duration || 0);
      const dur = secs
        ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} · `
        : "";
      const dims = v.videoWidth ? `${v.videoWidth}×${v.videoHeight} · ` : "";
      URL.revokeObjectURL(v.src);
      resolve(`${dur}${dims}${mb}`);
    };
    v.onerror = () => resolve(mb);
    v.src = URL.createObjectURL(file);
  });
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [style, setStyle] = useState("default");
  const [lang, setLang] = useState("en");
  const [maxChars, setMaxChars] = useState(42);
  const [soft, setSoft] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPoll, [stopPoll]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const busy = phase === "uploading" || phase === "processing";
  const { pct, label: stageLabel } = useMemo(() => stageOf(log), [log]);
  const cues = useMemo(() => parseCues(log), [log]);
  const configLine = useMemo(
    () => log.find((l) => l.startsWith("Captions:")) ?? null,
    [log],
  );
  const words = useMemo(() => sampleWords(style), [style]);

  const pick = useCallback(async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPhase("idle");
    setError(null);
    setLog([]);
    setJobId(null);
    setMeta(`${(f.size / 1024 / 1024).toFixed(0)} MB`);
    setPreviewUrl(URL.createObjectURL(f));
    setMeta(await readMeta(f));
  }, []);

  function reset() {
    stopPoll();
    setFile(null);
    setMeta("");
    setPreviewUrl(null);
    setPhase("idle");
    setLog([]);
    setError(null);
    setJobId(null);
  }

  async function submit() {
    if (!file || busy) return;
    setPhase("uploading");
    setError(null);
    setLog([]);
    setJobId(null);

    const body = new FormData();
    body.set("video", file);
    body.set("style", style);
    body.set("language", lang);
    body.set("soft", String(soft));
    body.set("maxSegmentLen", String(maxChars));

    let id: string;
    try {
      const res = await fetch("/api/caption", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `upload failed (${res.status})`);
      id = data.id;
    } catch (e) {
      setPhase("error");
      setError((e as Error).message);
      return;
    }

    setJobId(id);
    setPhase("processing");
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/caption/status?id=${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "status check failed");
        setLog(data.log ?? []);
        if (data.status === "done") {
          stopPoll();
          setPhase("done");
        } else if (data.status === "error") {
          stopPoll();
          setPhase("error");
          setError(data.error ?? "captioning failed");
        }
      } catch (e) {
        stopPoll();
        setPhase("error");
        setError((e as Error).message);
      }
    }, 1000);
  }

  const ctaLabel =
    phase === "uploading"
      ? "Uploading…"
      : phase === "processing"
        ? "Adding captions…"
        : phase === "done"
          ? "Start another video"
          : "Add captions";

  const ctaHint =
    !file && phase !== "done"
      ? "Add a video to get started."
      : busy
        ? "Working on it — keep this tab open."
        : phase === "done"
          ? "Saved to webapp/.data."
          : "About a minute for a short clip.";

  const capturedNote =
    phase === "done"
      ? "Rendered output"
      : phase === "uploading"
        ? "Uploading…"
        : busy
          ? stageLabel
          : "Runs when you add captions";

  return (
    <>
      <header className="flex items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--surface-2)] px-6 py-[18px] sm:px-10">
        <div className="flex items-center gap-[11px]">
          <div className="grid size-[30px] place-items-center rounded-[9px] bg-[var(--accent)]">
            <div className="h-[3px] w-[13px] rounded-[2px] bg-white shadow-[0_5px_0_rgba(255,255,255,0.55)]" />
          </div>
          <span className="text-[16px] font-bold tracking-[-0.01em]">auto-captions</span>
        </div>
        <span className="hidden text-[13px] text-[var(--muted)] sm:block">
          runs locally · whisper.cpp + ffmpeg
        </span>
      </header>

      <main
        className={`mx-auto grid w-full max-w-[1200px] grid-cols-1 items-start gap-10 px-5 py-10 lg:gap-[44px] lg:px-10 lg:pb-[72px] ${
          file ? "lg:grid-cols-[0.82fr_1.18fr]" : "lg:grid-cols-[1.02fr_0.98fr]"
        }`}
      >
        {/* ---- left: the form -------------------------------------------- */}
        <div className="flex flex-col gap-7">
          <div>
            <h1 className="m-0 mb-2 text-[30px] font-extrabold tracking-[-0.025em]">
              Add captions to your video
            </h1>
            <p className="m-0 max-w-[46ch] text-[15.5px] leading-[1.55] text-pretty text-[var(--muted)]">
              Upload a clip, pick how the captions should look, and get it back
              ready to post. A short clip takes about a minute.
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />

          {/* step 1 */}
          <section className="card">
            <div className="mb-[14px] flex items-center gap-[10px]">
              <span className="step-num">1</span>
              <h2 className="m-0 text-[16px] font-bold">Your video</h2>
            </div>

            {!file ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`cursor-pointer rounded-[13px] border-2 border-dashed px-6 py-[34px] text-center transition-colors ${
                  dragging
                    ? "border-[var(--accent)] bg-[var(--accent-ring)]"
                    : "border-[var(--border-strong)] bg-[var(--surface-3)] hover:border-[var(--accent)]"
                }`}
              >
                <div className="mx-auto mb-3 grid size-[46px] place-items-center rounded-[14px] bg-[oklch(0.93_0.03_265)]">
                  <div className="ml-1 size-0 border-y-8 border-l-[13px] border-y-transparent border-l-[var(--accent)]" />
                </div>
                <div className="mb-[5px] text-[15.5px] font-semibold">
                  Drag a video here, or click to browse
                </div>
                <div className="text-[13px] text-[var(--muted-2)]">
                  MP4, MOV or WebM · up to 500 MB
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-[14px] rounded-[13px] border border-[var(--border)] bg-[var(--surface-3)] px-[14px] py-[13px]">
                <div className="grid h-10 w-[54px] flex-none place-items-center rounded-[7px] bg-[oklch(0.28_0.02_265)]">
                  <div className="ml-[3px] size-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-white/90" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold">{file.name}</div>
                  <div className="mt-[2px] text-[12.5px] text-[var(--muted-2)]">{meta}</div>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  Replace
                </button>
              </div>
            )}
          </section>

          {/* step 2 */}
          <section className="card">
            <div className="mb-1 flex items-center gap-[10px]">
              <span className="step-num">2</span>
              <h2 className="m-0 text-[16px] font-bold">Caption look</h2>
            </div>
            <p className="mt-0 mb-4 ml-8 text-[13.5px] text-[var(--muted-2)]">
              Tap one to preview it →
            </p>
            <div className="grid grid-cols-2 gap-3">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="opt p-[11px]"
                  data-on={style === s.value}
                  disabled={busy}
                  onClick={() => setStyle(s.value)}
                >
                  <div className="grid h-[62px] place-items-end justify-center overflow-hidden rounded-[9px] bg-[oklch(0.3_0.015_265)] pb-[9px]">
                    <StyleSample value={s.value} text={s.sample} />
                  </div>
                  <div className="mt-[10px] text-[14px] font-[650]">{s.name}</div>
                  <div className="mt-[2px] text-[12.5px] text-[var(--muted-2)]">{s.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {/* step 3 */}
          <section className="card">
            <div className="mb-[18px] flex flex-wrap items-center gap-[10px]">
              <span className="step-num">3</span>
              <h2 className="m-0 text-[16px] font-bold">Details</h2>
              <span className="text-[12.5px] text-[var(--muted-2)]">— the defaults are fine</span>
            </div>

            <div className="mb-[22px] grid grid-cols-1 gap-[22px] sm:grid-cols-2">
              <div>
                <label className="mb-[7px] block text-[13.5px] font-semibold" htmlFor="lang">
                  Spoken language
                </label>
                <select
                  id="lang"
                  className="field"
                  value={lang}
                  disabled={busy}
                  onChange={(e) => setLang(e.target.value)}
                >
                  {LANGS.map(([name, code]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
                <div className="mt-[7px] text-[12.5px] text-[var(--muted-2)]">
                  The bundled model is English-only — other options need a matching
                  model in <code className="font-mono">server/models</code>.
                </div>
              </div>
              <div>
                <label className="mb-[7px] block text-[13.5px] font-semibold" htmlFor="chars">
                  Line length
                </label>
                <input
                  id="chars"
                  type="range"
                  min={24}
                  max={60}
                  step={2}
                  value={maxChars}
                  disabled={busy || style === "karaoke"}
                  onChange={(e) => setMaxChars(Number(e.target.value))}
                  className="mt-3 mb-[6px]"
                />
                <div className="flex justify-between text-[12.5px] text-[var(--muted-2)]">
                  <span>Short lines</span>
                  <span>Long lines</span>
                </div>
                <div className="mt-[6px] text-[12.5px] text-[var(--muted-2)]">
                  {style === "karaoke"
                    ? "Karaoke sets its own phrase length"
                    : `About ${maxChars} characters per line`}
                </div>
              </div>
            </div>

            <div className="grid gap-[10px]">
              {[
                {
                  key: "burn",
                  on: !soft,
                  set: () => setSoft(false),
                  title: "Burn captions into the video",
                  rec: true,
                  desc: "Everyone sees them, everywhere. Best for social.",
                },
                {
                  key: "soft",
                  on: soft,
                  set: () => setSoft(true),
                  title: "Keep them as a separate track",
                  rec: false,
                  desc: "Viewers turn them on themselves. Faster, no re-encode.",
                },
              ].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="opt flex items-start gap-3 px-[14px] py-[13px]"
                  data-on={o.on}
                  disabled={busy}
                  onClick={o.set}
                >
                  <span
                    className="mt-[1px] grid size-[17px] flex-none place-items-center rounded-full border-2"
                    style={{ borderColor: o.on ? "var(--accent)" : "var(--border-hover)" }}
                  >
                    <span
                      className="size-[8px] rounded-full bg-[var(--accent)]"
                      style={{ opacity: o.on ? 1 : 0 }}
                    />
                  </span>
                  <span>
                    <span className="text-[14.5px] font-[650]">
                      {o.title}
                      {o.rec && (
                        <span className="ml-[6px] rounded-[5px] bg-[var(--good-bg)] px-[6px] py-[2px] text-[12px] font-semibold text-[var(--good)]">
                          Recommended
                        </span>
                      )}
                    </span>
                    <span className="mt-[3px] block text-[13px] text-[var(--muted-2)]">
                      {o.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="cta"
              disabled={(!file && phase !== "done") || busy}
              onClick={() => (phase === "done" ? reset() : submit())}
            >
              {ctaLabel}
            </button>
            <div className="max-w-[18ch] text-[13px] leading-[1.4] text-[var(--muted-2)]">
              {ctaHint}
            </div>
          </div>
        </div>

        {/* ---- right: preview(s) + status ------------------------------ */}
        <div className={`flex flex-col gap-4 ${file ? "" : "lg:sticky lg:top-8"}`}>
          {!file ? (
            <PreviewShell label="Preview" note="Sample frame">
              <svg width="100%" height="100%" className="absolute inset-0" aria-hidden>
                <defs>
                  <pattern
                    id="stripe"
                    width="14"
                    height="14"
                    patternTransform="rotate(45)"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width="14" height="14" fill="oklch(0.3 0.015 265)" />
                    <rect width="7" height="14" fill="oklch(0.33 0.015 265)" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#stripe)" />
              </svg>
              <SampleOverlay words={words} tag="sample frame" />
            </PreviewShell>
          ) : (
            <>
              <PreviewShell label="Your clip" note="Sample caption overlay">
                {previewUrl && (
                  <video
                    src={previewUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    className="absolute inset-0 size-full object-cover opacity-95"
                  />
                )}
                <SampleOverlay words={words} tag="your video" />
              </PreviewShell>

              <PreviewShell label="With captions" note={capturedNote}>
                {phase === "done" && jobId ? (
                  <video
                    key={jobId}
                    src={`/api/caption/file?id=${jobId}`}
                    controls
                    playsInline
                    className="absolute inset-0 size-full bg-black object-contain"
                  />
                ) : busy ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                    <span className="block size-6 animate-[spin_0.8s_linear_infinite] rounded-full border-2 border-white/25 border-t-white" />
                    <span className="text-[13px] font-semibold text-white/90">
                      {phase === "uploading" ? "Uploading…" : stageLabel}
                    </span>
                    <div className="h-[4px] w-40 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
                        style={{ width: `${phase === "uploading" ? 6 : pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
                    <div className="ml-1 size-0 border-y-[9px] border-l-[15px] border-y-transparent border-l-white/70" />
                    <span className="text-[13px] text-white/70">
                      Hit “{ctaLabel}” to render this
                    </span>
                  </div>
                )}
              </PreviewShell>
            </>
          )}

          {busy && (
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-[18px]">
              <div className="text-[12.5px] text-[var(--muted-2)]">
                Keep this tab open — it runs on your machine.
              </div>
              {log.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--muted)]">
                    Show log
                  </summary>
                  <pre
                    ref={logRef}
                    className="mt-2 max-h-40 overflow-y-auto rounded-[10px] bg-[oklch(0.97_0.005_85)] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--muted)]"
                  >
                    {log.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="rounded-[16px] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-[18px]">
              <div className="text-[15px] font-bold">That didn’t work</div>
              <div className="mt-1 text-[13.5px] text-[var(--muted)]">{error}</div>
              {log.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--muted)]">
                    Show log
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-y-auto rounded-[10px] bg-white/60 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--muted)]">
                    {log.join("\n")}
                  </pre>
                </details>
              )}
              <button type="button" className="btn mt-3" onClick={reset}>
                Start over
              </button>
            </div>
          )}

          {phase === "done" && (
            <div className="rounded-[16px] border border-[var(--good-border)] bg-[var(--good-bg)] p-[18px]">
              <div className="text-[15px] font-bold">
                Captions are on{cues ? `. ${cues}` : ""}.
              </div>
              <div className="mt-1 mb-[14px] text-[13.5px] text-[var(--good-deep)]">
                Give it a quick scan — names and numbers are worth checking.
              </div>
              <div className="flex flex-wrap gap-[9px]">
                <a
                  className="btn btn-good"
                  href={`/api/caption/file?id=${jobId}&download=1`}
                  download
                >
                  Download video
                </a>
                <button type="button" className="btn" onClick={reset}>
                  Start another
                </button>
              </div>
              {configLine && (
                <div className="mt-3 font-mono text-[11px] text-[var(--good-deep)]">
                  {configLine}
                </div>
              )}
            </div>
          )}

          {phase === "idle" && !file && (
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-3)] p-[18px]">
              <div className="eyebrow mb-3">What you’ll get back</div>
              <div className="grid gap-[9px] text-[13.5px] text-[var(--muted)]">
                {[
                  "Your video with captions burned in, or a toggleable track",
                  "Playable right here in the browser",
                  "A download saved to webapp/.data",
                ].map((t) => (
                  <div key={t} className="flex items-baseline gap-[9px]">
                    <span className="font-bold text-[var(--good)]">•</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
