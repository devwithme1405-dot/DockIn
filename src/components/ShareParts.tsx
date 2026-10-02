"use client";

import { useState } from "react";
import { Check, Clock, MapPin, Send, Undo2, Users } from "lucide-react";
import type { Group, Priority, Share, ShareState, Subject, TaskKind } from "@/lib/types";
import { KINDS, dueLabel } from "@/lib/tasks";
import { toDateStr } from "@/lib/dates";
import { SocialError, hideShare, setShareDone, shareTask, unshare } from "@/lib/social";
import { Avatar, Button, Chip, Field, cx, inputCls, useToast } from "./ui";
import { KIND_ICON } from "./TaskParts";

/** One shared assignment, with who posted it and where. */
export function ShareRow({
  share,
  state,
  showGroup = true,
  mine,
  onChanged,
}: {
  share: Share;
  state?: ShareState;
  showGroup?: boolean;
  mine: boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const today = toDateStr();
  const Icon = KIND_ICON[share.kind];
  const done = !!state?.done;
  const overdue = !done && !!share.dueDate && share.dueDate < today;

  async function toggle() {
    await setShareDone(share.id, !done);
    onChanged?.();
  }

  async function withdraw() {
    try {
      await unshare(share.id);
      toast.show("Taken back");
      onChanged?.();
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not take that back.");
    }
  }

  async function dismiss() {
    await hideShare(share.id);
    toast.show("Hidden", () => void hideShare(share.id, false).then(() => onChanged?.()));
    onChanged?.();
  }

  return (
    <div className="flex items-start gap-3 p-3.5">
      <button
        onClick={toggle}
        aria-label={done ? `Mark ${share.title} as not done` : `Mark ${share.title} as done`}
        aria-pressed={done}
        className={cx(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition",
          done ? "border-safe bg-safe text-white" : "border-line text-transparent",
        )}
      >
        <Check size={14} strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cx("text-[15px] leading-snug font-medium", done && "text-muted line-through")}>
          {share.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon size={13} /> {KINDS.find((k) => k.id === share.kind)?.label ?? "Task"}
          </span>
          {share.subjectName && <span>· {share.subjectName}</span>}
          {share.dueDate && (
            <span className={cx(overdue && "font-medium text-danger")}>
              ·{" "}
              {dueLabel(
                {
                  dueDate: share.dueDate,
                  dueTime: share.dueTime,
                } as never,
                today,
              )}
            </span>
          )}
          {share.room && (
            <span className="inline-flex items-center gap-1">
              · <MapPin size={12} /> {share.room}
            </span>
          )}
        </p>
        {share.notes && <p className="mt-1 text-[13px] text-muted">{share.notes}</p>}

        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
          <Avatar name={share.authorName} avatar={share.authorAvatar} size={16} />
          <span className="truncate">
            {mine ? "You shared this" : `${share.authorName} shared this`}
            {showGroup && share.groupName ? ` in ${share.groupName}` : ""}
          </span>
        </p>
      </div>

      <button
        onClick={mine ? withdraw : dismiss}
        aria-label={mine ? `Take back ${share.title}` : `Hide ${share.title}`}
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted"
      >
        <Undo2 size={15} />
      </button>
    </div>
  );
}

/** Compose an assignment and post it to a group or to chosen friends. */
export function ShareForm({
  groups,
  subjects,
  friends,
  defaultGroupId,
  onDone,
}: {
  groups: Group[];
  subjects: Subject[];
  friends: { id: string; name: string; avatar?: string }[];
  defaultGroupId?: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("assignment");
  const [subjectName, setSubjectName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [room, setRoom] = useState("");
  const [priority, setPriority] = useState<Priority>("med");
  const [notes, setNotes] = useState("");
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<"group" | "friends">(
    defaultGroupId || groups.length > 0 ? "group" : "friends",
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const isExam = kind === "exam" || kind === "quiz";
  const canSend =
    title.trim().length > 0 && (mode === "group" ? !!groupId : picked.length > 0) && !busy;

  async function send() {
    setBusy(true);
    setProblem(null);
    try {
      await shareTask(
        {
          title: title.trim(),
          notes: notes.trim(),
          kind,
          subjectName: subjectName.trim() || null,
          dueDate: dueDate || null,
          dueTime: dueTime || null,
          room: room.trim(),
          priority,
        },
        mode === "group" ? { groupId } : { friendIds: picked },
      );
      toast.show("Shared");
      onDone();
    } catch (e) {
      setProblem(e instanceof SocialError ? e.message : "Could not share that.");
    }
    setBusy(false);
  }

  return (
    <div>
      <Field label="What is it?">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="DBMS assignment 3"
          autoFocus
        />
      </Field>

      <p className="mb-1.5 text-[13px] font-medium text-muted">Type</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </Chip>
        ))}
      </div>

      <Field label="Subject">
        <input
          className={inputCls}
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          placeholder="DBMS"
          list="dockin-subject-names"
        />
      </Field>
      <datalist id="dockin-subject-names">
        {subjects.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-3">
        <Field label={isExam ? "Exam date" : "Due date"}>
          <input className={inputCls} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <input className={inputCls} type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </Field>
      </div>

      {isExam && (
        <Field label="Room">
          <input className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="N-204" />
        </Field>
      )}

      <Field label="Anything else">
        <input
          className={inputCls}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Handwritten, submit in class"
        />
      </Field>

      <p className="mb-1.5 text-[13px] font-medium text-muted">Priority</p>
      <div className="mb-5 flex gap-2">
        {(["low", "med", "high"] as Priority[]).map((p) => (
          <Chip key={p} active={priority === p} onClick={() => setPriority(p)}>
            {p === "med" ? "Normal" : p === "low" ? "Low" : "High"}
          </Chip>
        ))}
      </div>

      <p className="mb-1.5 text-[13px] font-medium text-muted">Who sees it</p>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
        {(["group", "friends"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cx(
              "h-9 rounded-lg text-sm font-medium transition",
              mode === m ? "bg-surface text-text shadow-sm" : "text-muted",
            )}
          >
            {m === "group" ? "A group" : "Chosen friends"}
          </button>
        ))}
      </div>

      {mode === "group" ? (
        groups.length === 0 ? (
          <p className="mb-4 text-[13.5px] text-muted">
            You are not in any group yet. Make one in Friends and groups first.
          </p>
        ) : (
          <select className={cx(inputCls, "mb-4")} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji ? `${g.emoji} ` : ""}
                {g.name} · {g.members} {g.members === 1 ? "person" : "people"}
              </option>
            ))}
          </select>
        )
      ) : friends.length === 0 ? (
        <p className="mb-4 text-[13.5px] text-muted">
          No friends yet. Share your code from Friends and groups.
        </p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {friends.map((f) => {
            const on = picked.includes(f.id);
            return (
              <button
                key={f.id}
                onClick={() => setPicked(on ? picked.filter((x) => x !== f.id) : [...picked, f.id])}
                aria-pressed={on}
                className={cx(
                  "inline-flex h-10 items-center gap-2 rounded-full pr-3.5 pl-1.5 text-sm font-medium transition",
                  on ? "bg-text text-bg" : "bg-surface-2 text-text",
                )}
              >
                <Avatar name={f.name} avatar={f.avatar} size={28} />
                {f.name}
              </button>
            );
          })}
        </div>
      )}

      {problem && <p className="mb-3 text-[13.5px] text-danger">{problem}</p>}

      <Button className="w-full" onClick={send} disabled={!canSend}>
        <Send size={17} /> Share
      </Button>
    </div>
  );
}

/** The little "shared with N people" line under a group's name. */
export function GroupBadge({ group }: { group: Group }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
      <Users size={13} /> {group.members} {group.members === 1 ? "person" : "people"}
      <Clock size={13} className="ml-1" /> code {group.code}
    </span>
  );
}
