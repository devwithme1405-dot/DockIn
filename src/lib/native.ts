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
  /** What was chosen in the payment popup, before the app was even open. */
  answer?: PopupAnswer;
}

/** The payment popup's answer: for me (with a category), for someone, or not a spend. */
export interface PopupAnswer {
  who: "me" | "other" | "ignore";
  category?: string;
  person?: string;
  answeredAt?: number;
}

export type NotifState = "granted" | "denied" | "prompt";

export interface PhoneStatus {
  /** Notification access is switched on, so payments are being read. */
  listening: boolean;
  /** Whether DockIn may post its own notifications (the "where did it go?" prompt). */
  notifications: NotifState;
  /** Whether DockIn may read payment SMS directly (bank debits/credits). */
  sms: NotifState;
  /** Payments waiting in the phone's inbox. */
  pending: number;
  /** "Display over other apps": the payment popup can come up on its own. Missing on older apps. */
  overlay?: boolean;
  /** Left out of battery saving, so detection keeps running with DockIn closed. */
  battery?: boolean;
  /** The quiet "Watching for payments" service is running. */
  guard?: boolean;
  /** Payment apps' "Payment successful" screens are read (Accessibility). */
  screen?: boolean;
  /** Android version number, e.g. 34 for Android 14. */
  sdk: number;
  maker: string;
  version: string;
  build: number;
}

/** One subject as Camu counts it. */
export interface CamuSubject {
  id: string;
  code: string;
  name: string;
  present: number;
  total: number;
  absent: number;
  leave: number;
  duty: number;
  /** Camu's own percentage for the subject. */
  pct: number;
}

/** One scheduled class. Dates and times are Camu's wall-clock, "YYYY-MM-DD" and "HH:MM". */
export interface CamuPeriod {
  date: string;
  from: string;
  to: string;
  name: string;
  code: string;
  subId: string;
  room: string;
  teacher: string;
  kind: string;
  status: string;
}

/** A class that has happened, with whether Camu marked you present. */
export interface CamuClass {
  date: string;
  from: string;
  to: string;
  present: boolean;
  leave: string;
}

export interface CamuHoliday {
  title: string;
  /** First day, "YYYY-MM-DD". */
  start: string;
  /** Camu's end, which is the day after the last holiday. */
  end: string;
}

export interface CamuState {
  connected: boolean;
  /** Camu ended the session; attendance shown is the last good copy. */
  expired?: boolean;
  syncedAt?: number;
  error?: string;
  overall?: { pct: number; present: number; total: number };
  subjects?: CamuSubject[];
  periods?: CamuPeriod[];
  holidays?: CamuHoliday[];
  history?: Record<string, CamuClass[]>;
  historyAt?: number;
}

/** Something on the LMS with a deadline that still needs doing. */
export interface LmsItem {
  id: number;
  instance: number;
  /** "assign", "quiz", … */
  module: string;
  name: string;
  course: string;
  /** Deadline, in seconds since 1970. */
  due: number;
  url: string;
  overdue: boolean;
  action: string;
}

export interface LmsState {
  connected: boolean;
  name?: string;
  syncedAt?: number;
  error?: string;
  items?: LmsItem[];
}

export interface CollegeState {
  camu?: CamuState;
  lms?: LmsState;
  syncedAt?: number;
}

interface DockInPlugin {
  status(): Promise<PhoneStatus>;
  openListenerSettings(): Promise<void>;
  openAppSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  requestNotifications(): Promise<{ notifications: NotifState }>;
  requestSms(): Promise<{ sms: NotifState }>;
  testPrompt(): Promise<{ notifications: NotifState }>;
  pending(): Promise<{ notices: NativeNotice[] }>;
  ack(options: { ids: string[] }): Promise<void>;
  college(): Promise<CollegeState>;
  connectCamu(): Promise<CollegeState>;
  /** Quietly renew an expired Camu session, showing the page only if a tap is needed. */
  renewCamu(): Promise<CollegeState>;
  connectLms(options: { username: string; password: string }): Promise<CollegeState>;
  disconnectCollege(options: { which: "camu" | "lms" }): Promise<CollegeState>;
  syncCollege(options?: { full?: boolean }): Promise<CollegeState>;
  scheduleReminders(options: { items: ReminderItem[] }): Promise<void>;
  openOverlaySettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  /** Xiaomi/Redmi/POCO's own Autostart and background pop-up switches. */
  openOemSettings(options: { which: "autostart" | "popup" }): Promise<void>;
  startGuard(): Promise<void>;
  openScreenSettings(): Promise<void>;
  setPayChoices(options: {
    categories: { id: string; label: string; emoji: string }[];
    people: string[];
  }): Promise<void>;
  appReady(): Promise<void>;
  addListener(event: "notice", fn: (n: NativeNotice) => void): Promise<PluginListenerHandle>;
  addListener(event: "open", fn: (d: { path: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "resume", fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: "college", fn: (s: CollegeState) => void): Promise<PluginListenerHandle>;
}

/** A reminder for the phone to fire at `at` (epoch ms): class, task, attendance. */
export interface ReminderItem {
  id: number;
  at: number;
  title: string;
  body: string;
  path: string;
}

export const DockIn = registerPlugin<DockInPlugin>("DockIn");

/**
 * Tell the phone the first screen is up, so it can drop the launch splash it has
 * been holding. Best-effort: on the web, or if the call fails, nothing happens —
 * the splash there is a web overlay that fades on its own.
 */
export function appReady(): void {
  if (!isNativeApp()) return;
  DockIn.appReady().catch(() => {});
}

/** Hand the phone the whole upcoming set of reminders; it replaces the last set. */
export async function scheduleReminders(items: ReminderItem[]): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await DockIn.scheduleReminders({ items });
  } catch {
    /* older app without the method: ignore */
  }
}

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
export function onPhone(event: "college", fn: (s: CollegeState) => void): () => void;
export function onPhone(event: "notice" | "open" | "resume" | "college", fn: (arg: never) => void): () => void {
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
