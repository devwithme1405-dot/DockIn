import { beforeAll, describe, expect, it, vi } from "vitest";

const calls: unknown[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: async (name: string, args: unknown) => (calls.push([name, args]), { error: null }) }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";

let POST: (r: Request) => Promise<Response>;
let ticket: (s: string, u: string, t: string, a: string) => string;
beforeAll(async () => {
  ({ POST } = await import("@/app/api/delivered/route"));
  ({ deliveryTicket: ticket } = await import("@/lib/pushTicket"));
});

const at = () => new Date().toISOString();
const req = (b: unknown) => new Request("http://x/api/delivered", { method: "POST", body: JSON.stringify(b) });

describe("delivery receipts (✓✓ from a notification)", () => {
  it("a receipt signed by the server marks that person's thread delivered", async () => {
    const when = at();
    const res = await POST(req({ uid: "u1", thread: "d:u1:u2", at: when, sig: ticket("service-secret", "u1", "d:u1:u2", when) }));
    expect(res.status).toBe(200);
    expect(calls.at(-1)).toEqual(["mark_delivered_for", { p_user: "u1", p_thread: "d:u1:u2", p_at: new Date(when).toISOString() }]);
  });

  it("a made-up or altered receipt is refused", async () => {
    const n = calls.length;
    const when = at();
    const good = ticket("service-secret", "u1", "d:u1:u2", when);
    expect((await POST(req({ uid: "u1", thread: "d:u1:u2", at: when, sig: "nope" }))).status).toBe(403);
    // Someone else's thread with a receipt for mine:
    expect((await POST(req({ uid: "u1", thread: "g:other", at: when, sig: good }))).status).toBe(403);
    expect((await POST(req({ uid: "u3", thread: "d:u1:u2", at: when, sig: good }))).status).toBe(403);
    expect(calls.length).toBe(n);
  });

  it("junk is a 400", async () => {
    expect((await POST(req({ uid: 1 }))).status).toBe(400);
  });
});
