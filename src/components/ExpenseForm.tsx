"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { addExpense, deleteExpense, restoreExpense, updateExpense } from "@/lib/repo";
import { fmtMoney, metaFor } from "@/lib/money";
import { useCategories } from "@/lib/hooks";
import { addCategory, ensureCategories } from "@/lib/repo";
import { toDateStr } from "@/lib/dates";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { Button, cx, useToast } from "./ui";


const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

/** Add or edit one expense. Used inside the Money sheet and on the /add page. */
export function ExpenseForm({
  expense,
  onDone,
}: {
  expense?: Expense;
  onDone: () => void;
}) {
  const toast = useToast();
  const cats = useCategories();
  const [newCat, setNewCat] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void ensureCategories();
  }, []);

  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "food");
  const [note, setNote] = useState(expense?.note ?? "");
  const [date, setDate] = useState(expense?.date ?? toDateStr());
  const [busy, setBusy] = useState(false);

  const value = parseFloat(amount);
  const valid = Number.isFinite(value) && value > 0 && value < 10_000_000;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    if (expense) {
      await updateExpense(expense.id, { amount: value, category, note, date });
      toast.show("Expense updated");
    } else {
      const e = await addExpense({ amount: value, category, note, date });
      toast.show(`${fmtMoney(e.amount)} added to ${metaFor(category, cats ?? []).label}`, () => {
        deleteExpense(e.id);
      });
    }
    onDone();
  }

  async function remove() {
    if (!expense) return;
    await deleteExpense(expense.id);
    toast.show("Expense deleted", () => restoreExpense(expense.id));
    onDone();
  }

  return (
    <div>
      <div className="rounded-2xl bg-surface-2 px-4 py-4">
        <label className="text-[13px] font-medium text-muted" htmlFor="amt">
          Amount
        </label>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[30px] font-semibold text-muted">₹</span>
          <input
            id="amt"
            inputMode="decimal"
            autoFocus={!expense}
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="min-w-0 flex-1 bg-transparent text-[36px] font-semibold tabular-nums outline-none placeholder:text-muted/50"
          />
        </div>
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(String((Number.isFinite(value) ? value : 0) + q))}
              className="h-8 shrink-0 rounded-full bg-surface px-3 text-[13px] font-medium tabular-nums shadow-[0_0_0_1px_var(--line)] active:scale-95"
            >
              +{q}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 mb-2 text-[13px] font-medium text-muted">Where</p>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Category">
        {(cats ?? []).map((c) => {
          const on = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCategory(c.id)}
              className={cx(
                "flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center transition active:scale-95",
                on ? "bg-accent-soft shadow-[0_0_0_2px_var(--accent)]" : "bg-surface-2",
              )}
            >
              <span className="text-[20px] leading-none">{c.emoji}</span>
              <span className="text-[11px] leading-tight">{c.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-line px-1 py-2.5 text-center text-muted transition active:scale-95"
        >
          <Plus size={20} />
          <span className="text-[11px] leading-tight">Add</span>
        </button>
      </div>

      {adding && (
        <div className="mt-3 flex gap-2.5">
          <input
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 text-[16px] outline-none focus:border-accent"
            placeholder="Name of the place"
            value={newCat}
            maxLength={30}
            autoFocus
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== "Enter" || !newCat.trim()) return;
              const made = await addCategory({ label: newCat });
              setCategory(made.id);
              setNewCat("");
              setAdding(false);
            }}
            aria-label="New category"
          />
          <Button
            type="button"
            className="shrink-0 px-4"
            disabled={!newCat.trim()}
            onClick={async () => {
              const made = await addCategory({ label: newCat });
              setCategory(made.id);
              setNewCat("");
              setAdding(false);
            }}
          >
            Add
          </Button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
        <input
          className="h-12 min-w-0 rounded-xl border border-line bg-bg px-3.5 text-[16px] outline-none placeholder:text-muted/70 focus:border-accent"
          placeholder="Note (optional)"
          value={note}
          maxLength={80}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
        />
        <input
          type="date"
          value={date}
          max={toDateStr()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Date"
          className="h-12 rounded-xl border border-line bg-bg px-3 text-[16px] outline-none focus:border-accent"
        />
      </div>

      <div className="mt-5 flex gap-3">
        {expense && (
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        )}
        <Button className="flex-1" onClick={save} disabled={!valid || busy}>
          {expense ? "Save changes" : valid ? `Add ${fmtMoney(value)}` : "Add expense"}
        </Button>
      </div>
    </div>
  );
}
