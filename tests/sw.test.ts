import { describe, expect, it } from "vitest";
import { GET } from "@/app/sw.js/route";

/**
 * The service worker is written as text inside a TypeScript file, so a slip in
 * escaping (a regex losing its backslashes) type-checks fine and only breaks on
 * phones — where it would stop offline mode working at all. Parse it here.
 */
describe("service worker", () => {
  it("is valid JavaScript", async () => {
    const src = await GET().text();
    expect(() => new Function(src)).not.toThrow();
  });

  it("finds every kind of file reference when saving the app for offline", async () => {
    const src = await GET().text();
    const re = src.match(/text\.match\((\/.+\/g)\)/)?.[1];
    expect(re).toBeTruthy();
    const found = "a(\"static/chunks/0ab~c-d.js\"),b='static/media/x.woff2',url(/_next/static/css/y.css)".match(
      new Function(`return ${re}`)() as RegExp,
    );
    expect(found).toEqual(["static/chunks/0ab~c-d.js", "static/media/x.woff2", "static/css/y.css"]);
  });
});
