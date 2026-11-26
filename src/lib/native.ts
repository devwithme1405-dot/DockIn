/**
 * The phone's side of DockIn, when the site is running inside the Android app.
 *
 * In a browser none of this exists and every function here says so cheaply —
 * `isNativeApp()` is false and the rest are never called. Inside the app, the
 * `DockIn` plugin (android/…/DockInPlugin.java) answers.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NotifState = "granted" | "denied" | "prompt";

export interface PhoneStatus {
  /** Whether DockIn may post its own notifications (class, assignment and exam reminders). */
  notifications: NotifState;
  /** Left out of battery saving, so reminders fire on time with DockIn closed. */
  battery?: boolean;
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

/** One meal of the day's mess menu, as Camu's cafeteria page serves it. */
export interface CamuMeal {
  /** "Breakfast" / "Lunch" / "Snack" / "Dinner". */
  meal: string;
  /** Camu's own label with timing, e.g. "Breakfast 07:30 AM - 09:30 AM". */
  label: string;
  /** The food, exactly as Camu writes it — one item per line, calories and all. */
  items: string;
  color?: string;
}

/** The cafeteria: today's menu and the reusable pass, both read from Camu. */
export interface CamuCafeteria {
  facility?: string;
  /** Camu's own "current date" for the menu, ISO. */
  date?: string;
  meals?: CamuMeal[];
  /** The permanent cafeteria QR's payload, drawn on the phone as the pass. */
  qr?: string;
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
  cafeteria?: CamuCafeteria;
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
  openAppSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  requestNotifications(): Promise<{ notifications: NotifState }>;
  college(): Promise<CollegeState>;
  connectCamu(): Promise<CollegeState>;
  /** Quietly renew an expired Camu session, showing the page only if a tap is needed. */
  renewCamu(): Promise<CollegeState>;
  connectLms(options: { username: string; password: string }): Promise<CollegeState>;
  /** Hand a file in to this student's own LMS assignment (base64 data). Rejects "WEB_ONLY" when the LMS login cannot upload. */
  /** Live site (service worker) or the APK's own copy opens screens. */
  setLive(options: { on: boolean }): Promise<void>;
  /** Newer APK on GitHub? `ready`/`canInstall` come from builds with the v2 updater. */
  checkUpdate(): Promise<{ current: number; latest: number; name: string; ready?: boolean; canInstall?: boolean }>;
  /** Download the newest APK and open the installer (rejects "ALLOW_INSTALL" if not permitted yet, "BUSY" if already at it). */
  installUpdate(): Promise<void>;
  /** The v2 updater (resume, checks, PackageInstaller, progress states). Missing on older builds. */
  updateInfo(): Promise<{ v: number; canInstall: boolean }>;
  /** On Wi-Fi, start downloading the update in the background (v2.1 updater; missing on older builds). */
  prefetchUpdate(): Promise<void>;
  /** Open a document (base64) in the phone's own viewer app. */
  openFile(options: { name: string; mime: string; data: string }): Promise<void>;
  /** status: what the LMS says afterwards ("submitted", "draft", "new"…); missing on older app builds. */
  lmsSubmit(options: { instance: number; cmid?: number; title?: string; name: string; mime: string; data: string }): Promise<{ status?: string } | void>;
  /** A page of HTML as an A4 PDF (base64), with no dialog. Added in the solution-sharing build. */
  htmlToPdf(options: { html: string }): Promise<{ data: string }>;
  /** Open Camu, signed in, at a path, with a note in the top bar. */
  openCamu(options: { path?: string; note?: string; proofData?: string; proofName?: string }): Promise<void>;
  /** The phone's share sheet (WhatsApp, SMS…). Preview APK 3.0 and later. */
  shareText(options: { text: string; title?: string }): Promise<void>;
  clearCamuCaptured(): Promise<void>;
  /** Preview APK: can DockIn submit a pass to MyCamu itself? */
  camuCanMakePass(): Promise<{ ok: boolean }>;
  /** Preview APK: submits a Day Out Pass to MyCamu and checks it is listed. */
  camuDayOut(options: { date: string; from: string; to: string; reason: string }): Promise<{ made: boolean; code?: string; record?: string; raw?: string }>;
  /** Preview APK: MyCamu's own list of passes and leaves (JSON). */
  camuPasses(): Promise<{ items: string }>;
  /** JSON array (as text) of the requests the Camu page sent while open in DockIn. */
  camuCaptured(): Promise<{ items: string; picked?: string; writes?: string }>;
  disconnectCollege(options: { which: "camu" | "lms" }): Promise<CollegeState>;
  syncCollege(options?: { full?: boolean }): Promise<CollegeState>;
  scheduleReminders(options: { items: ReminderItem[] }): Promise<void>;
  openBatterySettings(): Promise<void>;
  /** The phone maker's own run-in-background screens, so reminders keep firing. */
  openOemSettings(options: { which: "autostart" | "battery" }): Promise<void>;
  appReady(): Promise<void>;
  /** What another app shared into DockIn (once; empty when nothing waits). */
  takeShare(): Promise<SharedIn>;
  /** A piece of a shared file, base64. */
  readShared(options: { path: string; offset: number; length: number }): Promise<{ data: string }>;
  clearShared(): Promise<void>;
  /** What this build's push handling can do ('data1' = shows chat pushes itself, sends ✓✓). */
  pushCaps(): Promise<{ caps?: string }>;
  /** The chat on screen (null: none) — not notified, and its notification cleared. */
  setOpenChat(options: { thread: string | null }): Promise<void>;
  /** The numbers home-screen widgets show (JSON text); the phone redraws them. */
  setWidgets(options: { data: string }): Promise<void>;
  /** "preview" on the DockIn 3 test APK; missing on builds before it. */
  channel(): Promise<{ channel: string; speech?: boolean }>;
  /** Listen once in a language ("en-IN", "hi-IN"…): results come as "speech" events. Rejects MIC_DENIED / NO_SPEECH. */
  listen(options: { lang: string }): Promise<void>;
  /** Done talking: keep what was heard. */
  finishListening(): Promise<void>;
  stopListening(): Promise<void>;
  speak(options: { text: string; lang: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
  addListener(event: "speech", fn: (e: SpeechEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: "speak", fn: (e: { type: "start" | "done" | "error" }) => void): Promise<PluginListenerHandle>;
  addListener(event: "share", fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: "open", fn: (d: { path: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "resume", fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: "college", fn: (s: CollegeState) => void): Promise<PluginListenerHandle>;
  addListener(event: "updateProgress", fn: (p: { percent: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: "updateState", fn: (p: { state: UpdateState; message?: string }) => void): Promise<PluginListenerHandle>;
}

/** What the phone's speech recogniser reports while listening. */
export type SpeechEvent =
  | { type: "state"; state: "ready" | "speaking" | "processing" }
  | { type: "level"; level: number }
  | { type: "partial" | "final"; text: string }
  | { type: "error"; code: string };

/** Text, a link or documents shared into DockIn from another app. */
export interface SharedIn {
  text?: string;
  subject?: string;
  files?: { name: string; type: string; size: number; path: string }[];
  /** Files left out (images, too big, unreadable). */
  skipped?: number;
}

/** Where an in-app update is, as the v2 updater reports it. */
export type UpdateState = "downloading" | "verifying" | "installing" | "confirm" | "done" | "failed";

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
export function onPhone(event: "open", fn: (d: { path: string }) => void): () => void;
export function onPhone(event: "resume", fn: () => void): () => void;
export function onPhone(event: "college", fn: (s: CollegeState) => void): () => void;
export function onPhone(event: "share", fn: () => void): () => void;
export function onPhone(event: "open" | "resume" | "college" | "share", fn: (arg: never) => void): () => void {
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

/** Takes whatever was shared into DockIn, if anything (older app: nothing). */
export async function takeShare(): Promise<SharedIn | null> {
  if (!isNativeApp()) return null;
  try {
    const s = await DockIn.takeShare();
    return s && (s.text || s.files?.length || s.skipped) ? s : null;
  } catch {
    return null;
  }
}

/** A shared file, read from the phone in 1 MB pieces. */
export async function readSharedFile(f: { name: string; type: string; size: number; path: string }): Promise<File> {
  const parts: BlobPart[] = [];
  const step = 1 << 20;
  for (let at = 0; at < f.size; at += step) {
    const { data } = await DockIn.readShared({ path: f.path, offset: at, length: step });
    if (!data) break;
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    parts.push(bytes);
  }
  return new File(parts, f.name, { type: f.type || "application/octet-stream" });
}

export function clearShared(): void {
  if (isNativeApp()) DockIn.clearShared().catch(() => {});
}

/** Hands the widgets their numbers. Older app without widgets: nothing happens. */
export function setWidgets(data: unknown): void {
  if (!isNativeApp()) return;
  DockIn.setWidgets({ data: JSON.stringify(data) }).catch(() => {});
}

/** Tells the phone which chat is on screen, so it isn't notified about it (null: none). */
export function setOpenChat(thread: string | null): void {
  if (!isNativeApp()) return;
  DockIn.setOpenChat({ thread }).catch(() => {});
}
