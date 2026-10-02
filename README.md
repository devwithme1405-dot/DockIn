# DockIn

One app for a Bennett student's college day: attendance, money, tasks and exams, calendar and
holidays. It is a PWA, so it installs on iPhone and Android without an app store.

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

## What is inside

- `src/lib/attendance.ts` attendance maths: percentage, classes you can still miss, classes you must attend
- `src/lib/db.ts`, `src/lib/repo.ts` local database. Screens only use `repo.ts`, so swapping to Supabase later touches one place
- `src/app` screens: Today, Attendance, subject detail, timetable, Money, Tasks, Calendar, Friends and groups, group detail, onboarding, profile (avatar, text size, theme, backup and restore, log out)
- `public/sw.js` service worker, `src/app/manifest.ts` install manifest and Android shortcuts
- `tests` unit tests

## Notes

- The sample timetable assumes lectures last 60 minutes. Edit times in Attendance, then Timetable.
- Use "Before DockIn" on a subject to enter how many classes you already attended this semester.
- Clearing browser data removes everything. Use Profile, then Download backup.
- Next.js 16: see `AGENTS.md` before changing framework code.

## Cloud (Supabase)

Copy `.env.example` to `.env.local` and fill in your project values. Never commit `.env.local`.
