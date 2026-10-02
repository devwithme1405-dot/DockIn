"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A QR code holding a link. Pointing any phone camera at it opens DockIn with
 * the code already filled in, so there is no scanner to build or permission to ask for.
 * The library is loaded only when this is on screen.
 */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((mod) => {
        // The library is CommonJS, so under ESM its exports arrive on `default`
        // in some bundles and on the namespace itself in others.
        const QR = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
        if (!alive || !ref.current) return;
        return QR.toCanvas(ref.current, value, {
          width: size,
          margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (failed) return null;
  return (
    <div className="inline-block rounded-2xl bg-white p-3" style={{ lineHeight: 0 }}>
      <canvas ref={ref} width={size} height={size} role="img" aria-label="QR code for your DockIn code" />
    </div>
  );
}
