import { passes } from "@/lib/camu/client";
import { withCamu } from "@/lib/camu/session";
import { run } from "@/lib/camu/route";

/** This student's gate passes / leaves. */
export async function GET(req: Request): Promise<Response> {
  return run(req, (userId) => withCamu(userId, (s) => passes(s)));
}
