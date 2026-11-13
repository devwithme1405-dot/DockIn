"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, QrCode, ScanLine, Sparkles, UtensilsCrossed } from "lucide-react";
import { BackHeader } from "@/components/PageHeader";
import { getProfile, saveProfile } from "@/lib/repo";
import { MEALS, type Meal, currentMeal, dayHasFood, menuForDay } from "@/lib/mess";
import { useCollege } from "@/lib/college";
import type { CamuMeal } from "@/lib/native";
import type { MessDay } from "@/lib/types";
import { toDateStr, fmtDayLong } from "@/lib/dates";
import { Notebook, SectionTitle } from "@/components/Paper";
import { Sheet, cx } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Split Camu's one-blob menu text into clean lines. */
function foodLines(items: string): string[] {
  return items
    .split("\n")
    .map((l) => l.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

export default function CafeteriaPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const { state } = useCollege();
  const today = toDateStr();
  const weekday = new Date().getDay();
  const nowHm = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, []);
  const active = currentMeal(nowHm);

  // Camu is the source when it is connected and has sent the cafeteria across;
  // otherwise the student's own weekly menu and pasted pass fill in.
  const caf = state.camu?.connected ? state.camu.cafeteria : undefined;
  const camuMeals = caf?.meals ?? [];
  const fromCamu = camuMeals.length > 0;

  const manualMenu = profile?.messMenu;
  const todayManual = menuForDay(manualMenu, weekday);
  const hasManual = dayHasFood(todayManual);

  const [qrSheet, setQrSheet] = useState(false);
  const [menuSheet, setMenuSheet] = useState(false);

  // The pass: Camu's live one if connected, else what the student pasted.
  const qrValue = (caf?.qr || profile?.messQr || "").trim();
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    if (!qrValue) {
      void Promise.resolve().then(() => {
        if (alive) setSvg("");
      });
      return () => {
        alive = false;
      };
    }
    QRCode.toString(qrValue, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => {
        if (alive) setSvg(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [qrValue]);

  // The pass grows as it is scrolled into view — driven straight on the node in
  // a rAF, not through React state, so it stays smooth on a mid phone.
  const qrRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = qrRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const p = Math.max(0, Math.min(1, 1 - (r.top - vh * 0.2) / (vh * 0.55)));
        el.style.transform = `scale(${(0.76 + 0.24 * p).toFixed(3)})`;
        el.style.opacity = (0.5 + 0.5 * p).toFixed(3);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [svg]);

  return (
    <div className="page-wash min-h-dvh">
      <BackHeader
        href="/"
        backLabel="Today"
        title="Cafeteria"
        right={
          fromCamu ? undefined : (
            <button
              onClick={() => setMenuSheet(true)}
              aria-label="Edit the mess menu"
              className="grid size-10 place-items-center rounded-full text-accent active:scale-95"
            >
              <Pencil size={18} />
            </button>
          )
        }
      />

      {/* ---- today's menu, up top ---- */}
      <Notebook className="mx-5 mt-1 px-4 pb-4" label="Today's mess menu">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold tracking-wide text-muted uppercase">{fmtDayLong(today)}</p>
            <p className="font-display text-[20px] font-extrabold tracking-tight">On the menu</p>
          </div>
          <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
            <UtensilsCrossed size={21} />
          </span>
        </div>
        {caf?.facility && <p className="mt-0.5 text-[12px] font-semibold text-muted">{caf.facility}</p>}

        {fromCamu ? (
          <ul className="mt-3 space-y-2.5">
            {camuMeals.map((m, i) => (
              <CamuMealRow key={i} meal={m} active={active} />
            ))}
          </ul>
        ) : hasManual ? (
          <ul className="mt-3 space-y-2.5">
            {MEALS.map(({ key, label, from, icon }) => {
              const text = todayManual[key];
              const isNow = key === active;
              return (
                <li
                  key={key}
                  className={cx(
                    "rounded-2xl border-[1.5px] px-3.5 py-3 transition",
                    isNow ? "border-accent/50 bg-accent-soft/60" : "border-card-edge bg-card",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[15px]">{icon}</span>
                    <span className="text-[13px] font-extrabold">{label}</span>
                    <span className="text-[11.5px] font-semibold text-muted tnum">{from}</span>
                    {isNow && (
                      <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                        now
                      </span>
                    )}
                  </div>
                  <p className={cx("mt-1 text-[14px] leading-snug", text ? "text-text" : "text-muted")}>{text || "—"}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <button
            onClick={() => setMenuSheet(true)}
            className="btn-paper mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-bold"
          >
            <Sparkles size={17} className="text-accent" /> Set up this week&rsquo;s menu
          </button>
        )}
      </Notebook>

      <SectionTitle className="mt-8 flex items-center gap-1.5">
        <ScanLine size={15} className="text-muted" /> Your mess pass
      </SectionTitle>
      <p className="mx-5 -mt-1 text-[12.5px] text-muted">Scroll down and show this at the counter.</p>

      {/* ---- the pass, growing as you reach it ---- */}
      <div className="grid min-h-[78vh] place-items-center px-5 pt-6 pb-24">
        {qrValue ? (
          <div className="flex flex-col items-center">
            <div
              ref={qrRef}
              className="will-change-transform rounded-[28px] bg-white p-5 shadow-[0_18px_40px_-12px_rgb(var(--shadow-ink)/0.4)]"
              style={{ transformOrigin: "center" }}
            >
              {svg ? (
                <div
                  className="h-[248px] w-[248px] [&_svg]:h-full [&_svg]:w-full"
                  // qrcode returns a self-contained SVG; it carries no script.
                  dangerouslySetInnerHTML={{ __html: svg }}
                  aria-label="Cafeteria QR code"
                />
              ) : (
                <div className="h-[248px] w-[248px] animate-pulse rounded-2xl bg-black/5" />
              )}
            </div>
            <div className="mt-6 flex items-center gap-2 text-[12.5px] font-semibold text-muted">
              <QrCode size={15} /> {fromCamu || caf?.qr ? "Straight from MyCamu" : "Same pass every day"}
              {!caf?.qr && (
                <button onClick={() => setQrSheet(true)} className="ml-1 text-accent underline-offset-2 active:underline">
                  change
                </button>
              )}
            </div>
          </div>
        ) : (
          <Notebook rings={false} className="w-full max-w-xs px-5 py-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <QrCode size={26} />
            </span>
            <p className="mt-4 font-bold">Your pass will appear here</p>
            <p className="mt-1 text-[13px] text-muted">
              Connect Camu in Settings and your cafeteria pass comes in by itself — same as your attendance. No
              signal needed once it has.
            </p>
            <button
              onClick={() => setQrSheet(true)}
              className="btn-paper mt-5 inline-flex h-11 items-center rounded-2xl px-5 text-[13.5px] font-bold text-muted"
            >
              Or paste it manually
            </button>
          </Notebook>
        )}
      </div>

      <QrSheet open={qrSheet} onClose={() => setQrSheet(false)} value={profile?.messQr ?? ""} />
      <MenuSheet open={menuSheet} onClose={() => setMenuSheet(false)} menu={manualMenu} startDay={weekday} />
    </div>
  );
}

/** One meal straight from Camu: its label with timing, then the food. */
function CamuMealRow({ meal, active }: { meal: CamuMeal; active: Meal }) {
  const isNow = meal.meal.toLowerCase().startsWith(active.slice(0, 4));
  const lines = foodLines(meal.items);
  return (
    <li
      className={cx(
        "rounded-2xl border-[1.5px] px-3.5 py-3 transition",
        isNow ? "border-accent/50 bg-accent-soft/60" : "border-card-edge bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-extrabold">{meal.label || meal.meal}</span>
        {isNow && (
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">now</span>
        )}
      </div>
      {lines.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {lines.map((l, i) => (
            <li key={i} className="text-[13.5px] leading-snug text-text">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13.5px] text-muted">Not published yet</p>
      )}
    </li>
  );
}

/** Paste (or edit) the pass the QR reads out — the manual fallback. */
function QrSheet({ open, onClose, value }: { open: boolean; onClose: () => void; value: string }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => setText(value));
  }, [open, value]);
  return (
    <Sheet open={open} onClose={onClose} title="Your mess pass">
      <p className="mb-3 text-[13.5px] text-muted">
        If Camu is connected this fills in by itself. To set it by hand, scan the cafeteria QR in MyCamu and paste
        exactly what it reads.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the scanned text"
        className="w-full rounded-2xl border-[1.5px] border-card-edge bg-card px-4 py-3 text-[15px] outline-none focus:border-accent"
      />
      <div className="mt-4 flex gap-2.5">
        <button onClick={onClose} className="btn-paper h-12 flex-1 rounded-2xl text-[15px] font-bold">
          Cancel
        </button>
        <button
          onClick={async () => {
            await saveProfile({ messQr: text.trim() });
            onClose();
          }}
          className="btn-leather h-12 flex-1 rounded-2xl text-[15px] font-bold"
        >
          Save pass
        </button>
      </div>
    </Sheet>
  );
}

/** Fill the week once; the screen shows the right day by itself. (Manual mode.) */
function MenuSheet({
  open,
  onClose,
  menu,
  startDay,
}: {
  open: boolean;
  onClose: () => void;
  menu: Record<number, MessDay> | undefined;
  startDay: number;
}) {
  const [draft, setDraft] = useState<Record<number, MessDay>>({});
  const [day, setDay] = useState(startDay);
  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => {
      setDraft(menu ? structuredClone(menu) : {});
      setDay(startDay);
    });
  }, [open, menu, startDay]);

  const d = draft[day] ?? {};
  const set = (meal: Meal, v: string) => setDraft((prev) => ({ ...prev, [day]: { ...(prev[day] ?? {}), [meal]: v } }));

  return (
    <Sheet open={open} onClose={onClose} title="Weekly mess menu">
      <p className="mb-3 text-[13px] text-muted">Fill it once. Each day shows on its own — no daily typing.</p>

      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
        {DAYS.map((label, i) => (
          <button
            key={i}
            onClick={() => setDay(i)}
            className={cx(
              "shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition",
              i === day ? "bg-accent text-on-accent" : "bg-card text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {MEALS.map(({ key, label, icon }) => (
          <label key={key} className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-muted">
              <span>{icon}</span> {label}
            </span>
            <input
              value={d[key] ?? ""}
              onChange={(e) => set(key, e.target.value)}
              placeholder="e.g. Poha, Tea"
              className="w-full rounded-xl border-[1.5px] border-card-edge bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>

      <button
        onClick={() => setDraft((prev) => fillWeekFrom(prev, day))}
        className="btn-paper mt-3 w-full rounded-2xl py-2.5 text-[13px] font-bold text-muted"
      >
        Copy this day to the whole week
      </button>

      <div className="mt-4 flex gap-2.5">
        <button onClick={onClose} className="btn-paper h-12 flex-1 rounded-2xl text-[15px] font-bold">
          Cancel
        </button>
        <button
          onClick={async () => {
            await saveProfile({ messMenu: draft });
            onClose();
          }}
          className="btn-leather h-12 flex-1 rounded-2xl text-[15px] font-bold"
        >
          Save menu
        </button>
      </div>
    </Sheet>
  );
}

function fillWeekFrom(menu: Record<number, MessDay>, day: number): Record<number, MessDay> {
  const src = menu[day] ?? {};
  const out: Record<number, MessDay> = {};
  for (let i = 0; i < 7; i++) out[i] = { ...src };
  return out;
}
