import Dexie, { type Table } from "dexie";
import type { PassDraft } from "../outpass";

/**
 * DockIn 3's own small database, kept apart from the main one so the test
 * build can never disturb the everyday data or its sync. Lives only on this
 * phone for now.
 */

/** Where an outpass stands. "saved" = filled in DockIn, not yet in MyCamu. */
export type PassStatus = "saved" | "applied" | "approved" | "rejected" | "cancelled";

export interface PassRecord extends PassDraft {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: PassStatus;
  /** The parent-approval mail screenshot (leave). */
  proof?: Blob;
  proofName?: string;
  via: "assistant" | "manual";
  /** MyCamu's id for this pass, when DockIn sent it there itself. */
  camuId?: string;
  /** Sent to MyCamu by DockIn (not just saved here). */
  sentByDockIn?: boolean;
}

/** One line in the assistant chat. */
export interface AskMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  at: number;
  /** A picture the student sent (e.g. the mail screenshot). */
  image?: Blob;
  /** What the assistant shows under its words. */
  cards?: Card[];
  /** The model's own record of what it asked the app to do (for a live AI's memory). */
  tool?: unknown;
}

export type Card =
  | { kind: "attendance"; overall: Stat | null; subjects: (Stat & { name: string; code: string })[]; target: number; focus?: string }
  | { kind: "whatif"; name: string; before: number; after: number; skip: number; target: number }
  | { kind: "classes"; date: string; label: string; items: { from: string; to: string; name: string; room: string; kind: string }[] }
  | { kind: "mess"; date: string; meals: { meal: string; label: string; items: string }[] }
  | { kind: "tasks"; label: string; items: { id: string; title: string; due: string | null; kind: string }[] }
  | { kind: "confirm"; action: Action; state: "waiting" | "done" | "cancelled"; resultId?: string }
  | { kind: "passes"; ids: string[] }
  | { kind: "open"; screen: string; label: string }
  | { kind: "suggest"; items: string[] };

export interface Stat {
  pct: number | null;
  present: number;
  total: number;
  canMiss: number;
  mustAttend: number;
  state: string;
}

/** Something the assistant wants to do — always shown as a card and confirmed by a tap. */
export type Action =
  | { type: "task"; title: string; dueDate: string | null; dueTime: string | null }
  | { type: "outpass"; draft: PassDraft; proofMsg?: string };

class V3Db extends Dexie {
  passes!: Table<PassRecord, string>;
  ask!: Table<AskMessage, string>;
  constructor() {
    super("dockin-v3");
    this.version(1).stores({
      passes: "id, createdAt, status",
      ask: "id, at",
    });
  }
}

export const v3db = new V3Db();

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
