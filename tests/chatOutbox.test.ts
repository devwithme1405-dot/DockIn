import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A pretend Supabase: what the next message insert does, and every insert seen. */
const server = {
  mode: "ok" as "ok" | "network" | "refuse" | "lostAnswer",
  rows: new Map<string, Record<string, unknown>>(),
  inserts: [] as string[],
  session: true,
};

function messagesTable() {
  return {
    upsert(row: Record<string, unknown>) {
      return {
        abortSignal: async () => {
          server.inserts.push(row.id as string);
          if (server.mode === "network") return { error: { message: "TypeError: Failed to fetch", code: "" } };
          if (server.mode === "refuse") return { error: { message: "new row violates row-level security policy", code: "42501" } };
          // Duplicate ids are ignored, like ON CONFLICT DO NOTHING.
          if (!server.rows.has(row.id as string)) server.rows.set(row.id as string, { ...row, author: "me", created_at: new Date().toISOString(), deleted_at: null });
          if (server.mode === "lostAnswer") return { error: { message: "Failed to fetch", code: "" } };
          return { error: null };
        },
      };
    },
    select() {
      return {
        eq: (_k: string, id: string) => ({
          abortSignal: () => ({ maybeSingle: async () => ({ data: server.rows.get(id) ?? null, error: null }) }),
        }),
      };
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => {
        if (!server.session) throw new TypeError("Failed to fetch"); // refreshing the token needs the network
        return { data: { session: { user: { id: "me" } } } };
      },
    },
    from: (t: string) => (t === "messages" ? messagesTable() : { upsert: async () => ({ error: null }) }),
    rpc: () => ({ abortSignal: async () => ({ error: null }) }),
  }),
}));
vi.mock("@/lib/push", () => ({ notifyPush: vi.fn() }));

const { db } = await import("@/lib/db");
const chat = await import("@/lib/chat");

beforeEach(async () => {
  await db.messages.clear();
  server.mode = "ok";
  server.rows.clear();
  server.inserts = [];
  server.session = true;
});

const mine = async () => (await db.messages.toArray()).filter((m) => m.author === "me");

describe("chat outbox", () => {
  it("no network: the message stays on the phone, waiting (never lost, never 'failed')", async () => {
    server.mode = "network";
    await chat.sendMessage("d:a:me", "kal lab hai?");
    await chat.flushOutbox();
    const [m] = await mine();
    expect(m.body).toBe("kal lab hai?");
    expect(m.pending).toBe(true);
    expect(m.failed).toBeFalsy();
  });

  it("network back: the same message goes, once", async () => {
    server.mode = "network";
    await chat.sendMessage("d:a:me", "hello");
    await chat.flushOutbox();
    server.mode = "ok";
    await chat.flushOutbox();
    const [m] = await mine();
    expect(m.pending).toBeFalsy();
    expect(server.rows.size).toBe(1);
    expect(new Set(server.inserts).size).toBe(1); // every try used the same id
  });

  it("the server got it but the answer was lost: trying again makes no second copy", async () => {
    server.mode = "lostAnswer";
    await chat.sendMessage("d:a:me", "sent?");
    await chat.flushOutbox();
    server.mode = "ok";
    await chat.flushOutbox();
    expect(server.inserts.length).toBe(2);
    expect(server.rows.size).toBe(1);
    expect((await mine()).length).toBe(1);
  });

  it("the server refuses it: 'tap to retry', and retry sends the same message", async () => {
    server.mode = "refuse";
    await chat.sendMessage("d:a:me", "hmm");
    await chat.flushOutbox();
    let [m] = await mine();
    expect(m.failed).toBe(true);
    server.mode = "ok";
    await chat.retryMessage(m);
    [m] = await mine();
    expect(m.failed).toBeFalsy();
    expect(m.pending).toBeFalsy();
    expect(server.rows.has(m.id)).toBe(true);
  });

  it("messages go in the order they were written", async () => {
    server.mode = "network";
    await chat.sendMessage("d:a:me", "one");
    await new Promise((r) => setTimeout(r, 5));
    await chat.sendMessage("d:a:me", "two");
    await chat.flushOutbox();
    server.mode = "ok";
    server.inserts = [];
    await chat.flushOutbox();
    const byId = new Map((await mine()).map((m) => [m.id, m.body]));
    expect(server.inserts.map((id) => byId.get(id))).toEqual(["one", "two"]);
  });
});
