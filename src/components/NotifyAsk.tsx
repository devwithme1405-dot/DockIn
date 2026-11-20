"use client";

import { useEffect } from "react";
import { DockIn } from "@/lib/native";

/**
 * The one permission DockIn asks for, the way every app does: Android's own
 * "Allow notifications?" dialog, once, right after you get in. On a later
 * launch (never on top of that dialog) it asks once to be left out of battery
 * saving, so reminders and messages keep arriving with the app closed. Nothing
 * here ever asks twice; both can be changed later from Profile.
 */
export function NotifyAsk() {
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const st = await DockIn.status();
        if (!alive) return;
        if (st.notifications === "prompt") {
          await DockIn.requestNotifications();
          window.dispatchEvent(new Event("dockin:notifications"));
          return;
        }
        if (st.notifications === "granted" && st.battery === false) {
          let asked = false;
          try {
            asked = localStorage.getItem("dockin-battery-asked") === "1";
            localStorage.setItem("dockin-battery-asked", "1");
          } catch {
            asked = true;
          }
          if (!asked) await DockIn.openBatterySettings();
        }
      } catch {
        /* an older APK without these calls: nothing to ask */
      }
    }, 1500);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);
  return null;
}
