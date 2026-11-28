import { cancelPass } from "@/lib/camu/client";
import { withCamu } from "@/lib/camu/session";
import { body, run } from "@/lib/camu/route";

/** Cancel a pass: { passId }. */
export async function POST(req: Request): Promise<Response> {
  const { passId } = await body<{ passId?: string }>(req);
  return run(req, (userId) => withCamu(userId, (s) => cancelPass(s, String(passId ?? ""))));
}
