/**
 * What changed in DockIn, newest first — shown in Profile → Updates.
 *
 * `app: true` means the change is inside the Android app itself, so it only
 * arrives with the app update (Profile → Updates → Update). Everything else
 * reaches every phone by itself the next time DockIn opens.
 *
 * Add the newest entry at the top when shipping. Keep the words plain: what a
 * student will notice, not how it was built.
 */

export interface Release {
  /** yyyy-mm-dd */
  date: string;
  title: string;
  items: string[];
  /** Needs the app update (not just reopening DockIn). */
  app?: boolean;
}

export const RELEASES: Release[] = [
  {
    date: "2026-11-23",
    title: "LMS hand-in that just works",
    app: true,
    items: [
      "Submitting to the LMS first confirms the assignment with the LMS itself, so the file always goes to the right one (fixes “Can't find data record in database table assign”).",
      "If the network drops half-way, the hand-in is retried by itself.",
      "Forwarded documents now open for the people you forward them to.",
      "Name swap in PDFs never writes the new name in a guessed place, and course codes like CSET207 are never mistaken for an enrollment number.",
      "This Updates page: what's new, what's coming, and whether your app is up to date.",
    ],
  },
  {
    date: "2026-11-23",
    title: "Widgets and ticks",
    app: true,
    items: [
      "Home-screen widgets in DockIn's leather-and-paper look, with a Light / Dark / System choice.",
      "Mess pass widget opens the QR full screen, instantly, even offline.",
      "New Friends widget.",
      "Grey ✓✓ (delivered) now comes straight from the notification, like WhatsApp.",
      "Notifications that don't get missed: one per chat, last few messages, silent for the chat you have open.",
      "LMS hand-in and multi-MB shared files fixed.",
    ],
  },
  {
    date: "2026-11-22",
    title: "Chat that never loses a message",
    app: true,
    items: [
      "Messages wait with 🕓 on a bad network and go by themselves later — never lost, never sent twice.",
      "WhatsApp-style ticks: sent ✓, delivered ✓✓, read in blue.",
      "Share files from any app straight into DockIn (“Send on DockIn”).",
      "Home-screen widgets: attendance, next class, today's classes, tasks, mess menu, mess pass.",
      "Shared tasks update for everyone when the sender changes them; send later; Compare invites.",
      "Task reminders: once, daily, on chosen days, or before the deadline.",
      "Offline only when there is really no network; weak Wi-Fi just shows “Low network”.",
    ],
  },
  {
    date: "2026-11-21",
    title: "Offline mode and stronger updates",
    app: true,
    items: [
      "DockIn notices when you're offline, keeps working, and tells you when you're back.",
      "Mess pass works offline.",
      "In-app updates resume on a weak line and check the download before installing.",
      "Only the real LMS (practice LMS removed), and no guessed timetable days.",
      "Friends of friends, exact-time reminders, deleted tasks stay deleted.",
      "Security and speed work so a whole campus can use it.",
    ],
  },
  {
    date: "2026-11-20",
    title: "DockIn 2.0",
    items: [
      "New welcome slides, sign-in and setup — always in light mode on first run.",
      "Assignment solutions: send a Word or PDF file as the answer to an LMS assignment; friends put their own name on it and submit in one tap.",
      "Each friend sees only their own LMS status on the card.",
      "Compare with friends: attendance podium, shared tasks, trip planner, who's free now.",
      "Timetable keeps every past day Camu showed, not just the last week.",
      "Chat themes, photo cropper, smoother screens, lite mode for budget phones.",
      "No more “Web page not available” — DockIn shows its own retry page.",
    ],
  },
  {
    date: "2026-11-19",
    title: "Friends",
    app: true,
    items: [
      "Friends tab: add by QR, 1:1 chats and groups, polls, documents, reactions, reply, edit, forward, delete.",
      "Seen, typing and online, like WhatsApp and Instagram.",
      "Hand in to the LMS from DockIn with your own login.",
      "Updates from inside the app, and every screen ships inside the APK — no brown screen on open.",
      "Bunk calculator inside each subject; LMS tasks show their course.",
    ],
  },
  {
    date: "2026-11-13",
    title: "Cafeteria",
    items: ["Today's mess menu and your reusable mess pass, straight from Camu.", "Faster tabs that never hang on a slow network."],
  },
  {
    date: "2026-11-09",
    title: "Profile and reminders",
    items: [
      "New Profile with a big photo and settings by category.",
      "Attendance at a glance, task history, class-aware reminders.",
      "Faster and safer for many students at once.",
    ],
  },
  {
    date: "2026-11-08",
    title: "The notebook look",
    items: [
      "The paper-notebook design across Today, Attendance, Tasks and Timetable.",
      "Username + password sign-in.",
      "Trip calculator and holidays in Timetable; the real last teaching day (3 Dec).",
      "Mark a class Camu left unmarked as cancelled or teacher-pending.",
    ],
  },
  {
    date: "2026-11-07",
    title: "DockIn becomes an Android app",
    app: true,
    items: ["Camu attendance and timetable, and LMS deadlines, filled in by themselves.", "Attendance log and calendar."],
  },
];

/** Planned — not built yet. Honest about it: nothing here has a date. */
export const COMING: { title: string; sub: string }[] = [
  { title: "DockIn on the Play Store", sub: "No more “unsafe app” warning when installing." },
  { title: "iPhone", sub: "For now iPhone users can use dock-in.vercel.app in Safari." },
  { title: "LMS hand-in for website-only logins", sub: "Today these open the LMS page to upload there." },
];

/** "23 Nov 2026" */
export function releaseDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** A key for the newest release, to show a "New" mark until it has been seen. */
export const LATEST = `${RELEASES[0].date}:${RELEASES[0].title}`;
