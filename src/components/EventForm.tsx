"use client";

import { useState } from "react";
import { addEvent, deleteEvent, restoreEvent, updateEvent } from "@/lib/repo";
import { nationalHolidays } from "@/lib/calendar";
import { db } from "@/lib/db";
import { toDateStr } from "@/lib/dates";
import type { CalEvent, EventKind } from "@/lib/types";
import { Button, cx, useToast } from "./ui";

export function EventForm({
  event,
  defaultDate,
  onDone,
}: {
  event?: CalEvent;
  defaultDate: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "holiday");
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? defaultDate);
  const [endDate, setEndDate] = useState(event && event.endDate !== event.date ? event.endDate : "");
  const [note, setNote] = useState(event?.note ?? "");
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length > 0 && !!date;

  const inputBase =
    "h-12 w-full min-w-0 rounded-xl border border-line bg-bg px-3.5 text-[16px] outline-none placeholder:text-muted/70 focus:border-accent";

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    const data = { title, kind, date, endDate: endDate || date, note };
    if (event) {
      await updateEvent(event.id, data);
      toast.show("Saved");
    } else {
      const e = await addEvent(data);
      toast.show(kind === "holiday" ? "Holiday added. Classes that day won't count." : "Event added", () => {
        deleteEvent(e.id);
      });
    }
    onDone();
  }

  async function remove() {
    if (!event) return;
    await deleteEvent(event.id);
    toast.show("Deleted", () => restoreEvent(event.id));
    onDone();
  }

  async function addNational() {
    const year = Number(date.slice(0, 4)) || new Date().getFullYear();
    const have = await db.events.filter((e) => !e.deletedAt && e.kind === "holiday").toArray();
    let n = 0;
    for (const h of nationalHolidays(year)) {
      if (have.some((e) => e.date <= h.date && h.date <= e.endDate)) continue;
      await addEvent({ title: h.title, kind: "holiday", date: h.date });
      n++;
    }
    toast.show(n ? `${n} national holidays added for ${year}` : "Already added");
    onDone();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Type">
        {(["holiday", "event"] as EventKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cx(
              "h-10 rounded-lg text-sm font-medium transition",
              kind === k ? "bg-surface shadow-sm" : "text-muted",
            )}
          >
            {k === "holiday" ? "Holiday" : "Event"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        {kind === "holiday"
          ? "Classes on holidays are ignored in your attendance."
          : "A reminder on the calendar, such as a fest or a club meet."}
      </p>

      <input
        className={cx(inputBase, "mt-4")}
        placeholder={kind === "holiday" ? "e.g. Diwali break" : "e.g. Tech fest"}
        value={title}
        maxLength={80}
        autoFocus={!event}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Title"
      />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">From</span>
          <input type="date" className={inputBase} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="From date" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">To (optional)</span>
          <input type="date" className={inputBase} value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} aria-label="To date" />
        </label>
      </div>
      <input
        className={cx(inputBase, "mt-3")}
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Note"
      />

      <div className="mt-5 flex gap-3">
        {event && (
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        )}
        <Button className="flex-1" onClick={save} disabled={!valid || busy}>
          {event ? "Save changes" : kind === "holiday" ? "Add holiday" : "Add event"}
        </Button>
      </div>

      {!event && kind === "holiday" && (
        <div className="mt-5 border-t border-line pt-4">
          <button onClick={addNational} className="text-[14px] font-medium text-accent">
            Add national holidays for {date.slice(0, 4) || toDateStr().slice(0, 4)}
          </button>
          <p className="mt-1 text-xs text-muted">
            Republic Day, Independence Day, Gandhi Jayanti and Christmas. Add Bennett&apos;s own
            breaks yourself from the university calendar.
          </p>
        </div>
      )}
    </div>
  );
}
