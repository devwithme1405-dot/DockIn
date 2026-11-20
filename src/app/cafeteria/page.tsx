"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { useLiveQuery } from "dexie-react-hooks";
import { Bone } from "@/components/Skeleton";
import { CalendarDays, Coffee, Cookie, Moon, Pencil, ScanLine, Soup, Sparkles, type LucideIcon } from "lucide-react";
import { StickyBar } from "@/components/PageHeader";
import { getProfile, saveProfile } from "@/lib/repo";
import { MEALS, type Meal, currentMeal, dayHasFood, menuForDay } from "@/lib/mess";
import { useCollege, syncCollege } from "@/lib/college";
import { ConnectCamu } from "@/components/College";
import type { CamuMeal } from "@/lib/native";
import type { MessDay } from "@/lib/types";
import { toDateStr, fmtDayLong } from "@/lib/dates";
import { TAB_SHOWN } from "@/lib/tabs";
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
    <svg
      viewBox="0 0 64 64"
      className="anim-float h-14 w-14 shrink-0 text-on-ink drop-shadow-[0_3px_5px_rgba(40,15,0,0.45)]"
      aria-hidden
    >
      <circle cx="32" cy="11" r="3.4" fill="currentColor" />
      <path d="M32 14 v4.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M9 45 a23 21 0 0 1 46 0 z" fill="currentColor" />
      <rect x="5" y="45" width="54" height="5" rx="2.5" fill="currentColor" />
      <path d="M19 41 a15 13 0 0 1 17 -7" stroke="#8f4a22" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

const PASS_KEY = "dockin-mess-pass-svg";
let passCache: { value: string; svg: string } | null = null;
const onPassCache = () => () => {};
function cachedPass(): { value: string; svg: string } | null {
  if (passCache) return passCache;
  try {
    const raw = localStorage.getItem(PASS_KEY);
    passCache = raw ? (JSON.parse(raw) as { value: string; svg: string }) : null;
  } catch {
    passCache = null;
  }
  return passCache;
}

export default function CafeteriaPage() {
  const profile = useLiveQuery(() => getProfile(), []);
  const { state, native } = useCollege();
  const today = toDateStr();
  const weekday = new Date().getDay();
  // The clock, ticking each minute: this tab stays alive in the background, so
  // "Serving now" must follow the real time, not the moment it first opened.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const id = window.setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 20000);
    const wake = () => setMinute(Math.floor(Date.now() / 60000));
    window.addEventListener(TAB_SHOWN, wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(TAB_SHOWN, wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  const nowHm = (() => {
    const d = new Date(minute * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();
  const nowMin = Number(nowHm.slice(0, 2)) * 60 + Number(nowHm.slice(3));
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
  const [pulling, setPulling] = useState(false);
  useEffect(() => {
    if (pulled.current) return;
    if (state.camu?.connected && !caf?.meals?.length) {
      pulled.current = true;
      void Promise.resolve().then(() => setPulling(true));
      void Promise.resolve(syncCollege())
        .catch(() => {})
        .finally(() => setPulling(false));
    }
  }, [state.camu?.connected, caf?.meals?.length]);

  // The pass — Camu's live one, else the pasted fallback — drawn once.
  const qrValue = (caf?.qr || profile?.messQr || "").trim();
  // Drawn once and remembered (memory + phone storage), so the pass is there
  // instantly every time — no blank square while it is generated.
  const remembered = useSyncExternalStore(onPassCache, cachedPass, () => null);
  const [fresh, setDrawn] = useState<{ value: string; svg: string } | null>(null);
  const drawn = fresh ?? remembered;
  const svg = drawn && drawn.value === qrValue ? drawn.svg : "";
  useEffect(() => {
    if (!qrValue || (drawn && drawn.value === qrValue)) return;
    let alive = true;
    QRCode.toString(qrValue, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => {
        if (!alive) return;
        const next = { value: qrValue, svg: s };
        passCache = next;
        try {
          localStorage.setItem(PASS_KEY, JSON.stringify(next));
        } catch {
          /* memory only */
        }
        setDrawn(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [qrValue, drawn]);

  // Grows as it is scrolled into view, straight on the node in a rAF. The tab
  // stays alive while hidden, so it only reacts while it is actually on screen,
  // and settles itself again the moment the tab is shown.
  const qrRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = qrRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (el.offsetParent === null) return; // this tab is hidden
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
    window.addEventListener(TAB_SHOWN, onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener(TAB_SHOWN, onScroll);
      cancelAnimationFrame(raf);
    };
  }, [svg]);

  return (
    <div className="page-wash min-h-dvh">
      {/* A tab, so no back arrow: the leather plate below is the title, and the
          name slides into this bar only once it has scrolled away. */}
      <StickyBar className="px-5 pb-1.5">
        {(scrolled) => (
          <div className="relative flex h-11 items-center justify-end">
            <p
              aria-hidden={!scrolled}
              className={cx(
                "pointer-events-none absolute inset-x-12 truncate text-center text-[16px] font-semibold transition-opacity duration-150",
                scrolled ? "opacity-100" : "opacity-0",
              )}
            >
              Cafeteria
            </p>
            {!fromCamu && (
              <button
                onClick={() => setMenuSheet(true)}
                aria-label="Edit the mess menu"
                className="grid size-10 place-items-center rounded-full text-mess active:scale-95"
              >
                <Pencil size={18} />
              </button>
            )}
          </div>
        )}
      </StickyBar>

      {/* hero: a stitched leather plate, the same hide as the tab bar */}
      <div className="leather stitched mx-5 mt-1 rounded-[26px] p-5">
        <div className="relative z-[1] flex items-center gap-4">
          <Cloche />
          <div className="min-w-0">
            <p className="font-display text-[26px] leading-none font-extrabold tracking-tight text-on-ink [text-shadow:0_1px_1px_rgb(50_20_5/55%)]">
              Cafeteria
            </p>
            <p className="mt-1.5 text-[13.5px] font-semibold text-ink-muted">{fromCamu ? camuLine(camuMeals, nowMin) : mealLine(nowHm)}</p>
          </div>
        </div>
      </div>

      {native && !fromCamu && !state.camu?.connected && (
        <div className="mt-4 px-5">
          <ConnectCamu />
        </div>
      )}

      {/* today's menu */}
      <section className="lift mx-5 mt-4 rounded-3xl bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-2xl bg-mess-soft text-mess">
            <CalendarDays size={19} />
          </span>
          <h2 className="text-[18px] font-extrabold tracking-tight">On the plate today</h2>
          <span className="ml-auto text-[13px] font-semibold text-muted">{fmtDayLong(today)}</span>
        </div>
        {caf?.facility && <p className="mt-1.5 pl-[3.1rem] text-[12.5px] font-semibold text-muted">{caf.facility}</p>}

        {!fromCamu && pulling ? (
          <ul className="mt-3.5 space-y-3" role="status" aria-label="Loading the menu">
            {[0, 1, 2].map((i) => (
              <li key={i} className="rounded-2xl border border-card-edge/60 p-3.5">
                <div className="flex items-center gap-2.5">
                  <Bone className="size-9 rounded-xl" />
                  <span className="flex-1 space-y-1.5">
                    <Bone className="h-4 w-1/3" />
                    <Bone className="h-3 w-1/4" />
                  </span>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Bone className="h-8 w-24 rounded-full" />
                  <Bone className="h-8 w-20 rounded-full" />
                  <Bone className="h-8 w-16 rounded-full" />
                </div>
              </li>
            ))}
          </ul>
        ) : fromCamu ? (
          <ul className="mt-3.5 space-y-3">
            {camuMeals.map((m, i) => (
              <CamuMealRow key={i} meal={m} index={i} status={camuStatus(camuMeals, i, nowMin)} />
            ))}
          </ul>
        ) : hasManual ? (
          <ul className="mt-3.5 space-y-3">
            {MEALS.map(({ key, label, from }, i) => (
              <MealCard
                key={key}
                index={i}
                title={label}
                time={from}
                status={key === active && nowHm >= from ? { now: true } : null}
                lines={todayManual[key] ? [todayManual[key] as string] : []}
              />
            ))}
          </ul>
        ) : (
          <button
            onClick={() => setMenuSheet(true)}
            className="btn-paper mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-bold"
          >
            <Sparkles size={17} className="text-mess" /> Add the week&rsquo;s menu once
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
            <p className="text-[18px] font-extrabold tracking-tight">Mess pass</p>
            <p className="text-[13px] text-muted">Hold it up at the counter, that&rsquo;s it</p>
          </div>
        </div>

        <div className="grid min-h-[70vh] place-items-center pt-7 pb-24">
          {qrValue ? (
            <div className="flex flex-col items-center">
              <div ref={qrRef} className="relative will-change-transform" style={{ transformOrigin: "center" }}>
                {/* warm light behind the pass, breathing */}
                <span className="anim-halo pointer-events-none absolute -inset-8 rounded-[48px] bg-[radial-gradient(closest-side,rgba(242,135,31,0.5),transparent)] blur-xl" aria-hidden />
                {/* little dishes floating round it */}
                {(
                  [
                    ["☕", "-top-6 -left-5", "0s"],
                    ["🍛", "-top-7 -right-4", "-1.2s"],
                    ["🍪", "-bottom-5 -left-6", "-2.1s"],
                    ["🥗", "-right-6 -bottom-6", "-0.6s"],
                  ] as const
                ).map(([e, at, d]) => (
                  <span
                    key={e}
                    aria-hidden
                    className={cx("anim-float pointer-events-none absolute z-[2] grid size-11 place-items-center rounded-2xl bg-surface text-[22px] shadow-[0_8px_18px_-10px_rgb(var(--shadow-ink)/0.7)]", at)}
                    style={{ "--d": d } as React.CSSProperties}
                  >
                    {e}
                  </span>
                ))}
                {/* the light running round the edge */}
                <div className="ring-spin relative rounded-[32px] p-[3px] shadow-[0_22px_46px_-16px_rgb(var(--shadow-ink)/0.6)]">
                  <div className="relative overflow-hidden rounded-[29px] bg-white p-6">
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
                </div>
              </div>
              <p className="mt-6 flex items-center gap-2 rounded-full bg-safe-soft px-3.5 py-1.5 text-[12.5px] font-bold text-safe">
                <span className="anim-pulse size-2 rounded-full bg-safe" /> Ready to scan · {fmtDayLong(today)}
              </p>
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
              <p className="mt-4 font-bold">No pass yet</p>
              <p className="mt-1 text-[13px] text-muted">
                Link Camu in Settings and your pass shows up here on its own, next to your attendance.
              </p>
              <button
                onClick={() => setQrSheet(true)}
                className="btn-paper mt-5 inline-flex h-11 items-center rounded-2xl px-5 text-[13.5px] font-bold text-muted"
              >
                Paste it yourself
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
      className={cx("absolute h-5 w-5 rounded-tl-[6px] border-t-[3px] border-l-[3px] border-orange", className)}
    />
  );
}

/** "KADAI PANEER" / "kadai paneer" → "Kadai Paneer"; already-mixed case is left alone. */
function dishName(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}
/** "07:30 AM - 09:30 AM" → "7:30 – 9:30 AM". */
function tidyTime(t: string): string {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return t;
  const a = `${Number(m[1])}:${m[2]}`;
  const b = `${Number(m[4])}:${m[5]}`;
  const ap1 = (m[3] ?? "").toUpperCase();
  const ap2 = (m[6] ?? "").toUpperCase();
  return ap1 && ap1 !== ap2 ? `${a} ${ap1} – ${b} ${ap2}` : `${a} – ${b}${ap2 ? ` ${ap2}` : ""}`;
}
/** Each meal has its own colour and mark. */
const MEAL_LOOK: Record<string, { icon: LucideIcon; tint: string; tint2: string }> = {
  breakfast: { icon: Coffee, tint: "#f0a23a", tint2: "#d9741f" },
  lunch: { icon: Soup, tint: "#e0662b", tint2: "#b8441a" },
  snack: { icon: Cookie, tint: "#2f9c8c", tint2: "#1e7266" },
  dinner: { icon: Moon, tint: "#4b7fc4", tint2: "#2f5c9a" },
};
function lookOf(title: string) {
  const k = title.toLowerCase();
  if (k.startsWith("break")) return MEAL_LOOK.breakfast;
  if (k.startsWith("lunch")) return MEAL_LOOK.lunch;
  if (k.startsWith("snack") || k.startsWith("hi-tea") || k.startsWith("evening")) return MEAL_LOOK.snack;
  return MEAL_LOOK.dinner;
}

/**
 * One meal card: a tinted header with the meal's own colour and time, then each
 * dish as a chip with its little picture. The meal being served now glows.
 */
function MealCard({ title, time, status, lines, index = 0 }: { title: string; time: string; status: MealStatus; lines: string[]; index?: number }) {
  const now = !!status && "now" in status;
  const look = lookOf(title);
  const dishes = lines.flatMap((l) => l.split(/\s*,\s*/)).map(dishName).filter(Boolean);
  return (
    <li
      className={cx("tile-tint anim-pop overflow-hidden rounded-2xl", now && "ring-2 ring-orange/70")}
      style={{ "--tint": look.tint, "--tint-2": look.tint2, "--d": `${index * 70}ms` } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
        <span className="tile-icon grid size-9 shrink-0 place-items-center rounded-xl">
          <look.icon size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15.5px] leading-tight font-extrabold">{title}</span>
          {time && <span className="block text-[12px] font-semibold text-muted tnum">{tidyTime(time)}</span>}
        </span>
        {now && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[#d9772b] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
            <span className="anim-pulse size-1.5 rounded-full bg-white" /> Serving now
          </span>
        )}
        {status && "soon" in status && (
          <span className="ml-auto rounded-full border border-card-edge bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">{status.soon}</span>
        )}
      </div>
      {dishes.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 px-3.5 pb-3.5">
          {dishes.map((d, i) => (
            <li
              key={i}
              className="rounded-full border border-card-edge/70 bg-surface/85 px-3 py-1.5 text-[13.5px] font-semibold text-text shadow-[0_2px_6px_-4px_rgb(var(--shadow-ink)/0.5)]"
            >
              {d}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3.5 pb-3.5 text-[13.5px] text-muted">Not up yet — check back closer to the meal.</p>
      )}
    </li>
  );
}

/** One meal straight from Camu: splits its label into the meal and the timing. */
function CamuMealRow({ meal, index, status }: { meal: CamuMeal; index: number; status: MealStatus }) {
  const time = (meal.label || "").replace(meal.meal, "").trim();
  return <MealCard title={meal.meal || meal.label} time={time} status={status} lines={foodLines(meal.items)} index={index} />;
}

type MealStatus = { now: true } | { soon: string } | null;

/** "12:00 PM - 03:00 PM" → [720, 900] in minutes since midnight. */
function mealWindow(label: string): [number, number] | null {
  const m = label.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  const toMin = (h: string, mm: string, ap: string | undefined, fallback?: string) => {
    let hr = Number(h) % 12;
    const a = (ap || fallback || "").toUpperCase();
    if (a === "PM") hr += 12;
    if (!a && Number(h) === 12) hr = 12;
    return hr * 60 + Number(mm);
  };
  const end = toMin(m[4], m[5], m[6]);
  const start = toMin(m[1], m[2], m[3], m[6]);
  return [start, end > start ? end : end + 12 * 60];
}

/** Serving right now only inside its own timing; "in 25 min" when it is next and close. */
function camuStatus(meals: CamuMeal[], i: number, nowMin: number): MealStatus {
  const w = mealWindow(meals[i].label || "");
  if (!w) return null;
  if (nowMin >= w[0] && nowMin < w[1]) return { now: true };
  if (meals.some((x) => {
    const v = mealWindow(x.label || "");
    return v && nowMin >= v[0] && nowMin < v[1];
  })) return null;
  const next = meals
    .map((x, j) => ({ j, w: mealWindow(x.label || "") }))
    .filter((x) => x.w && x.w[0] > nowMin)
    .sort((a, b) => a.w![0] - b.w![0])[0];
  if (next?.j !== i) return null;
  const mins = w[0] - nowMin;
  if (mins > 120) return null;
  return { soon: mins < 60 ? `In ${mins} min` : `In ${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim() };
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
        With Camu linked, this fills itself. Otherwise open the mess QR in MyCamu, scan it with any QR app and paste
        the text it shows.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the scanned text"
        className="w-full rounded-2xl border-[1.5px] border-card-edge bg-card px-4 py-3 text-[15px] outline-none focus:border-orange"
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
      <p className="mb-3 text-[13px] text-muted">Type the week once. Every morning the right day shows up by itself.</p>

      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
        {DAYS.map((label, i) => (
          <button
            key={i}
            onClick={() => setDay(i)}
            className={cx(
              "shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition",
              i === day ? "bg-ink text-on-ink" : "bg-card text-muted",
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
              className="w-full rounded-xl border-[1.5px] border-card-edge bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-orange"
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

/** The hero's line from Camu's real timings. */
function camuLine(meals: CamuMeal[], nowMin: number): string {
  const timed = meals.map((m) => ({ m, w: mealWindow(m.label || "") })).filter((x) => x.w) as { m: CamuMeal; w: [number, number] }[];
  const on = timed.find((x) => nowMin >= x.w[0] && nowMin < x.w[1]);
  if (on) return `${on.m.meal || "Food"} is being served`;
  const next = timed.filter((x) => x.w[0] > nowMin).sort((a, b) => a.w[0] - b.w[0])[0];
  if (next) {
    const h = Math.floor(next.w[0] / 60);
    const mm = String(next.w[0] % 60).padStart(2, "0");
    return `${next.m.meal || "Next meal"} at ${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  }
  return "Mess is shut for the night";
}

/** The hero's one line: what the mess is doing right now. */
function mealLine(hm: string): string {
  if (hm < "07:30") return "Up early? Breakfast is next";
  if (hm < "11:00") return "Breakfast time";
  if (hm < "12:30") return "Lunch is next";
  if (hm < "15:30") return "Lunch time";
  if (hm < "17:00") return "Snacks are next";
  if (hm < "18:30") return "Snack break";
  if (hm < "19:30") return "Dinner is next";
  if (hm < "22:30") return "Dinner time";
  return "Mess is shut for the night";
}
