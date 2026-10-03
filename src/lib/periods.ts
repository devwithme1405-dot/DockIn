/**
 * A college day is a fixed grid of periods, not arbitrary times: the first one
 * starts at a set hour and the rest follow at a steady pitch. Working in periods
 * rather than clock times is what turns "set up my week" from typing forty times
 * into tapping a grid, and it is why a practical can be "two periods" instead of
 * two separate entries.
 *
 * The grid is a setting rather than a constant, so a college whose day starts at
 * nine, or runs fifty-minute periods, works without a code change.
 */

import type { Slot } from "./types";
import { fmtTime, toMinutes } from "./dates";

export interface PeriodGrid {
  /** When the first period starts, "HH:MM". */
  start: string;
  /** Minutes one period runs for. */
  length: number;
  /** Minutes between the end of one period and the start of the next. */
  gap: number;
  /** How many periods the day has. */
  count: number;
}

/**
 * Bennett's day: 8:20, 9:25, 10:30 … a sixty-minute period every sixty-five
 * minutes, nine of them. Anyone else edits this once in Settings.
 */
export const DEFAULT_GRID: PeriodGrid = { start: "08:20", length: 60, gap: 5, count: 9 };

/** A practical usually runs back-to-back periods; four is the longest seen. */
export const MAX_SPAN = 4;

export interface Period {
  /** 1-based, the way a timetable prints it. */
  n: number;
  start: string;
  end: string;
  /** "8:20 – 9:20" */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toHM = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;

export function sanitiseGrid(g: Partial<PeriodGrid> | undefined): PeriodGrid {
  const start = /^\d{2}:\d{2}$/.test(g?.start ?? "") ? g!.start! : DEFAULT_GRID.start;
  const clamp = (v: number | undefined, lo: number, hi: number, fallback: number) =>
    Number.isFinite(v) && (v as number) >= lo && (v as number) <= hi ? Math.round(v as number) : fallback;
  return {
    start,
    length: clamp(g?.length, 20, 180, DEFAULT_GRID.length),
    gap: clamp(g?.gap, 0, 60, DEFAULT_GRID.gap),
    count: clamp(g?.count, 1, 14, DEFAULT_GRID.count),
  };
}

/** Every period of the day, in order. */
export function periodsOf(grid: PeriodGrid): Period[] {
  const g = sanitiseGrid(grid);
  const first = toMinutes(g.start);
  const pitch = g.length + g.gap;
  return Array.from({ length: g.count }, (_, i) => {
    const start = toHM(first + i * pitch);
    const end = toHM(first + i * pitch + g.length);
    return { n: i + 1, start, end, label: `${fmtTime(start)} – ${fmtTime(end)}` };
  });
}

/** Where a class sits when it covers `span` periods starting at period `n`. */
export function spanTimes(grid: PeriodGrid, n: number, span: number): { start: string; end: string } {
  const list = periodsOf(grid);
  const from = list[Math.min(Math.max(n, 1), list.length) - 1];
  const to = list[Math.min(n - 1 + Math.max(1, span), list.length) - 1];
  return { start: from.start, end: to.end };
}

/** How many periods are left in the day from `n`, so a span can never run off the end. */
export function roomAfter(grid: PeriodGrid, n: number): number {
  return Math.max(1, Math.min(MAX_SPAN, sanitiseGrid(grid).count - n + 1));
}

/** Which period a time belongs to, or null when it is off the grid. */
export function periodAt(grid: PeriodGrid, start: string): number | null {
  const found = periodsOf(grid).find((p) => p.start === start);
  if (found) return found.n;
  // Tolerate a few minutes of drift, so a timetable typed by hand still lines up.
  const mins = toMinutes(start);
  const near = periodsOf(grid).find((p) => Math.abs(toMinutes(p.start) - mins) <= 7);
  return near?.n ?? null;
}

/** How many periods a class covers, rounded to the nearest whole one. */
export function spanOf(grid: PeriodGrid, start: string, end: string): number {
  const g = sanitiseGrid(grid);
  const pitch = g.length + g.gap;
  const mins = Math.max(1, toMinutes(end) - toMinutes(start));
  return Math.min(MAX_SPAN, Math.max(1, Math.round((mins + g.gap) / pitch)));
}

/**
 * Work out the grid someone's existing classes were built on, so the wizard
 * opens with their real day rather than a guess. Falls back to the default when
 * there is not enough to go on.
 */
export function inferGrid(slots: Pick<Slot, "start" | "end">[]): PeriodGrid {
  const starts = [...new Set(slots.map((s) => s.start))].map(toMinutes).sort((a, b) => a - b);
  if (starts.length < 2) return DEFAULT_GRID;

  const commonest = (xs: number[]): number | null => {
    const tally = new Map<number, number>();
    for (const x of xs) tally.set(x, (tally.get(x) ?? 0) + 1);
    let best: number | null = null;
    let bestN = 0;
    for (const [v, n] of tally) if (n > bestN || (n === bestN && best !== null && v < best)) [best, bestN] = [v, n];
    return best;
  };

  // The pitch is the usual gap between one class starting and the next.
  const diffs: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const d = starts[i] - starts[i - 1];
    if (d > 0 && d <= 180) diffs.push(d);
  }
  const pitch = commonest(diffs);

  // A single-period class is the shortest one on the timetable.
  const lengths = slots.map((s) => Math.max(1, toMinutes(s.end) - toMinutes(s.start)));
  const length = Math.min(...lengths);

  if (!pitch || pitch <= length) return { ...DEFAULT_GRID, start: toHM(starts[0]) };

  const first = starts[0];
  const last = Math.max(...slots.map((s) => toMinutes(s.end)));
  return sanitiseGrid({
    start: toHM(first),
    length,
    gap: pitch - length,
    count: Math.ceil((last - first) / pitch),
  });
}
