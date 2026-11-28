import { attendance } from "@/lib/camu/client";
import { withCamu } from "@/lib/camu/session";
import { run } from "@/lib/camu/route";

/** Overall and per-subject attendance. */
export async function GET(req: Request): Promise<Response> {
  return run(req, (userId) => withCamu(userId, (s) => attendance(s)));
}
