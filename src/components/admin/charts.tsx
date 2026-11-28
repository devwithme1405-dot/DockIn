"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "../ui";

/** Small, dependency-free charts for DockIn Admin, drawn in the app's own colours. */

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId().replace(/:/g, "");
  const w = 120;
  const h = 34;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("h-9 w-full", className)} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--orange)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--orange)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {values.length > 1 && (
        <>
          <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** A day-by-day area chart with a crosshair and tooltip. */
export function AreaChart({
  series,
  labels,
  height = 220,
}: {
  series: { name: string; values: number[]; color: string }[];
  labels: string[];
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the real width, so the axis text is never stretched on a phone.
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);
      if (width > 0) setW(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = height;
  const pad = { l: 34, r: 10, t: 12, b: 26 };
  const n = labels.length;
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / nice) * (h - pad.t - pad.b);
  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height }}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * w;
          const i = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={series.map((s) => s.name).join(", ")}
      >
        <defs>
          {series.map((s, k) => (
            <linearGradient key={s.name} id={`${id}-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 1, 2, 3, 4].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={w - pad.r} y1={y((nice / 4) * g)} y2={y((nice / 4) * g)} stroke="var(--line)" strokeDasharray={g ? "3 4" : undefined} vectorEffect="non-scaling-stroke" />
            <text x={pad.l - 6} y={y((nice / 4) * g) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {(nice / 4) * g}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % (w < 480 ? 10 : 7) === (n - 1) % (w < 480 ? 10 : 7) ? (
            <text key={l} x={x(i)} y={h - 6} textAnchor={i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s, k) => {
          const line = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
          return (
            <g key={s.name}>
              <path d={`${line} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={`url(#${id}-${k})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} stroke="var(--muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill="var(--card)" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-xl border border-line bg-card px-3 py-2 text-[12px] shadow-lg"
          style={{ left: `clamp(0px, calc(${(x(hover) / w) * 100}% - 64px), calc(100% - 140px))` }}
        >
          <p className="mb-1 font-bold">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="font-bold tabular-nums">{s.values[hover] ?? 0}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with a label, a value and its share. */
export function BarList({ items, total, color = "var(--accent)" }: { items: { label: string; value: number; hint?: string }[]; total?: number; color?: string }) {
  const max = Math.max(1, total ?? Math.max(...items.map((i) => i.value)));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-semibold">{it.label}</span>
            <span className="shrink-0 tabular-nums">
              <b>{it.value}</b>
              {total !== undefined && <span className="ml-1.5 text-muted">{Math.round((it.value / Math.max(1, total)) * 100)}%</span>}
              {it.hint && <span className="ml-1.5 text-muted">{it.hint}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A ring split into parts (platforms, versions). */
export function Donut({ parts, size = 132, label }: { parts: { label: string; value: number; color: string }[]; size?: number; label?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="16"
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-off}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            off += len;
            return el;
          })}
        <text x="50%" y="48%" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text)">
          {total}
        </text>
        <text x="50%" y="62%" textAnchor="middle" fontSize="11" fill="var(--muted)">
          {label ?? "total"}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <b className="tabular-nums">{p.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Setup funnel: each step as a share of everyone. */
/** A weekly retention grid: each row a signup week, each cell the % still active N weeks later. */
export function CohortGrid({ rows, labelOf }: { rows: { week: string; size: number; active: (number | null)[] }[]; labelOf: (week: string) => string }) {
  const cols = Math.max(1, ...rows.map((r) => r.active.length));
  const shade = (pct: number) => {
    const a = 0.1 + (pct / 100) * 0.9;
    return `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)`;
  };
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-separate border-spacing-1 text-center text-[11.5px]">
        <thead>
          <tr className="text-muted">
            <th className="px-1 py-1 text-left font-semibold">Joined</th>
            <th className="px-1 py-1 font-semibold">Size</th>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i} className="px-1 py-1 font-semibold">
                W{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.week}>
              <td className="px-1 py-1 text-left font-semibold whitespace-nowrap">{labelOf(r.week)}</td>
              <td className="px-1 py-1 tabular-nums text-muted">{r.size}</td>
              {Array.from({ length: cols }, (_, i) => {
                const v = r.active[i];
                if (v === null || v === undefined) return <td key={i} className="px-1 py-1" />;
                const pct = r.size > 0 ? Math.round((v / r.size) * 100) : 0;
                return (
                  <td
                    key={i}
                    title={`${v} of ${r.size} active in week ${i}`}
                    className="rounded-md px-1 py-1.5 font-bold tabular-nums"
                    style={{ background: shade(pct), color: pct > 55 ? "var(--on-ink)" : "var(--text)" }}
                  >
                    {pct}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A tiny 14-day bar strip for a single feature. */
export function MiniBars({ values, color = "var(--accent)" }: { values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-8 items-end gap-0.5">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: v ? color : "var(--surface-2)", opacity: v ? 1 : 0.6 }} title={`${v}`} />
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / top) * 100);
        const drop = i > 0 ? (steps[i - 1].value || 0) - s.value : 0;
        return (
          <li key={s.label} className="relative overflow-hidden rounded-xl border border-line bg-surface">
            <div className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-700" style={{ width: `${pct}%` }} />
            <div className="relative flex items-center gap-3 px-3.5 py-2.5 text-[13.5px]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-card text-[11px] font-bold text-accent">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{s.label}</span>
              {drop > 0 && <span className="text-[12px] text-danger">−{drop}</span>}
              <b className="tabular-nums">{s.value}</b>
              <span className="w-10 text-right text-[12px] text-muted tabular-nums">{pct}%</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
