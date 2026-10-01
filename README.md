# DockIn

One app for a Bennett student's college day. Sprint 1 and 2 are built: attendance,
timetable, Today screen, offline use, light and dark theme. Money, tasks and calendar come next.

Right now all data is stored in the browser (IndexedDB) on the device you use. Nothing is sent
to a server. Supabase login and sync are added when we host it.

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
- `src/app` screens: Today, Attendance, subject detail, timetable, onboarding, settings
- `public/sw.js` service worker, `src/app/manifest.ts` install manifest and Android shortcuts
- `tests` unit tests

## Notes

- The sample timetable assumes lectures last 60 minutes. Edit times in Attendance, then Timetable.
- Use "Before DockIn" on a subject to enter how many classes you already attended this semester.
- Clearing browser data removes everything. Use Settings, then Download backup.
- Next.js 16: see `AGENTS.md` before changing framework code.
