/**
 * The smallest possible answer, for the app to tell "online" from "offline or
 * too weak to use" (see lib/net). Never cached, by the phone or anyone between.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export const HEAD = GET;
