# DockIn

One app for a Bennett student's college day: attendance, money, tasks and exams, calendar and
holidays. It runs as a website (and installs as a PWA), and as an Android app that adds what a
website cannot do: reading payment notifications and asking where the money went.

Data is stored on the phone first (IndexedDB), so everything works offline. Signed-in Bennett
students are also backed up and synced through Supabase. See `docs/supabase-setup.md` for the one-time
cloud setup. Without the cloud keys the app simply runs local-only.

## Run it on your laptop

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first launch asks your name, target percentage and whether to
load a sample timetable.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload |
| `npm test` | Unit tests (attendance maths, class generation) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint |
| `npm run build` then `npm start` | Production build. The service worker (offline mode) only runs here |
| `npm run smoke` | Every screen in a real browser, plus the app driving a pretend phone (needs `npm start` running) |
| `npm run android:check` | Compiles the Android Java against stubs and checks its payment rules match the web's |
| `npm run verify` | All of the above that need no server |

## What is inside

- `src/lib/attendance.ts` attendance maths: percentage, classes you can still miss, classes you must attend
- `src/lib/db.ts`, `src/lib/repo.ts` local database. Screens only use `repo.ts`, so swapping to Supabase later touches one place
- `src/app` screens: Today, Attendance, subject detail, timetable, Money, Tasks, Calendar, Friends and groups, group detail, onboarding, profile (avatar, text size, theme, backup and restore, log out)
- `src/app/sw.js/route.ts` service worker, `src/app/manifest.ts` install manifest and Android shortcuts
- `src/lib/features.ts` switches for whole features (friends and groups are off for now)

## The Android app

`android/` is a Capacitor project. The app opens the live site (`capacitor.config.ts`), so screen
changes ship with a Vercel deploy and need no new APK; the APK changes only when the Java does.

- `DockInPlugin.java` is everything the site can ask the phone (`src/lib/native.ts` is the other side)
- `PayWatchService.java` reads payment notifications into `PayInbox` on the phone
- `PayNotifier.java` asks "what was it for?" right after a spend

CI (`.github/workflows/android.yml`) builds and signs the APK on every push that touches it and
publishes it as the `apk-latest` release; `/DockIn.apk` on the site points there.
- `tests` unit tests

## Notes

- The sample timetable assumes lectures last 60 minutes. Edit times in Attendance, then Timetable.
- Use "Before DockIn" on a subject to enter how many classes you already attended this semester.
- Clearing browser data removes everything. Use Profile, then Download backup.
- Next.js 16: see `AGENTS.md` before changing framework code.

## Cloud (Supabase)

Copy `.env.example` to `.env.local` and fill in your project values. Never commit `.env.local`.
