"use client";

import { useState } from "react";
import { Calculator, Minus, Plus } from "lucide-react";
import { fmtPct } from "@/lib/attendance";
import { Chip, cx } from "@/components/ui";

export type WhatIfOption = { id: string; label: string; attended: number; total: number };

/**
 * "If I skip 2 and attend 3, where do I land?" — the bunk calculator.
 * Pure arithmetic on attended/held: (a + attend) / (t + skip + attend).
 * With several options (Overall + each subject) a chip row picks which one.
 */
export function WhatIf({
  options,
  target,
  className,
}: {
  options: WhatIfOption[];
  target: number;
  className?: string;
}) {
  const [pick, setPick] = useState(options[0]?.id ?? "");
  const [skip, setSkip] = useState(1);
  const [attend, setAttend] = useState(0);
  const opt = options.find((o) => o.id === pick) ?? options[0];
  if (!opt || opt.total <= 0) return null;

  const now = (opt.attended / opt.total) * 100;
  const held = opt.total + skip + attend;
  const after = held > 0 ? ((opt.attended + attend) / held) * 100 : now;
  const ok = after + 1e-9 >= target;
  const delta = after - now;

  return (
    <section className={cx("rounded-3xl border-[1.5px] border-card-edge bg-card p-4", className)} aria-label="Bunk calculator">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-orange/15 text-ink">
          <Calculator size={18} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-extrabold">Bunk calculator</p>
          <p className="text-[12px] text-muted">Pick how many you skip or attend</p>
        </div>
      </div>

      {options.length > 1 && (
        <div className="-mx-4 [scrollbar-width:none] mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5">
          {options.map((o) => (
            <Chip key={o.id} active={o.id === opt.id} onClick={() => setPick(o.id)}>
              {o.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <Stepper label="Skip" value={skip} onChange={setSkip} tone="text-danger" />
        <Stepper label="Attend" value={attend} onChange={setAttend} tone="text-safe" />
      </div>

      <div className="mt-3.5 flex items-end justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
        <div>
          <p className="text-[11.5px] font-semibold text-muted">
            Now <span className="tnum">{fmtPct(now)}</span> · {opt.attended}/{opt.total}
          </p>
          <p className={cx("font-display text-[28px] leading-none font-extrabold tracking-[-0.03em] tnum", ok ? "text-safe" : "text-danger")}>
            {fmtPct(after)}
          </p>
        </div>
        <p className={cx("text-right text-[12.5px] leading-snug font-semibold", ok ? "text-safe" : "text-danger")}>
          {skip === 0 && attend === 0
            ? "No change"
            : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
          <br />
          <span className="text-muted">{ok ? `Above ${target}%` : `Below ${target}%`}</span>
        </p>
      </div>
    </section>
  );
}

function Stepper({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border-[1.5px] border-card-edge/70 px-2 py-2">
      <p className="text-center text-[11.5px] font-bold text-muted">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          aria-label={`${label} one fewer`}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="btn-paper lip-sm grid size-9 place-items-center rounded-full"
        >
          <Minus size={16} />
        </button>
        <span className={cx("text-[22px] font-extrabold tnum", tone)}>{value}</span>
        <button
          type="button"
          aria-label={`${label} one more`}
          onClick={() => onChange(Math.min(60, value + 1))}
          className="btn-paper lip-sm grid size-9 place-items-center rounded-full"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
