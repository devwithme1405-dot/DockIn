import { createDayOut, createLeave } from "@/lib/camu/client";
import { withCamu } from "@/lib/camu/session";
import { body, run } from "@/lib/camu/route";

/** Make an outpass: { kind:"dayout", day, from, to, reason } or { kind:"leave", ... }. */
export async function POST(req: Request): Promise<Response> {
  const b = await body<Record<string, string>>(req);
  return run(req, (userId) =>
    withCamu(userId, (s) =>
      b.kind === "leave"
        ? createLeave(s, { fromDay: b.fromDay, from: b.from, toDay: b.toDay, to: b.to, reason: b.reason, fileName: b.fileName, attId: b.attId, atchId: b.atchId })
        : createDayOut(s, { day: b.day, from: b.from, to: b.to, reason: b.reason }),
    ),
  );
}
