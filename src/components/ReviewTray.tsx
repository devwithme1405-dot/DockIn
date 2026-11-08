"use client";

import { useCallback, useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { useCategories } from "@/lib/hooks";
import { addExpense, addIncome } from "@/lib/repo";
import { fmtMoney, metaFor } from "@/lib/money";
import { toDateStr } from "@/lib/dates";
import { clearNotices, phoneInbox, reviewFrom, type Unread } from "@/lib/payments";
import { onPhone } from "@/lib/native";
import type { ExpenseCategory } from "@/lib/types";
import { Button, Sheet, cx, useToast } from "./ui";

/**
 * Money the phone saw but DockIn could not read.
 *
 * The whole promise is that no rupee slips through. The clean notifications
 * become the tray above; the messy ones — a new bank's wording, two amounts in
 * one line — would otherwise be dropped on the floor. Instead they come here,
 * shown exactly as they arrived, for a one-tap manual add. The amount is
 * guessed to save typing; nothing is recorded until you say what it was.
 */
export function ReviewTray() {
  const toast = useToast();
  const cats = useCategories();
  const [list, setList] = useState<Unread[]>([]);
  const [open, setOpen] = useState<Unread | null>(null);

  const load = useCallback(async () => {
    try {
      setList(reviewFrom(await phoneInbox()));
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    const offNotice = onPhone("notice", () => void load());
    const offResume = onPhone("resume", () => void load());
    return () => {
      offNotice();
      offResume();
    };
  }, [load]);

  function drop(id: string) {
    setList((cur) => cur.filter((u) => u.id !== id));
    void clearNotices([id]).catch(() => {});
  }

  async function save(u: Unread, dir: "out" | "in", amount: number, category: ExpenseCategory | null, from: string) {
    const date = toDateStr(new Date(u.at));
    if (dir === "out") await addExpense({ amount, category: category ?? "other", note: u.source, date });
    else await addIncome({ amount, from, date });
    setOpen(null);
    drop(u.id);
    toast.show(dir === "out" ? `${fmtMoney(amount)} spent added` : `${fmtMoney(amount)} in added`);
  }

  if (list.length === 0) return null;

  return (
    <>
      <section className="mx-5 mt-4 overflow-hidden lift rounded-3xl bg-surface">
        <h2 className="flex items-center gap-1.5 px-4 pt-3.5 pb-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
          <HelpCircle size={13} /> {list.length === 1 ? "1 couldn't read" : `${list.length} couldn't read`}
        </h2>
        <p className="px-4 pb-1 text-[12px] text-muted">A message about money DockIn could not place. Tap to add it yourself.</p>
        <div className="divide-y divide-line">
          {list.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => setOpen(u)} className="min-w-0 flex-1 text-left">
                <p className="text-[14.5px] font-medium tabular-nums">
                  {u.amount ? fmtMoney(u.amount) : "Amount?"}
                  <span className="ml-1.5 font-normal text-muted">· {u.source}</span>
                </p>
                <p className="truncate text-[12px] text-muted">{u.text}</p>
              </button>
              <button
                onClick={() => drop(u.id)}
                aria-label="Not money"
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {open && <ReviewSheet u={open} cats={cats ?? []} onClose={() => setOpen(null)} onSave={save} />}
    </>
  );
}

function ReviewSheet({
  u,
  cats,
  onClose,
  onSave,
}: {
  u: Unread;
  cats: { id: string; label: string; emoji: string }[];
  onClose: () => void;
  onSave: (u: Unread, dir: "out" | "in", amount: number, category: ExpenseCategory | null, from: string) => void;
}) {
  const [dir, setDir] = useState<"out" | "in">(u.dir ?? "out");
  const [amt, setAmt] = useState(u.amount ? String(u.amount) : "");
  const [from, setFrom] = useState("");
  const amount = Number(amt);
  const ok = Number.isFinite(amount) && amount > 0;

  return (
    <Sheet open onClose={onClose} title="Add it yourself">
      <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-muted">{u.text}</p>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Which way">
        {(
          [
            ["out", "Spent"],
            ["in", "Money in"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={dir === m}
            onClick={() => setDir(m)}
            className={cx("h-10 rounded-xl text-[13.5px] font-medium", dir === m ? "bg-surface shadow-sm" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-baseline gap-2 rounded-2xl bg-surface-2 px-4 py-3">
        <span className="text-[24px] font-semibold text-muted">₹</span>
        <input
          inputMode="decimal"
          value={amt}
          placeholder="0"
          onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
          aria-label="Amount"
          className="min-w-0 flex-1 bg-transparent text-[28px] font-semibold tabular-nums outline-none placeholder:text-muted/50"
        />
      </div>

      {dir === "out" ? (
        <>
          <p className="mt-4 mb-2 text-[13px] text-muted">Where did it go?</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Category">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!ok}
                onClick={() => onSave(u, "out", amount, c.id, "")}
                className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 px-1 py-2.5 text-center transition active:scale-95 disabled:opacity-40"
              >
                <span className="text-[20px] leading-none">{c.emoji}</span>
                <span className="text-[11px] leading-tight">{metaFor(c.id, cats).label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <input
            className="mt-3 h-12 w-full rounded-xl border border-line bg-bg px-3.5 outline-none placeholder:text-muted/70 focus:border-accent"
            placeholder="From whom (optional)"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From whom"
          />
          <Button className="mt-4 w-full" disabled={!ok} onClick={() => onSave(u, "in", amount, null, from.trim())}>
            Add money in
          </Button>
        </>
      )}
    </Sheet>
  );
}
