"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Sparkles, X } from "lucide-react";
import { useCategories } from "@/lib/hooks";
import { addExpense, deleteExpense, merchantRules, rememberMerchant } from "@/lib/repo";
import { fmtMoney, metaFor } from "@/lib/money";
import { toDateStr } from "@/lib/dates";
import {
  PaymentError,
  clearNotices,
  detectedFrom,
  inbox,
  merchantKey,
  strayIds,
  type Detected,
} from "@/lib/payments";
import type { ExpenseCategory } from "@/lib/types";
import { Sheet, cx, useToast } from "./ui";

/**
 * Payments the phone noticed, waiting for one tap.
 *
 * This is deliberately a tray and not an automatic entry. The phone can be
 * wrong — a refund worded like a spend, a payment the parser read badly — and
 * an expense tracker that quietly records the wrong number is worse than one
 * that records nothing, because the total stops being believable. So the app
 * does the typing and the person does the deciding.
 *
 * A payee you have placed once is never asked about again: the second ₹60 at
 * 24/7 Kathi is a single tap with no sheet at all.
 */
export function DetectedTray({ signedIn }: { signedIn: boolean }) {
  const toast = useToast();
  const cats = useCategories();
  const rules = useLiveQuery(() => merchantRules(), []);
  const [list, setList] = useState<Detected[] | null>(null);
  const [asking, setAsking] = useState<Detected | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      const notices = await inbox();
      setList(detectedFrom(notices));
      // Adverts and balance alerts come in with everything else; they are not
      // shown and they are not kept.
      const rubbish = strayIds(notices);
      if (rubbish.length) await clearNotices(rubbish);
    } catch {
      // Detection is a bonus on top of the Money screen, never a reason it
      // fails to draw. Offline, or not set up, simply means no tray.
      setList([]);
    }
  }, [signedIn]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (!signedIn || !list || list.length === 0) return null;

  const known = (d: Detected): ExpenseCategory | null => {
    if (!d.merchant) return null;
    return rules?.find((r) => r.id === merchantKey(d.merchant!))?.category ?? null;
  };

  async function add(d: Detected, category: ExpenseCategory, remember: boolean) {
    setBusy(d.ids[0]);
    try {
      const e = await addExpense({
        amount: d.amount,
        category,
        note: d.merchant ?? d.source,
        date: toDateStr(new Date(d.at)),
      });
      if (remember && d.merchant) {
        await rememberMerchant(merchantKey(d.merchant), d.merchant, category);
      }
      await clearNotices(d.ids);
      setList((cur) => (cur ?? []).filter((x) => x.ids[0] !== d.ids[0]));
      toast.show(`${fmtMoney(d.amount)} added to ${metaFor(category, cats ?? []).label}`, () => {
        void deleteExpense(e.id);
      });
    } catch (e) {
      toast.show(e instanceof PaymentError ? e.message : "Could not add that.");
    }
    setBusy(null);
    setAsking(null);
  }

  async function dismiss(d: Detected) {
    setList((cur) => (cur ?? []).filter((x) => x.ids[0] !== d.ids[0]));
    try {
      await clearNotices(d.ids);
    } catch {
      /* it will still be there next time, which is the safe way round */
    }
  }

  return (
    <>
      <section className="mx-5 mt-4 overflow-hidden lift rounded-3xl bg-surface">
        <h2 className="flex items-center gap-1.5 px-4 pt-3.5 pb-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
          <Sparkles size={13} /> {list.length === 1 ? "A payment" : `${list.length} payments`} to add
        </h2>
        <div className="divide-y divide-line">
          {list.map((d) => {
            const cat = known(d);
            const meta = cat ? metaFor(cat, cats ?? []) : null;
            return (
              <div key={d.ids[0]} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium tabular-nums">
                    {fmtMoney(d.amount)}
                    {d.merchant && <span className="font-normal"> · {d.merchant}</span>}
                  </p>
                  <p className="truncate text-[12.5px] text-muted">
                    {meta ? `${meta.emoji} ${meta.label}` : "Not placed yet"} · {d.source} ·{" "}
                    {new Date(d.at).toLocaleTimeString("en-IN", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => dismiss(d)}
                  aria-label={`Ignore ${fmtMoney(d.amount)}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={() => (cat ? void add(d, cat, false) : setAsking(d))}
                  disabled={busy === d.ids[0]}
                  className={cx(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium",
                    "bg-accent text-on-accent disabled:opacity-60",
                  )}
                >
                  <Check size={14} /> {cat ? "Add" : "Place"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <Sheet
        open={!!asking}
        onClose={() => setAsking(null)}
        title={asking ? `${fmtMoney(asking.amount)} — where?` : ""}
      >
        {asking && (
          <>
            <p className="mb-4 text-[13.5px] text-muted">
              {asking.merchant ? (
                <>
                  <b className="text-text">{asking.merchant}</b> will be remembered, so this is the
                  last time you are asked.
                </>
              ) : (
                <>This one did not say where it went, so it is not remembered.</>
              )}
            </p>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Category">
              {(cats ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={false}
                  onClick={() => void add(asking, c.id, true)}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 px-1 py-2.5 text-center transition active:scale-95"
                >
                  <span className="text-[20px] leading-none">{c.emoji}</span>
                  <span className="text-[11px] leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
