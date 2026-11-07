/**
 * The phone's side of DockIn, when the site is running inside the Android app.
 *
 * In a browser none of this exists and every function here says so cheaply —
 * `isNativeApp()` is false and the rest are never called. Inside the app, the
 * `DockIn` plugin (android/…/DockInPlugin.java) answers.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** One payment notification as the phone kept it, account numbers already removed. */
export interface NativeNotice {
  id: string;
  /** Android package that posted it. */
  app: string;
  title: string;
  body: string;
  /** When it was posted, in ms. */
  at: number;
}

export type NotifState = "granted" | "denied" | "prompt";

export interface PhoneStatus {
  /** Notification access is switched on, so payments are being read. */
  listening: boolean;
  /** Whether DockIn may post its own notifications (the "where did it go?" prompt). */
  notifications: NotifState;
  /** Payments waiting in the phone's inbox. */
  pending: number;
  /** Android version number, e.g. 34 for Android 14. */
  sdk: number;
  maker: string;
  version: string;
  build: number;
}

interface DockInPlugin {
  status(): Promise<PhoneStatus>;
  openListenerSettings(): Promise<void>;
  openAppSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  requestNotifications(): Promise<{ notifications: NotifState }>;
  testPrompt(): Promise<{ notifications: NotifState }>;
  pending(): Promise<{ notices: NativeNotice[] }>;
  ack(options: { ids: string[] }): Promise<void>;
  addListener(event: "notice", fn: (n: NativeNotice) => void): Promise<PluginListenerHandle>;
  addListener(event: "open", fn: (d: { path: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "resume", fn: () => void): Promise<PluginListenerHandle>;
}

export const DockIn = registerPlugin<DockInPlugin>("DockIn");

/** True inside the Android app, false in any browser. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("DockIn");
  } catch {
    return false;
  }
}

/**
 * Subscribes to a plugin event and returns a plain cleanup function, which is
 * what a React effect wants. Safe to call outside the app: it does nothing.
 */
export function onPhone(event: "notice", fn: (n: NativeNotice) => void): () => void;
export function onPhone(event: "open", fn: (d: { path: string }) => void): () => void;
export function onPhone(event: "resume", fn: () => void): () => void;
export function onPhone(event: "notice" | "open" | "resume", fn: (arg: never) => void): () => void {
  if (!isNativeApp()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let gone = false;
  void (DockIn.addListener as (e: string, f: (arg: never) => void) => Promise<PluginListenerHandle>)(event, fn)
    .then((h) => {
      if (gone) void h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    gone = true;
    if (handle) void handle.remove();
  };
}
