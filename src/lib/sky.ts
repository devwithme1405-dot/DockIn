/**
 * The sky behind the Today greeting follows the clock:
 *   ~6am   sun just peeking over the horizon
 *   morning warm, soft light
 *   12-4pm full, bright sun high in the sky
 *   4pm+   sunset colours, sun sinking
 *   7pm+   night with a moon and stars
 * Everything is interpolated between a few keyframes so it changes smoothly.
 */

type Key = { h: number; top: string; bottom: string; hill: string; cloud: string; cloudA: number };

const KEYS: Key[] = [
  { h: 0, top: "#050816", bottom: "#101a42", hill: "#04050d", cloud: "#8fa0d8", cloudA: 0.1 },
  { h: 4.5, top: "#0a1030", bottom: "#1b2a5e", hill: "#06091a", cloud: "#8fa0d8", cloudA: 0.12 },
  { h: 5.8, top: "#2f3d82", bottom: "#f0a07e", hill: "#2a2447", cloud: "#ffd2c0", cloudA: 0.45 },
  { h: 7, top: "#5a86d6", bottom: "#ffd3a1", hill: "#3b3a5a", cloud: "#fff1e0", cloudA: 0.8 },
  { h: 9, top: "#4f93ec", bottom: "#bfe0ff", hill: "#2f5273", cloud: "#ffffff", cloudA: 0.9 },
  { h: 12, top: "#1b73e8", bottom: "#72bfff", hill: "#1f5a86", cloud: "#ffffff", cloudA: 0.95 },
  { h: 15.5, top: "#2f82e4", bottom: "#9ad0ff", hill: "#2a5f88", cloud: "#ffffff", cloudA: 0.85 },
  { h: 17, top: "#4a58b8", bottom: "#ffb27a", hill: "#3d3560", cloud: "#ffd9c7", cloudA: 0.65 },
  { h: 18.3, top: "#3a2f86", bottom: "#ff7a5c", hill: "#2a2048", cloud: "#ffb9a0", cloudA: 0.5 },
  { h: 19.3, top: "#1b1c5a", bottom: "#7a3f7a", hill: "#12102a", cloud: "#b89ad0", cloudA: 0.3 },
  { h: 20.5, top: "#080d28", bottom: "#16204e", hill: "#06081a", cloud: "#8fa0d8", cloudA: 0.14 },
  { h: 24, top: "#050816", bottom: "#101a42", hill: "#04050d", cloud: "#8fa0d8", cloudA: 0.1 },
];

function hex(c: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex(rgb: number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}
function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const smooth = (t: number) => t * t * (3 - 2 * t);

export type Phase = "dawn" | "morning" | "noon" | "sunset" | "night";

export interface SkyState {
  phase: Phase;
  greeting: string;
  line: string;
  top: string;
  bottom: string;
  hill: string;
  cloud: string;
  cloudOpacity: number;
  /** percentages of the scene box */
  sun: { x: number; y: number; r: number; color: string; glow: number; visible: boolean };
  moon: { x: number; y: number; opacity: number };
  starOpacity: number;
}

export function skyAt(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(clamp((h - a.h) / (b.h - a.h)));

  // Sun arc: horizon at 6:00 and 18:30, highest at noon.
  const dayT = (h - 6) / 12.5;
  const arc = Math.sin(Math.PI * clamp(dayT));
  const sunVisible = h >= 5.4 && h <= 19.2;
  const sunY = 80 - 58 * arc;
  const sunX = 16 + 68 * clamp(dayT);
  const low = 1 - arc;
  const sunColor = mix("#ff8f4a", "#fff6c9", smooth(clamp(arc * 1.25)));
  const glow = 0.35 + 0.65 * arc;
  const r = 17 + 11 * low;

  // Moon: rises around 18:30, sets around 5:30.
  const nightT = ((h - 18.5 + 24) % 24) / 11;
  const moonUp = nightT <= 1;
  const fadeIn = clamp((h - 18.6) / 1.2);
  const fadeOut = clamp((5.8 - h) / 1.2);
  const moonOpacity = moonUp ? (h >= 12 ? fadeIn : fadeOut) : 0;
  const moonX = 86 - 72 * clamp(nightT);
  const moonY = 78 - 52 * Math.sin(Math.PI * clamp(nightT));

  let stars = 0;
  if (h < 4.5 || h >= 20.2) stars = 1;
  else if (h < 6.2) stars = 1 - (h - 4.5) / 1.7;
  else if (h >= 18.6) stars = clamp((h - 18.6) / 1.6);

  let phase: Phase;
  let greeting: string;
  let line: string;
  if (h < 5.5 || h >= 19.5) {
    phase = "night";
    greeting = h >= 19.5 && h < 21 ? "Good evening" : h >= 21 ? "Good night" : "Up late";
    line = "Wind down, you did good today.";
  } else if (h < 8.5) {
    phase = "dawn";
    greeting = "Good morning";
    line = "A fresh start. Let's make today count.";
  } else if (h < 12) {
    phase = "morning";
    greeting = "Good morning";
    line = "Plenty of day ahead.";
  } else if (h < 16) {
    phase = "noon";
    greeting = "Good afternoon";
    line = "Hope your day is going well.";
  } else {
    phase = "sunset";
    greeting = h < 17 ? "Good afternoon" : "Good evening";
    line = "Almost done for the day.";
  }

  return {
    phase,
    greeting,
    line,
    top: mix(a.top, b.top, t),
    bottom: mix(a.bottom, b.bottom, t),
    hill: mix(a.hill, b.hill, t),
    cloud: mix(a.cloud, b.cloud, t),
    cloudOpacity: a.cloudA + (b.cloudA - a.cloudA) * t,
    sun: { x: sunX, y: sunY, r, color: sunColor, glow, visible: sunVisible },
    moon: { x: moonX, y: moonY, opacity: moonOpacity },
    starOpacity: stars,
  };
}

/** Which icon sits next to the greeting. */
export function skyIcon(hour: number): "sunrise" | "sun" | "sunset" | "moon" {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 19.5 || h < 5.5) return "moon";
  if (h < 8.5) return "sunrise";
  if (h < 16) return "sun";
  return "sunset";
}
