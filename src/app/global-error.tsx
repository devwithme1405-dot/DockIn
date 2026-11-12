"use client";

import { useEffect } from "react";

/**
 * The last line of defence: an error thrown in the root layout itself, above
 * every route boundary. It must bring its own <html>/<body> and cannot rely on
 * the app's stylesheet, so the look is hand-written and deliberately plain. The
 * job here is only that the app is never a blank, unrecoverable screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dockin] app crashed:", error);
  }, [error]);

  const hardReset = () => {
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      }
      if ("caches" in window) {
        caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).finally(() => location.reload());
        return;
      }
    } catch {}
    location.reload();
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f2e4cb",
          color: "#2a1c10",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "360px",
            textAlign: "center",
            background: "#fbf3e2",
            border: "1px solid #e4d2b0",
            borderRadius: "22px",
            padding: "28px 22px",
            boxShadow: "0 10px 30px rgba(80,50,20,0.12)",
          }}
        >
          <div style={{ fontSize: "34px", lineHeight: 1 }}>⚠️</div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, margin: "14px 0 6px" }}>DockIn needs a restart</h1>
          <p style={{ fontSize: "14px", color: "#7a6a4f", margin: "0 0 20px" }}>
            Something went wrong while starting up. Your data is safe.
          </p>
          <button
            onClick={reset}
            style={{
              height: "48px",
              width: "100%",
              borderRadius: "16px",
              border: "none",
              background: "#8a4a1e",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 700,
            }}
          >
            Try again
          </button>
          <button
            onClick={hardReset}
            style={{
              height: "44px",
              width: "100%",
              marginTop: "10px",
              borderRadius: "16px",
              border: "none",
              background: "transparent",
              color: "#7a6a4f",
              fontSize: "13.5px",
              fontWeight: 600,
            }}
          >
            Still stuck? Reset the app
          </button>
        </div>
      </body>
    </html>
  );
}
