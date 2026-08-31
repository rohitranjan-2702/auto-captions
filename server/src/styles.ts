/**
 * Caption styling presets and the ASS subtitle writer.
 *
 * We build the .ass file ourselves (rather than letting ffmpeg convert SRT) so
 * every visual knob — font, colours, outline, position, line wrapping — is under
 * our control.
 *
 * Presets are defined as *scale factors*, not pixels. At render time we probe the
 * real video dimensions, set the .ass canvas (PlayRes) to match 1:1, and derive
 * concrete font size / margins / wrap width from the video's size and
 * orientation. This keeps captions readable and inside the frame whether the clip
 * is 1920x1080, a 1080x1920 vertical reel, or a 1080x1080 square.
 */

import type { Orientation, VideoInfo } from "./probe.js";

export interface CaptionCue {
  /** start time in seconds */
  start: number;
  /** end time in seconds */
  end: number;
  /** transcript text for this cue (single line; we wrap it) */
  text: string;
}

/** How captions are laid out on screen. */
export type CaptionMode = "block" | "karaoke";

export interface CaptionStyle {
  /** font family name as known to fontconfig / the OS */
  fontName: string;
  /** primary fill colour, "#RRGGBB" */
  primaryColor: string;
  /** outline (border) colour, "#RRGGBB" */
  outlineColor: string;
  /** shadow colour, "#RRGGBB" */
  shadowColor: string;
  /** bold text */
  bold: boolean;
  /** true = ALL CAPS */
  uppercase: boolean;

  /** font height as a fraction of the video's short side */
  fontScale: number;
  /** outline thickness as a fraction of the font size */
  outlineScale: number;
  /** shadow depth as a fraction of the font size */
  shadowScale: number;
  /** left/right safe-area margin as a fraction of video width */
  marginLRScale: number;
  /** bottom margin as a fraction of video height, landscape/square */
  marginVScale: number;
  /** bottom margin as a fraction of video height, portrait (lifts clear of UI) */
  marginVScalePortrait: number;

  /**
   * Mean glyph advance ÷ font size for this font. Used to estimate how many
   * characters fit on a line. Wider display faces need a bigger value.
   */
  glyphAspect: number;
  /** never wrap wider than this many characters, however large the frame */
  maxCharsCap: number;
  /** max lines on screen at once (overflow is merged into the last line) */
  maxLines: number;

  /**
   * "block" (default) burns whole caption cues. "karaoke" shows one short phrase
   * at a time, sweeping a highlight colour across each word as it's spoken
   * (needs word-level timestamps from whisper).
   */
  mode: CaptionMode;
  /** karaoke: colour of a word once the highlight has reached it, "#RRGGBB" */
  spokenColor: string;
  /** karaoke: colour of a word the highlight hasn't reached yet, "#RRGGBB" */
  unspokenColor: string;
  /** karaoke: most words to show on screen at once before starting a new phrase */
  karaokeMaxWords: number;
  /** karaoke: a silence longer than this (seconds) forces a new phrase */
  karaokeMaxGap: number;
}

export type StylePresetName = "default" | "bold" | "minimal" | "karaoke";

const BASE: CaptionStyle = {
  fontName: "Helvetica",
  primaryColor: "#FFFFFF",
  outlineColor: "#000000",
  shadowColor: "#000000",
  bold: true,
  uppercase: false,
  fontScale: 0.05,
  outlineScale: 0.06,
  shadowScale: 0.02,
  marginLRScale: 0.07,
  marginVScale: 0.08,
  marginVScalePortrait: 0.16,
  glyphAspect: 0.55,
  maxCharsCap: 36,
  maxLines: 2,
  mode: "block",
  spokenColor: "#FFE600",
  unspokenColor: "#FFFFFF",
  karaokeMaxWords: 5,
  karaokeMaxGap: 0.7,
};

export const STYLE_PRESETS: Record<StylePresetName, CaptionStyle> = {
  default: { ...BASE },
  bold: {
    ...BASE,
    fontName: "Arial Black",
    primaryColor: "#FFE600",
    uppercase: true,
    fontScale: 0.056,
    outlineScale: 0.09,
    shadowScale: 0.03,
    glyphAspect: 0.62,
    maxCharsCap: 28,
  },
  karaoke: {
    ...BASE,
    mode: "karaoke",
    fontName: "Arial Black",
    uppercase: true,
    fontScale: 0.058,
    outlineScale: 0.09,
    shadowScale: 0.03,
    glyphAspect: 0.62,
    maxCharsCap: 24,
    spokenColor: "#FFE600",
    unspokenColor: "#FFFFFF",
  },
  minimal: {
    ...BASE,
    fontName: "Helvetica Neue",
    bold: false,
    fontScale: 0.042,
    outlineScale: 0.05,
    shadowScale: 0,
    glyphAspect: 0.5,
    maxCharsCap: 42,
  },
};

/** Concrete pixel values derived from a style + a specific video. */
export interface RenderStyle {
  fontName: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  shadowColor: string;
  outline: number;
  shadow: number;
  bold: boolean;
  uppercase: boolean;
  alignment: number;
  marginLR: number;
  marginV: number;
  maxCharsPerLine: number;
  maxLines: number;
}

function marginVScaleFor(style: CaptionStyle, o: Orientation): number {
  return o === "portrait" ? style.marginVScalePortrait : style.marginVScale;
}

/** Resolve scale-factor style + video size into concrete pixel values. */
export function resolveStyle(style: CaptionStyle, video: VideoInfo): RenderStyle {
  const shortSide = Math.min(video.width, video.height);
  const fontSize = Math.round(shortSide * style.fontScale);
  const marginLR = Math.round(video.width * style.marginLRScale);
  const marginV = Math.round(video.height * marginVScaleFor(style, video.orientation));

  const usableWidth = Math.max(1, video.width - 2 * marginLR);
  const estCharWidth = fontSize * style.glyphAspect;
  const fitChars = Math.floor(usableWidth / estCharWidth);
  const maxCharsPerLine = Math.max(12, Math.min(style.maxCharsCap, fitChars));

  return {
    fontName: style.fontName,
    fontSize,
    primaryColor: style.primaryColor,
    outlineColor: style.outlineColor,
    shadowColor: style.shadowColor,
    outline: Math.max(1, Math.round(fontSize * style.outlineScale)),
    shadow: Math.round(fontSize * style.shadowScale),
    bold: style.bold,
    uppercase: style.uppercase,
    alignment: 2, // bottom-centre
    marginLR,
    marginV,
    maxCharsPerLine,
    maxLines: style.maxLines,
  };
}

/** "#RRGGBB" -> ASS "&HAABBGGRR" (alpha 00 = opaque). */
function toAssColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`invalid colour: ${hex}`);
  const rr = m[1].slice(0, 2);
  const gg = m[1].slice(2, 4);
  const bb = m[1].slice(4, 6);
  const aa = alpha.toString(16).padStart(2, "0");
  return `&H${aa}${bb}${gg}${rr}`.toUpperCase();
}

/** seconds -> ASS timestamp "H:MM:SS.cs" (centiseconds). */
function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  const cs2 = cs === 100 ? 99 : cs;
  return `${h}:${String(m).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs2).padStart(2, "0")}`;
}

/** Greedy word wrap into <= maxLines lines of <= maxChars each. */
export function wrapText(text: string, maxChars: number, maxLines: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") {
      cur = w;
    } else if ((cur + " " + w).length <= maxChars) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);

  if (lines.length <= maxLines) return lines.join("\\N");
  const head = lines.slice(0, maxLines - 1);
  const tail = lines.slice(maxLines - 1).join(" ");
  return [...head, tail].join("\\N");
}

function escapeAssText(text: string): string {
  return text.replace(/\r?\n/g, "\\N").replace(/\{/g, "(").replace(/\}/g, ")");
}

export function buildAss(cues: CaptionCue[], style: CaptionStyle, video: VideoInfo): string {
  const r = resolveStyle(style, video);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    // 0 = libass smart-wraps as a safety net; we still pre-wrap with \N.
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${video.width}`,
    `PlayResY: ${video.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    [
      "Style: Caption",
      r.fontName,
      r.fontSize,
      toAssColor(r.primaryColor),
      toAssColor(r.primaryColor),
      toAssColor(r.outlineColor),
      toAssColor(r.shadowColor),
      r.bold ? -1 : 0,
      0,
      0,
      0,
      100,
      100,
      0,
      0,
      1,
      r.outline,
      r.shadow,
      r.alignment,
      r.marginLR,
      r.marginLR,
      r.marginV,
      1,
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = cues.map((c) => {
    const raw = r.uppercase ? c.text.toUpperCase() : c.text;
    const wrapped = wrapText(raw, r.maxCharsPerLine, r.maxLines);
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,${escapeAssText(wrapped)}`;
  });

  return header + "\n" + events.join("\n") + "\n";
}

/** Split a flat list of word cues into single-line phrases for karaoke. */
function groupWords(words: CaptionCue[], maxChars: number, style: CaptionStyle): CaptionCue[][] {
  const phrases: CaptionCue[][] = [];
  let cur: CaptionCue[] = [];
  let curLen = 0;
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    const prev = cur[cur.length - 1];
    const gap = prev ? w.start - prev.end : 0;
    const nextLen = curLen === 0 ? text.length : curLen + 1 + text.length;
    if (
      cur.length > 0 &&
      (cur.length >= style.karaokeMaxWords ||
        nextLen > maxChars ||
        gap > style.karaokeMaxGap)
    ) {
      phrases.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push({ ...w, text });
    curLen = curLen === 0 ? text.length : curLen + 1 + text.length;
  }
  if (cur.length) phrases.push(cur);
  return phrases;
}

/**
 * Word-by-word ("karaoke") captions: one short phrase on screen at a time, with
 * a highlight colour sweeping across each word as it's spoken. `words` must be
 * word-level cues (whisper run with per-word timestamps).
 */
export function buildKaraokeAss(
  words: CaptionCue[],
  style: CaptionStyle,
  video: VideoInfo,
): string {
  const r = resolveStyle(style, video);
  const phrases = groupWords(words, r.maxCharsPerLine, style);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2", // phrases are pre-sized to one line; don't auto-wrap
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${video.width}`,
    `PlayResY: ${video.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    [
      "Style: Karaoke",
      r.fontName,
      r.fontSize,
      toAssColor(style.spokenColor), // fill after the sweep reaches a word
      toAssColor(style.unspokenColor), // fill before the sweep reaches it
      toAssColor(r.outlineColor),
      toAssColor(r.shadowColor),
      r.bold ? -1 : 0,
      0,
      0,
      0,
      100,
      100,
      0,
      0,
      1,
      r.outline,
      r.shadow,
      r.alignment,
      r.marginLR,
      r.marginLR,
      r.marginV,
      1,
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = phrases.map((p, pi) => {
    const start = p[0].start;
    const nextPhraseStart = phrases[pi + 1]?.[0].start ?? Infinity;
    // hold briefly past the last word, but never overlap the next phrase
    const end = Math.min(p[p.length - 1].end + 0.4, nextPhraseStart);
    const parts = p.map((w, i) => {
      const nextStart = i + 1 < p.length ? p[i + 1].start : w.end;
      const durCs = Math.max(6, Math.round((nextStart - w.start) * 100));
      const t = r.uppercase ? w.text.toUpperCase() : w.text;
      return `{\\kf${durCs}}${escapeAssText(t)}`;
    });
    const text = "{\\fad(100,80)}" + parts.join(" ");
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Karaoke,,0,0,0,,${text}`;
  });

  return header + "\n" + events.join("\n") + "\n";
}
