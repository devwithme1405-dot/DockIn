"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Radio, Smartphone, Trash2 } from "lucide-react";
import { PaymentError, linkDevice, linkedDevices, unlinkDevice } from "@/lib/payments";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { ConfirmSheet, cx, useToast } from "./ui";

/**
 * Letting the Android app watch payment notifications.
 *
 * The phone has no login of its own, so this is the handover: the web app, which
 * is signed in, asks the server for a one-time token and passes it to the app
 * through a link only the app can open. The browser never keeps the token and
 * the server keeps only its hash.
 *
 * Everything here is deliberately reversible and visible — which phones are
 * listening, when each last reported, and one tap to cut one off — because a
 * feature that reads notifications has to be easy to switch off or people are
 * right not to switch it on.
 */
export function PayLinkCard() {
  const toast = useToast();
  const [devices, setDevices] = useState<
    { id: string; label: string | null; lastSeen: string | null }[] | null
  >(null);
  const [dropping, setDropping] = useState<string | null>(null);
  // The token is fetched before anyone taps, on purpose — see below.
  const [token, setToken] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices(await linkedDevices());
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

  /**
   * The token is minted when this card appears, not when the button is pressed.
   *
   * Opening another app is only allowed while the browser still considers the
   * tap to be happening. Asking the server for a token first spends that tap on
   * a network round trip, and by the time the answer arrives Chrome quietly
   * refuses to open anything — the button appears to do nothing at all. Having
   * the token in hand beforehand makes the tap an ordinary link, which is also
   * why it is a real link below rather than a button that navigates.
   *
   * Minting one that is never used costs nothing: re-linking replaces it.
   */
  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        setToken(await linkDevice("This phone"));
      } catch (e) {
        setProblem(e instanceof PaymentError ? e.message : "Could not prepare the link.");
      }
    });
  }, []);

  // The app is handed the project address and public key along with the token,
  // so nothing about this Supabase project is baked into the APK. The intent:
  // form is what Android understands best: it names the app outright, and says
  // where to send someone who does not have it yet.
  const deepLink = (() => {
    if (!token) return null;
    const q = new URLSearchParams({ u: SUPABASE_URL ?? "", k: SUPABASE_KEY ?? "" });
    const fallback = encodeURIComponent(
      "https://github.com/devwithme1405-dot/DockIn/releases/latest",
    );
    return (
      `intent://pay/${token}?${q}#Intent;scheme=dockin;package=com.dockin.app;` +
      `S.browser_fallback_url=${fallback};end`
    );
  })();

  async function drop(id: string) {
    try {
      await unlinkDevice(id);
      setDevices((cur) => (cur ?? []).filter((d) => d.id !== id));
      toast.show("That phone has stopped sending payments");
    } catch (e) {
      toast.show(e instanceof PaymentError ? e.message : "Could not unlink that.");
    }
    setDropping(null);
  }

  const linked = devices ?? [];

  return (
    <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">
        Payments from your phone
      </h2>

      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-text">
          <Radio size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Spot payments automatically</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            The DockIn app reads the notifications GPay, PhonePe, Paytm and your bank post, and puts
            each payment in a tray on the Money screen. Nothing is added until you tap it, and
            account numbers are stripped on the phone before anything is sent.
          </p>
        </div>
      </div>

      {linked.length > 0 && (
        <ul className="mt-3.5 divide-y divide-line border-t border-line">
          {linked.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-safe">
                <Smartphone size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium">{d.label ?? "Phone"}</p>
                <p className="text-[12.5px] text-muted">
                  {d.lastSeen
                    ? `Last sent ${new Date(d.lastSeen).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}`
                    : "Linked, nothing sent yet"}
                </p>
              </div>
              <button
                onClick={() => setDropping(d.id)}
                aria-label={`Unlink ${d.label ?? "this phone"}`}
                className="grid size-9 shrink-0 place-items-center rounded-full text-danger"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <a
        href={deepLink ?? undefined}
        aria-disabled={!deepLink}
        onClick={() => window.setTimeout(load, 3000)}
        className={cx(
          "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full",
          "bg-accent text-[15px] font-medium text-on-accent",
          !deepLink && "pointer-events-none opacity-60",
        )}
      >
        {deepLink ? <Check size={17} /> : <Loader2 size={17} className="animate-spin" />}
        {linked.length > 0 ? "Link this phone again" : "Link this phone"}
      </a>

      <p className="mt-2 text-center text-[12.5px] text-muted">
        {!android
          ? "Only the Android app can do this. On a computer there is nothing to link."
          : "Android will ask you to switch DockIn on in its notification-access list."}
      </p>
      {problem && <p className="mt-2 text-center text-[13px] text-danger">{problem}</p>}

      <ConfirmSheet
        open={!!dropping}
        title="Stop this phone sending payments?"
        confirmLabel="Unlink"
        onConfirm={() => dropping && drop(dropping)}
        onClose={() => setDropping(null)}
      >
        <p>
          Nothing already in your Money screen changes. The app on that phone will stop forwarding
          payments until you link it again.
        </p>
      </ConfirmSheet>
    </section>
  );
}
