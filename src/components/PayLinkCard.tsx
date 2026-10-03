"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Radio, Trash2 } from "lucide-react";
import { PaymentError, linkedDevices, unlinkDevice } from "@/lib/payments";
import { ConfirmSheet, cx, useToast } from "./ui";

/**
 * Payment detection, as one switch.
 *
 * There used to be a "link this phone" button here that minted a token and
 * bounced it to the app through a link. It was a correct design and a bad one:
 * everyone who wanted the feature first had to be taught what a device token
 * is. The phone now pairs itself when the app opens the site, so all that is
 * left here is the one permission Android will not let any app grant itself,
 * and one tap to go and grant it.
 */
export function PayLinkCard() {
  const toast = useToast();
  const [devices, setDevices] = useState<
    { id: string; label: string | null; lastSeen: string | null }[] | null
  >(null);
  const [dropping, setDropping] = useState<string | null>(null);

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

  const paired = (devices ?? []).length > 0;
  const sending = (devices ?? []).some((d) => d.lastSeen);
  const onAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

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

  return (
    <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">
        Payments from your phone
      </h2>

      <div className="flex items-start gap-3">
        <span
          className={cx(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            sending ? "bg-accent-soft text-accent" : "bg-surface-2 text-text",
          )}
        >
          <Radio size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">
            {sending ? "Watching for payments" : "Spot payments automatically"}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {sending
              ? "Each one waits on your Money screen until you tap to add it. Nothing is ever added on its own."
              : "DockIn can read what GPay, PhonePe, Paytm and your bank put in your notification bar, and offer each payment on the Money screen for one tap. Account numbers never leave the phone."}
          </p>
        </div>
      </div>

      {onAndroid && (
        <a
          href="dockin://notifications"
          className={cx(
            "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium",
            sending ? "bg-surface-2 text-text" : "bg-accent text-on-accent",
          )}
        >
          <Check size={17} />
          {sending ? "Change the permission" : "Turn it on"}
        </a>
      )}

      <p className="mt-2 text-center text-[12.5px] text-muted">
        {!onAndroid
          ? "Open DockIn on your Android phone to switch this on."
          : paired
            ? "Android asks you to switch DockIn on in its own list. That is the only step."
            : "Open this in the DockIn app on your phone, signed in, and it pairs itself."}
      </p>

      {paired && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {(devices ?? []).map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{d.label ?? "Phone"}</p>
                <p className="text-[12.5px] text-muted">
                  {d.lastSeen
                    ? `Last payment seen ${new Date(d.lastSeen).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}`
                    : "Paired, waiting for the permission"}
                </p>
              </div>
              <button
                onClick={() => setDropping(d.id)}
                aria-label={`Stop ${d.label ?? "this phone"} sending payments`}
                className="grid size-9 shrink-0 place-items-center rounded-full text-danger"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmSheet
        open={!!dropping}
        title="Stop this phone sending payments?"
        confirmLabel="Stop"
        onConfirm={() => dropping && drop(dropping)}
        onClose={() => setDropping(null)}
      >
        <p>
          Nothing already on your Money screen changes. That phone stops forwarding payments until
          you open DockIn on it again.
        </p>
      </ConfirmSheet>
    </section>
  );
}
