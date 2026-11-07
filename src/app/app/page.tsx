import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Smartphone, Zap } from "lucide-react";
import { InstallApp } from "@/components/InstallApp";

/**
 * One address for getting DockIn onto a phone: dock-in.vercel.app/app
 *
 * It leads with the Android app, which is the site plus what a site cannot
 * do: read the notifications your payment apps post and ask where the money
 * went. Installing the site from the browser stays underneath as the fallback.
 */

export const metadata: Metadata = {
  title: "Get DockIn",
  description: "Put DockIn on your phone.",
};

/** Redirects to the file CI publishes (see next.config.ts). */
const APK = "/DockIn.apk";

export default function GetTheApp() {
  return (
    <main className="page-wash min-h-dvh px-5 pt-10 pb-16">
      <div className="mx-auto w-full max-w-md">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent text-on-accent">
          <Smartphone size={26} />
        </span>
        <h1 className="mt-5 text-[30px] font-semibold leading-tight tracking-tight">
          Put DockIn on your phone
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Attendance, money and assignments, in one place. It opens instantly, works with no signal,
          and keeps itself up to date.
        </p>

        <div className="mt-7">
          <InstallApp apkHref={APK} />
        </div>

        <section className="lift mt-8 rounded-3xl bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Zap size={17} className="text-accent" /> What you get
          </h2>
          <ul className="mt-3 space-y-2.5 text-[14px] text-muted">
            <li>
              <span className="text-text">Attendance that answers a question.</span> Not just the
              percentage — what it becomes if you skip tomorrow.
            </li>
            <li>
              <span className="text-text">Money without typing.</span> Pay with GPay or PhonePe and
              DockIn asks what it was for, right then. One tap, and a budget that tells you what you
              can spend a day.
            </li>
            <li>
              <span className="text-text">Nothing due sneaks up.</span> Assignments, quizzes and exams
              with a countdown, sorted by what is closest.
            </li>
          </ul>
        </section>

        <section className="lift mt-4 rounded-3xl bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <ShieldCheck size={17} className="text-safe" /> What it can see
          </h2>
          <p className="mt-2 text-[14px] text-muted">
            Your data lives on your phone and in your own account. If you switch payment reading on,
            DockIn reads what GPay, PhonePe, Paytm and your bank put in your notification bar — those
            apps and nothing else — and keeps it on the phone. Account and card numbers are removed
            the moment it is read, and no payment is added to your spending until you tap it.
          </p>
        </section>

        <p className="mt-8 text-center text-[13px] text-muted">
          <Link href="/privacy" className="font-medium text-accent">
            What DockIn can see
          </Link>
        </p>

        <p className="mt-3 text-center text-[13px] text-muted">
          Already have it?{" "}
          <Link href="/" className="font-medium text-accent">
            Open DockIn
          </Link>
        </p>
      </div>
    </main>
  );
}
