import { subjectHistory } from "@/lib/camu/client";
import { withCamu } from "@/lib/camu/session";
import { body, run } from "@/lib/camu/route";

/** Every class of one subject this semester: { subjectId }. */
export async function POST(req: Request): Promise<Response> {
  const { subjectId } = await body<{ subjectId?: string }>(req);
  return run(req, (userId) => withCamu(userId, (s) => subjectHistory(s, String(subjectId ?? ""))));
}
