import { messMenu, messQr } from "@/lib/camu/client";
import { withCamu } from "@/lib/camu/session";
import { run } from "@/lib/camu/route";

/** Today's mess menu and the student's permanent cafeteria QR. */
export async function GET(req: Request): Promise<Response> {
  return run(req, (userId) =>
    withCamu(userId, async (s) => ({ menu: await messMenu(s), qr: await messQr(s).catch(() => null) })),
  );
}
