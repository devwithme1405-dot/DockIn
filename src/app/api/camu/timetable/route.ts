import { timetable } from "@/lib/camu/client";
import { withCamu } from "@/lib/camu/session";
import { run } from "@/lib/camu/route";

/** The week's timetable: ?from=ISO&to=ISO. */
export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const from = u.searchParams.get("from") ?? "";
  const to = u.searchParams.get("to") ?? "";
  return run(req, (userId) => withCamu(userId, (s) => timetable(s, from, to)));
}
