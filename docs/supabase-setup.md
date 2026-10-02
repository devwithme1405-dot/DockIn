# Supabase setup (one time)

Project URL and the publishable key are already in `.env.local` (local) and go into Vercel as environment variables (hosting).

## 1. Create the tables and the Bennett-only lock

1. Supabase dashboard, **SQL Editor**, **New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and press **Run**. Running it twice is harmless.
3. To test with a non-Bennett email (for example your Gmail), uncomment the last statement in that file, put your email in, and run it again. This list is only editable from the SQL Editor, never from the app.

If Bennett's student emails are not `@bennett.edu.in`, change the one line in `allowed_domain()` and set `NEXT_PUBLIC_ALLOWED_DOMAIN` to match.

## 2. Allowed web addresses

**Authentication, URL Configuration**

- Site URL: `http://localhost:3000` for now (change to the Vercel link after deploying)
- Redirect URLs: add `http://localhost:3000/**` and later `https://YOUR-APP.vercel.app/**`

## 3. Google sign-in

1. Google Cloud Console, create a project, **APIs & Services, OAuth consent screen**. User type External, app name DockIn, your email as support email. Later press **Publish app**, otherwise only listed test users can sign in.
2. **Credentials, Create credentials, OAuth client ID**, type **Web application**. Under *Authorized redirect URIs* add:
   `https://qfwldkdwxkqjmscttlza.supabase.co/auth/v1/callback`
3. Copy the Client ID and Client secret.
4. Supabase, **Authentication, Providers, Google**: turn it on and paste both values. Save.

Note: if Bennett manages student Google accounts, the university admin may need to allow third-party sign-in. If Google refuses, use the email code option below.

## 4. Email code sign-in (optional fallback)

- **Authentication, Providers, Email** must be on.
- **Authentication, Email Templates, Magic Link**: put `{{ .Token }}` in the message so the 6-digit code shows up.
- Supabase's built-in email sender allows only a few emails per hour. For all students, set up a custom SMTP service (Resend or Brevo, free tiers) under **Authentication, SMTP Settings**.

## 5. How sync behaves

- The phone's own database is always used first, so the app works offline.
- Changes upload a few seconds after you make them, when the app is opened again, and when the network comes back.
- If two phones edit the same thing, the later edit wins.
- Signing out removes the data from that phone only. It stays in the account.
- Every student can only read and write their own rows (row level security).


## 4. Friends, groups and shared assignments

Run `supabase/migrations/0002_social.sql` in the SQL Editor, the same way as
`0001_init.sql`. It is safe to run more than once.

It adds five tables (`profiles`, `friends`, `groups`, `group_members`, `shares`
plus `share_targets`) and the handful of functions the app calls. The rules it
installs are worth knowing, because they are what keeps a thousand students'
data apart:

* **You are only findable by your code.** Every student gets an eight-character
  code the first time they open Friends. There is no search by name or email, so
  nobody can be found by guessing.
* **A profile opens up only to friends and group mates.** Until a request is
  accepted, neither side can read the other's row.
* **Attendance is a word, never a number.** Even with sharing turned on, friends
  see `Safe`, `Cutting it close` or `Below target`. The percentage never leaves
  the phone.
* **A post reaches the group it was made in, and nobody else.** Only the person
  who posted it can edit or withdraw it, and you can only send something
  directly to someone you are already friends with.

To check it on your own project, paste `supabase/tests/social_test.sql` into the
SQL Editor. It makes three test students, walks through every rule above and
raises on the first one that does not hold. Delete the rows it creates afterwards
if you run it against a project you care about.


## 5. Lock anonymous callers out (run after 0002)

Run `supabase/migrations/0003_lock_anon_out.sql`.

Supabase hands the `anon` role read access to every new table in `public` by
default. Row level security already stops an anonymous caller from seeing a
single row, but this takes the grant away as well, so there are two locks rather
than one. The same script checks that RLS is switched on for every DockIn table
and raises if it is not — so a clean run is also the proof that the first two
migrations landed properly.

After it, an anonymous request to any DockIn table should come back `401`, not an
empty list.
