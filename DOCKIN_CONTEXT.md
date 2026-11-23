# DockIn — full context for a new chat

Paste this at the start of a new chat (or point Claude at it). It covers what DockIn is, how the code is laid out, how work reaches the Mac, what has been built, and what is still open.

## Who and how to work

- **Owner:** Harshit (B.Tech CSE (AI), Bennett University, 2nd year). The app code lives on his friend Sachin's Mac: `~/Desktop/Self Attendance App` (a git repo). Harshit does `git commit` / `git push` himself.
- **Language:** reply in casual Hinglish. Write code, comments and UI text in English.
- **Ask first:** don't start new work without asking. An explicit request is a go-ahead.
- **File changes:** when giving file changes for him to apply by hand, give full-file replacements, not snippets.
- **Secrets:** never use or commit secrets. Don't copy the cloud `.env.local` to the Mac. The PAT in the git remote should be rotated; don't use it.
- **Formatting:** never run prettier (there's no prettier config; it reformats whole files).

## What DockIn is

A college "super app" for Bennett students. It is an Android app (Capacitor 8 WebView) that loads the live site **https://dock-in.vercel.app** (Next.js 16 on Vercel). An iPhone version (PWA plus a Camu Shortcut bridge) was discussed and postponed ("iphone wala baad m").

Main tabs:
- **Today**
- **Attendance:** Camu sync, what-if, subject pages.
- **Timetable**
- **Cafeteria:** Camu mess menu and the mess pass QR.
- **Tasks:** assignments, exams, quizzes; LMS-synced; reminders; sharing.
- **Friends:** chats, groups, polls, files, shared tasks, Compare, assignment-solution sharing with name swap.
- **Profile / Settings**

## Tech and architecture

**Web (`src/`):**
- Next.js 16 app router. Read `node_modules/next/dist/docs/` before using Next APIs (see AGENTS.md).
- **Local-first data:** Dexie IndexedDB (`src/lib/db.ts`), synced to Supabase via `src/lib/sync.ts`. Each record is stored as JSON in `sync_records`, so new fields sync without schema changes.
- **Supabase:** auth, RLS tables, realtime, storage bucket `chat-files`. Migrations live in `supabase/migrations/0001…0027` and are run by hand in the Supabase SQL editor.
- **Chat (`src/lib/chat.ts`):**
  - **Outbox:** a message is saved on the phone first (`pending`, 🕓), then sent by `flushOutbox()` with the same id every try. The server ignores duplicates (`upsert … ignoreDuplicates`).
  - **Retries:** with backoff, and again on `online`, back-online and app-visible.
  - **Identity without the network:** `whoIsSignedIn()` falls back to the saved Supabase session, so a weak line never looks like "signed out".
  - **Pulls:** overlap 5 minutes (`OVERLAP`) so no message slips between pulls. Each pull also fetches edits and deletes. Reactions, votes and names are re-pulled in full every 5 minutes. Realtime runs only while the app is visible (`whileVisible`), and every (re)connect triggers a catch-up pull.
  - **Ticks:** 🕓 waiting → ✓ on server → grey ✓✓ delivered (`thread_reads.delivered_at`) → blue ✓✓ read (`thread_reads.read_at`).
  - **Delivered marks:** set by the receiving app (`mark_delivered` RPC) and, from APK v-next, natively the moment the push lands (see Push).
  - **Shared tasks:** a ChatTask with `origin = "<sender>:<taskId>"` and a `rev`. Sending changes bumps `rev`, and receivers update their copy in place (`absorbSharedTasks`) instead of getting a second task. Tasks remember `sharedWith` and `shareRev`; received tasks carry `origin` and `originRev`.
  - **Compare invite:** a text message with `data.invite = "compare"`, rendered as a card with a button that opens Compare on its sharing switches.
- **Network (`src/lib/net.ts`):** offline mode only when there's truly no network. Either the connection fails outright 3 times, or nothing answers for 2 minutes (it keeps re-checking while silent and visible). Weak or slow Wi-Fi stays online and, after several weak moments, shows a "Low network detected multiple times" prompt. Back online happens by itself.
- **Push (`src/lib/push.ts`, `src/app/api/push/route.ts`, `src/app/api/delivered/route.ts`):**
  - **Phone side:** a queued request (localStorage) to `/api/push`, retried until the server answers. The server accepts only messages under 10 minutes old.
  - **Server side:** checks the sender, finds the recipients' tokens, and retries Firebase's temporary errors (429/5xx).
  - **Two kinds of phone:** tokens with `caps = 'data1'` (new APK) get a **data push** (kind `note`) that DockIn shows itself (`DockInMessaging` / `Notes.java`): one notification per chat, last 6 lines stacked, deduped, and silent for the chat that's open. These also carry an HMAC-signed delivery receipt (`src/lib/pushTicket.ts`, keyed by `SUPABASE_SERVICE_ROLE_KEY`) that the phone posts to `/api/delivered` → `mark_delivered_for` RPC → grey ✓✓. Older APKs get the classic notification message.
- **Native bridge:** `src/lib/native.ts` ↔ `DockInPlugin.java`. It covers:
  - College (Camu/LMS) sync, LMS submit, PDF making, reminders (exact alarms).
  - The in-app updater v2 (PackageInstaller, SHA-256, resume, 4-way parallel download, Wi-Fi prefetch).
  - Back button via `window.__dockinBack`, the share target, widgets, `pushCaps`, `setOpenChat`.
- **Share target:** Android share sheet → "Send on DockIn" (text, links, documents; no images). `ShareIn.java` copies files to the cache, and `ShareInbox.tsx` opens Friends with a "Send to…" picker.
- **Widgets (7):** Attendance (ring + subjects), Next class (countdown, progress), Today's classes (timeline), Tasks (urgency bars), Mess menu, Mess pass QR, Friends (recent chats with avatars, unread, who's free).
  - Layouts are in `res/layout/widget_*.xml` and providers in `*Widget.java`. Helpers are in `Widgets.java` (ring/avatar bitmaps, chips, ticks every 10 minutes via `WidgetTick`).
  - Data comes from `WidgetsSync.tsx` → `DockIn.setWidgets`.
- **UI patterns:**
  - Tabs use `HeroHeader` (leather plate at `sat + 1.5rem`; a slim frosted bar slides in on scroll). Friends has its own slim bar plus a sticky sections nav.
  - The task list reorders smoothly with `useFlip`.
  - Chat looks like WhatsApp: tails, time inside the bubble, typing dots.

## How code reaches the Mac (important)

- Claude works in a cloud copy, runs all checks, then writes files to the Mac with the device bridge (`device_commit_files`).
- The bridge can't write files nested more than 7 folders deep, so **Java files go to `_transfer/android-java/`**, and Harshit copies them with:
  `cp _transfer/android-java/*.java android/app/src/main/java/com/dockin/student/` (only the files named for that round).
- `.github/workflows/android.yml` is protected from remote writes. Changes go to `_transfer/android.yml` and Harshit copies them.
- Before overwriting, compare the Mac's copy (md5/diff) so nothing of his is lost.
- CI (GitHub Actions) builds the signed APK on push. The in-app updater then offers it to everyone. Web changes are live once Vercel deploys.

## Checks (run all before handing over)

- `npx tsc --noEmit`
- `npx eslint src`: 7 existing warnings, 0 errors.
- `npx vitest run`: about 233 tests.
- `npm run build`
- Java, two ways:
  - with the repo's stubs: `bash scripts/android-compile.sh`
  - against the real Android API: `javac -cp /tmp/ajar/android.jar` plus the non-android stubs.
- `bash scripts/android-updater-test.sh`
- End-to-end with Playwright against `next start` (local copies `scripts/_*.mjs` use `executablePath: "/usr/bin/google-chrome"`):
  - `smoke`
  - `signed-in-check`
  - `native-check`
  - `update-check`
  - `chat-check`: fake Supabase; covers outbox, ticks, shared-task updates, compare invite, the Friends scroll bar and more.
  - `offline-check`: over 10 minutes long.
- **Not possible in the cloud:** real Android rendering (widgets, notifications, share sheet). Check those on a phone after CI builds the APK.

## Server setup still to do (as of 23 Nov 2026)

Run these in the Supabase SQL editor, in order, if not done yet:
1. `0026_delivered_ticks.sql`: the `delivered_at` column and the `mark_delivered` RPC.
2. `0027_push_receipts.sql`: the `push_tokens.caps` column and the `mark_delivered_for` RPC (service role only).

Vercel env vars in use: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT`.

## Recent history (latest first)

- **23 Nov 2026:**
  - ✓✓ the moment a push lands (native service + signed receipts).
  - Notifications that are never lost (phone-side queue, server retries, native display).
  - Redesigned widgets and a new Friends widget.
  - Friends scroll header.
  - Tasks and Cafeteria plates at the same height.
- **22 Nov (evening):**
  - Chat outbox (fixes vanishing messages).
  - WhatsApp ticks.
  - Share-to-DockIn.
  - First widgets.
  - Smooth task ticks.
  - Dropped the `UPDATE_PACKAGES_WITHOUT_USER_ACTION` permission (Play Protect flags).
- **22 Nov:**
  - Shared-task updates and send-later.
  - Compare invite card.
  - LMS hand-in from Tasks, plus "share this assignment" after submitting.
  - Offline only on no network.
  - WhatsApp-style chat bubbles.
- **Before that:**
  - Task reminders (once / daily / chosen days / before the deadline), also in chat.
  - Sharper avatars.
  - LMS studio background follows the theme.
  - No attendance nudges on days off.
  - In-app updater v2.
  - Back button through the page.
  - Offline mode.
  - Security hardening (migrations 0023–0025).
  - Real LMS instead of the practice one.
  - Launch video.

## Known limits / ideas not done

- **Play Protect:** sideloaded APKs will always get some warning. The real fix is the Play Store: $25 fee, 12 testers × 14 days, remove the self-updater, and change `USE_EXACT_ALARM`. The advice was given; nothing has been built.
- **Older APKs:** grey ✓✓ only appears when the friend's DockIn syncs, until they install the new APK.
- **iPhone:** deferred.
