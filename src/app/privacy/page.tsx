import type { Metadata } from "next";
import Link from "next/link";

/**
 * What DockIn does with a student's data, in words a student can check.
 *
 * Written plainly rather than defensively: every claim here is one you could go
 * and verify in the code. It is also the page Google Play requires before an
 * app that connects to Camu and the LMS can be listed on the Play Store.
 */

export const metadata: Metadata = {
  title: "Privacy — DockIn",
  description: "What DockIn stores, what it never sees, and how to get rid of it.",
};

export default function Privacy() {
  return (
    <main className="page-wash min-h-dvh px-5 pt-10 pb-16">
      <article className="mx-auto w-full max-w-md">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight">Privacy</h1>
        <p className="mt-2 text-[13px] text-muted">Last updated 26 November 2026</p>

        <p className="mt-5 text-[15px]">
          DockIn is made by a student for students. It keeps as little as it can, and everything it
          keeps is yours.
        </p>

        <Section title="What is stored">
          <p>
            Your attendance, timetable, tasks and the things you share live on your own
            phone. If you sign in, a copy is kept in your own account so a new phone can get it
            back. Nobody else can read it: the database only ever returns your own rows, and what
            friends see is limited to what you choose to share with them.
          </p>
        </Section>

        <Section title="What friends can see">
          <p>
            Your name, your picture, and whatever you post to a group or send them. If you turn on
            attendance sharing, they see one word — Safe, Cutting it close, or Below target — and
            never the percentage. People find you only by your eight-character code. There is no way
            to search for someone by name, email or phone number.
          </p>
        </Section>

        <Section title="Camu and the LMS, if you connect them">
          <p>
            The Android app can read your own attendance and timetable from Camu, and your pending
            assignments from the LMS, so you never type them in. It only reads; it never marks,
            submits or changes anything there.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Camu: you sign in on Camu&rsquo;s own page with Microsoft, inside the app. DockIn never
              sees that password. It keeps the sign-in Camu gives back, encrypted on your phone.
            </li>
            <li>
              LMS: your LMS username and password are kept encrypted on your phone with Android&rsquo;s
              keystore, so the app can sign in again when the LMS logs you out. They are sent to the
              LMS and nowhere else.
            </li>
            <li>
              Your Camu attendance and timetable stay on your phone. Assignments found on the LMS
              become tasks, and are backed up like any task you add yourself. It checks about once an
              hour, and only Camu and the LMS are contacted.
            </li>
            <li>Disconnect either one in Profile and everything it kept for it is wiped at once.</li>
          </ul>
        </Section>

        <Section title="What the DockIn team sees">
          <p>
            To keep DockIn working, the team can see for each account: when it last opened DockIn
            and on which days, the app version and whether it&rsquo;s the Android app or the
            website, and whether Camu, the LMS and notifications are set up. If the app crashes, the
            error message is sent too. That&rsquo;s all — never your attendance, timetable, tasks,
            chats or files.
          </p>
          <p className="mt-2">
            If someone reports a message you sent, that one message is shown to the team with the
            report. Accounts that break the rules can be suspended, and you&rsquo;ll see why.
          </p>
        </Section>

        <Section title="What is never collected">
          <p>
            No advertising, no ad tracking, no location, no contacts, no selling anything to anyone,
            and nothing about what you look at or type in the app beyond what is listed above.
          </p>
        </Section>

        <Section title="Getting rid of it">
          <p>
            Log out and the copy on that phone goes. To have your account and everything in it
            deleted, write to{" "}
            <a href="mailto:motionsachin1@gmail.com" className="font-medium text-accent">
              motionsachin1@gmail.com
            </a>{" "}
            and it will be done.
          </p>
        </Section>

        <Section title="Who to ask">
          <p>
            DockIn is built by Sachin Kumar, a student at Bennett University. Questions, or anything
            that looks wrong, go to{" "}
            <a href="mailto:motionsachin1@gmail.com" className="font-medium text-accent">
              motionsachin1@gmail.com
            </a>
            .
          </p>
        </Section>

        <p className="mt-10 text-center text-[13px] text-muted">
          <Link href="/" className="font-medium text-accent">
            Open DockIn
          </Link>
        </p>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lift mt-5 rounded-3xl bg-surface p-5">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}
