import type { Metadata } from "next";
import Link from "next/link";

/**
 * What DockIn does with a student's data, in words a student can check.
 *
 * Written plainly rather than defensively: every claim here is one you could go
 * and verify in the code. It is also the page Google Play requires before an
 * app that reads notifications can be listed, which is the only route that gets
 * payment detection past Play Protect.
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
        <p className="mt-2 text-[13px] text-muted">Last updated 4 October 2026</p>

        <p className="mt-5 text-[15px]">
          DockIn is made by a student for students. It keeps as little as it can, and everything it
          keeps is yours.
        </p>

        <Section title="What is stored">
          <p>
            Your attendance, timetable, spending, tasks and the things you share live on your own
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

        <Section title="Payment detection, if you turn it on">
          <p>
            The Android app can read the notifications your payment apps post, so a payment turns up
            on your Money screen without you typing it. It is off until you switch it on in Android,
            and you can switch it off there at any time.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Only payment apps are looked at — Google Pay, PhonePe, Paytm, BHIM, CRED and your
              bank&rsquo;s messages. Nothing else on your phone is read.
            </li>
            <li>
              A notification is only sent on if it mentions an amount and a payment. Ordinary
              messages never leave the phone.
            </li>
            <li>
              Account and card numbers are stripped on the phone before anything is sent, and again
              when it arrives.
            </li>
            <li>
              What is sent is kept for a fortnight at most, and is deleted as soon as you add or
              dismiss the payment.
            </li>
            <li>
              Nothing is ever added to your spending on its own. Every payment waits for you to tap
              it.
            </li>
          </ul>
        </Section>

        <Section title="What is never collected">
          <p>
            No advertising, no analytics about you, no location, no contacts, no selling anything to
            anyone. There is no tracking of what you do in the app.
          </p>
        </Section>

        <Section title="Getting rid of it">
          <p>
            Log out and the copy on that phone goes. Unlink a phone in Profile and it stops sending
            payments at once. To have your account and everything in it deleted, write to{" "}
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
