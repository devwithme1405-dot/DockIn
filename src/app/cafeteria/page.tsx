"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, Pencil, ScanLine, Sparkles } from "lucide-react";
import { BackHeader } from "@/components/PageHeader";
import { getProfile, saveProfile } from "@/lib/repo";
import { MEALS, type Meal, currentMeal, dayHasFood, menuForDay } from "@/lib/mess";
import { useCollege, syncCollege } from "@/lib/college";
import type { CamuMeal } from "@/lib/native";
import type { MessDay } from "@/lib/types";
import { toDateStr, fmtDayLong } from "@/lib/dates";
import { Sheet, cx } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Split Camu's one-blob menu text into clean lines. */
function foodLines(items: string): string[] {
  return items
    .split("\n")
    .map((l) => l.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

/** The lid, drawn rather than shipped as an image so it stays crisp on any screen. */
function Cloche() {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0 drop-shadow-[0_4px_8px_rgba(40,20,80,0.35)]" aria-hidden>
      <circle cx="32" cy="11" r="3.4" fill="white" />
      <path d="M32 14 v4.5" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M9 45 a23 21 0 0 1 46 0 z" fill="white" fillOpacity="0.96" />
      <rect x="5" y="45" width="54" height="5" rx="2.5" fill="white" />
      <path d="M19 41 a15 13 0 0 1 17 -7" stroke="#7a63e6" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

export default function CafeteriaPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const { state } = useCollege();
  const today = toDateStr();
  const weekday = new Date().getDay();
  const nowHm = (() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();
  const active = currentMeal(nowHm);

  const caf = state.camu?.connected ? state.camu.cafeteria : undefined;
  const camuMeals = caf?.meals ?? [];
  const fromCamu = camuMeals.length > 0;

  const manualMenu = profile?.messMenu;
  const todayManual = menuForDay(manualMenu, weekday);
  const hasManual = dayHasFood(todayManual);

  const [qrSheet, setQrSheet] = useState(false);
  const [menuSheet, setMenuSheet] = useState(false);

  // Pull the cafeteria the moment it is opened when Camu is connected but the
  // menu has not arrived yet (a fresh install, or a sync older than the feature).
  const pulled = useRef(false);
  useEffect(() => {
    if (pulled.current) return;
    if (state.camu?.connected && !caf?.meals?.length) {
      pulled.current = true;
      void syncCollege();
    }
  }, [state.camu?.connected, caf?.meals?.length]);

  // The pass — Camu's live one, else the pasted fallback — drawn once.
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

  // Grows as it is scrolled into view, straight on the node in a rAF.
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
        hideLargeTitle
        right={
          fromCamu ? undefined : (
            <button
              onClick={() => setMenuSheet(true)}
              aria-label="Edit the mess menu"
              className="grid size-10 place-items-center rounded-full text-mess active:scale-95"
            >
              <Pencil size={18} />
            </button>
          )
        }
      />

      {/* hero */}
      <div className="mx-5 mt-1 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#6a3de8] to-[#9168f2] p-5 text-white shadow-[0_12px_30px_-12px_rgba(106,61,232,0.65)]">
        <div className="flex items-center gap-4">
          <Cloche />
          <div className="min-w-0">
            <p className="font-display text-[26px] leading-none font-extrabold tracking-tight">Cafeteria</p>
            <p className="mt-1.5 text-[13.5px] font-medium text-white/85">Good Food, Good Mood</p>
          </div>
        </div>
      </div>

      {/* today's menu */}
      <section className="lift mx-5 mt-4 rounded-3xl bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-2xl bg-mess-soft text-mess">
            <CalendarDays size={19} />
          </span>
          <h2 className="text-[18px] font-extrabold tracking-tight">Today&rsquo;s Menu</h2>
          <span className="ml-auto text-[13px] font-semibold text-muted">{fmtDayLong(today)}</span>
        </div>
        {caf?.facility && <p className="mt-1.5 pl-[3.1rem] text-[12.5px] font-semibold text-muted">{caf.facility}</p>}

        {fromCamu ? (
          <ul className="mt-3.5 space-y-3">
            {camuMeals.map((m, i) => (
              <CamuMealRow key={i} meal={m} active={active} />
            ))}
          </ul>
        ) : hasManual ? (
          <ul className="mt-3.5 space-y-3">
            {MEALS.map(({ key, label, from }) => (
              <MealCard
                key={key}
                title={label}
                time={from}
                now={key === active}
                lines={todayManual[key] ? [todayManual[key] as string] : []}
              />
            ))}
          </ul>
        ) : (
          <button
            onClick={() => setMenuSheet(true)}
            className="btn-paper mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-bold"
          >
            <Sparkles size={17} className="text-mess" /> Set up this week&rsquo;s menu
          </button>
        )}
      </section>

      {/* mess pass */}
      <div className="mx-5 mt-7">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-mess-soft text-mess">
            <ScanLine size={21} />
          </span>
          <div>
            <p className="text-[18px] font-extrabold tracking-tight">Mess Pass</p>
            <p className="text-[13px] text-muted">Scan this QR at the counter</p>
          </div>
        </div>

        <div className="grid min-h-[70vh] place-items-center pt-7 pb-24">
          {qrValue ? (
            <div className="flex flex-col items-center">
              <div
                ref={qrRef}
                className="relative rounded-[30px] bg-white p-6 shadow-[0_20px_44px_-14px_rgba(106,61,232,0.5)] will-change-transform"
                style={{ transformOrigin: "center" }}
              >
                {/* little corner brackets, like a scanner frame */}
                <Corner className="left-2.5 top-2.5" />
                <Corner className="right-2.5 top-2.5 rotate-90" />
                <Corner className="bottom-2.5 left-2.5 -rotate-90" />
                <Corner className="bottom-2.5 right-2.5 rotate-180" />
                {svg ? (
                  <div
                    className="h-[240px] w-[240px] [&_svg]:h-full [&_svg]:w-full"
                    // qrcode returns a self-contained SVG; it carries no script.
                    dangerouslySetInnerHTML={{ __html: svg }}
                    aria-label="Cafeteria QR code"
                  />
                ) : (
                  <div className="h-[240px] w-[240px] animate-pulse rounded-2xl bg-black/5" />
                )}
              </div>
              {!caf?.qr && (
                <button
                  onClick={() => setQrSheet(true)}
                  className="mt-6 text-[12.5px] font-semibold text-mess underline-offset-2 active:underline"
                >
                  Change pass
                </button>
              )}
            </div>
          ) : (
            <div className="lift w-full max-w-xs rounded-3xl bg-surface px-5 py-8 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-mess-soft text-mess">
                <ScanLine size={26} />
              </span>
              <p className="mt-4 font-bold">Your pass will appear here</p>
              <p className="mt-1 text-[13px] text-muted">
                Connect Camu in Settings and your cafeteria pass comes in by itself — same as your attendance.
              </p>
              <button
                onClick={() => setQrSheet(true)}
                className="btn-paper mt-5 inline-flex h-11 items-center rounded-2xl px-5 text-[13.5px] font-bold text-muted"
              >
                Or paste it manually
              </button>
            </div>
          )}
        </div>
      </div>

      <QrSheet open={qrSheet} onClose={() => setQrSheet(false)} value={profile?.messQr ?? ""} />
      <MenuSheet open={menuSheet} onClose={() => setMenuSheet(false)} menu={manualMenu} startDay={weekday} />
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cx("absolute h-5 w-5 rounded-tl-[6px] border-t-[3px] border-l-[3px] border-mess/70", className)}
    />
  );
}

/** One meal card: a tinted header with the meal and its time, then the food. */
function MealCard({ title, time, now, lines }: { title: string; time: string; now: boolean; lines: string[] }) {
  return (
    <li className="overflow-hidden rounded-2xl border-[1.5px] border-mess/15">
      <div className={cx("flex items-center gap-2 px-3.5 py-2.5", now ? "bg-mess-soft" : "bg-mess-soft/55")}>
        <span className="text-[14px] font-extrabold text-mess">{title}</span>
        {time && <span className="text-[12px] font-semibold text-muted tnum">{time}</span>}
        {now && (
          <span className="ml-auto rounded-full bg-mess px-2.5 py-0.5 text-[10.5px] font-bold text-white">Now</span>
        )}
      </div>
      {lines.length > 0 ? (
        <ul className="space-y-1.5 bg-card px-4 py-3">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-text">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-mess" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bg-card px-4 py-3 text-[13.5px] text-muted">Not published yet</p>
      )}
    </li>
  );
}

/** One meal straight from Camu: splits its label into the meal and the timing. */
function CamuMealRow({ meal, active }: { meal: CamuMeal; active: Meal }) {
  const now = meal.meal.toLowerCase().startsWith(active.slice(0, 4));
  const time = (meal.label || "").replace(meal.meal, "").trim();
  return <MealCard title={meal.meal || meal.label} time={time} now={now} lines={foodLines(meal.items)} />;
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
              i === day ? "bg-mess text-white" : "bg-card text-muted",
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
