"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, HandCoins, MessageCircle, Plus } from "lucide-react";
import { useDues } from "@/lib/hooks";
import { addDue, deleteDue, getProfile, restoreDue, saveProfile, settleDue, settleWith } from "@/lib/repo";
import { fmtMoney, knownPeople, ledger, ledgerTotals, reminderText, whatsappUrl, type PersonLedger } from "@/lib/money";
import { fmtDay, toDateStr } from "@/lib/dates";
import type { Due } from "@/lib/types";
import { Button, Sheet, cx, inputCls, useToast } from "./ui";

/**
 * Lena-dena: who owes you and whom you owe, one line per person.
 *
 * Entries come from three places — "For someone" after a payment, a split, and
 * the + here — and leave the same way: money from that person comes in and
 * DockIn ticks off their oldest entries, or you tap "Got it".
 */
export function UdhaarCard() {
  const dues = useDues();
  const rows = useMemo(() => ledger(dues ?? []), [dues]);
  const totals = ledgerTotals(rows);
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const open = rows.find((r) => r.person === person) ?? null;

  if (!dues) return null;

  return (
    <section id="dues" className="mt-6 scroll-mt-20 px-5" aria-label="Lena-dena">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">Lena-dena</h2>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-medium shadow-[0_0_0_1px_var(--line)]"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      <div className="lift overflow-hidden rounded-3xl bg-surface">
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
          <div className="px-4 py-3">
            <p className="text-[12px] text-muted">Lena hai</p>
            <p className="text-[20px] font-semibold tabular-nums text-safe">{fmtMoney(totals.lena)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] text-muted">Dena hai</p>
            <p className="text-[20px] font-semibold tabular-nums text-danger">{fmtMoney(totals.dena)}</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-[13.5px] text-muted">
            Paid for a friend? After a payment tap <b className="text-text">For someone</b>, or add it with +.
            When they pay you back, DockIn ticks it off.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.person}>
                <button
                  onClick={() => setPerson(r.person)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                >
                  <span
                    className={cx(
                      "grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold",
                      r.net >= 0 ? "bg-safe-soft text-safe" : "bg-danger-soft text-danger",
                    )}
                    aria-hidden
                  >
                    {(r.person.trim()[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.person}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {r.open.length === 1 ? r.open[0].note || fmtDay(r.open[0].date) : `${r.open.length} entries`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={cx("block text-[15px] font-semibold tabular-nums", r.net >= 0 ? "text-safe" : "text-danger")}>
                      {fmtMoney(Math.abs(r.net))}
                    </span>
                    <span className="block text-[11.5px] text-muted">{r.net >= 0 ? "owes you" : "you owe"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add udhaar">
        <DueForm onDone={() => setAdding(false)} />
      </Sheet>
      <PersonSheet row={open} onClose={() => setPerson(null)} />
    </section>
  );
}

/** One person: every open entry, settle it, or send a reminder. */
function PersonSheet({ row, onClose }: { row: PersonLedger | null; onClose: () => void }) {
  const toast = useToast();
  const profile = useLiveQuery(() => getProfile(), []);
  const [part, setPart] = useState("");
  const [upi, setUpi] = useState<string | null>(null);
  if (!row) return null;
  const upiNow = upi ?? profile?.upi ?? "";
  const theyOwe = row.net > 0;

  async function gotIt(d: Due) {
    await settleDue(d.id);
    toast.show(`${fmtMoney(d.amount - d.paid)} ${d.dir === "owed" ? "back from" : "paid to"} ${row!.person}`);
  }

  async function partPay() {
    const n = Number(part);
    if (!Number.isFinite(n) || n <= 0) return;
    const left = await settleWith(row!.person, theyOwe ? "owed" : "owe", n);
    setPart("");
    toast.show(left > 0 ? `Settled, and ${fmtMoney(left)} more than was due` : `${fmtMoney(n)} ticked off`);
  }

  return (
    <Sheet open onClose={onClose} title={row.person}>
      <p className={cx("text-[15px] font-medium", theyOwe ? "text-safe" : "text-danger")}>
        {theyOwe ? `Owes you ${fmtMoney(row.net)}` : `You owe ${fmtMoney(-row.net)}`}
      </p>

      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface-2/60">
        {row.open.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{d.note || (d.dir === "owed" ? "You paid" : "They paid")}</span>
              <span className="block text-[12px] text-muted">
                {fmtDay(d.date)} · {d.dir === "owed" ? "they owe" : "you owe"}
                {d.paid > 0 ? ` · ${fmtMoney(d.paid)} back already` : ""}
              </span>
            </span>
            <span className="text-[14.5px] font-semibold tabular-nums">{fmtMoney(d.amount - d.paid)}</span>
            <button
              onClick={() => void gotIt(d)}
              aria-label={d.dir === "owed" ? "Got it back" : "Paid it"}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-safe text-white"
            >
              <Check size={16} strokeWidth={2.75} />
            </button>
            <button
              onClick={async () => {
                await deleteDue(d.id);
                toast.show("Removed", () => void restoreDue(d.id));
              }}
              aria-label="Remove"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-xl border border-line bg-bg px-3">
          <span className="text-muted">₹</span>
          <input
            inputMode="decimal"
            value={part}
            onChange={(e) => setPart(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={theyOwe ? "Part they paid back" : "Part you paid back"}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
            aria-label="Amount paid back"
          />
        </div>
        <Button size="sm" className="h-11" disabled={!part} onClick={() => void partPay()}>
          Tick off
        </Button>
      </div>

      {theyOwe && (
        <>
          <a
            href={whatsappUrl(reminderText(row, upiNow || undefined))}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (upi !== null && upi !== (profile?.upi ?? "")) void saveProfile({ upi: upi.trim() });
            }}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1fa855] text-[15px] font-semibold text-white"
          >
            <MessageCircle size={18} /> Remind on WhatsApp
          </a>
          <input
            className={cx(inputCls, "mt-2 h-10 text-[14px]")}
            placeholder="Your UPI id, to add a pay link (optional)"
            value={upiNow}
            autoCapitalize="none"
            onChange={(e) => setUpi(e.target.value)}
            onBlur={() => upi !== null && void saveProfile({ upi: upi.trim() })}
            aria-label="Your UPI id"
          />
        </>
      )}
    </Sheet>
  );
}

/** Add an entry by hand: who, how much, and which way. */
export function DueForm({
  onDone,
  preset,
}: {
  onDone: () => void;
  preset?: { amount?: number; note?: string; dir?: Due["dir"]; date?: string };
}) {
  const toast = useToast();
  const dues = useDues();
  const people = useMemo(() => knownPeople(dues ?? []), [dues]);
  const [dir, setDir] = useState<Due["dir"]>(preset?.dir ?? "owed");
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : "");
  const [note, setNote] = useState(preset?.note ?? "");
  const value = Number(amount);
  const valid = person.trim().length > 0 && Number.isFinite(value) && value > 0;

  async function save() {
    if (!valid) return;
    const d = await addDue({ person, amount: value, dir, note, date: preset?.date ?? toDateStr() });
    toast.show(`${fmtMoney(value)} ${dir === "owed" ? "from" : "to"} ${d.person} added`, () => void deleteDue(d.id));
    onDone();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Which way">
        {(
          [
            ["owed", "I paid for them"],
            ["owe", "They paid for me"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={dir === v}
            onClick={() => setDir(v)}
            className={cx("h-10 rounded-xl text-[13.5px] font-medium", dir === v ? "bg-surface shadow-sm" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      <PersonPicker value={person} onChange={setPerson} people={people} />
      <div className="mt-3 flex h-12 items-center gap-1 rounded-xl border border-line bg-bg px-3.5">
        <span className="text-[18px] text-muted">₹</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="Amount"
          className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/70"
          aria-label="Amount"
        />
      </div>
      <input
        className={cx(inputCls, "mt-3")}
        placeholder="What for (Pizza, movie ticket…)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="What for"
      />
      <Button className="mt-4 w-full" disabled={!valid} onClick={() => void save()}>
        <HandCoins size={17} /> Save
      </Button>
    </div>
  );
}

/** A name field with the people you usually settle up with as one-tap chips. */
export function PersonPicker({
  value,
  onChange,
  people,
  placeholder = "Who? (Rahul)",
}: {
  value: string;
  onChange: (v: string) => void;
  people: string[];
  placeholder?: string;
}) {
  return (
    <div className="mt-3">
      <input
        className={inputCls}
        placeholder={placeholder}
        value={value}
        autoCapitalize="words"
        onChange={(e) => onChange(e.target.value)}
        aria-label="Person"
      />
      {people.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cx(
                "h-8 rounded-full px-3 text-[13px] font-medium",
                value === p ? "bg-accent text-on-accent" : "bg-surface-2",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
