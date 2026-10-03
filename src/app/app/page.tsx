import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Smartphone, Zap } from "lucide-react";
import { InstallApp } from "@/components/InstallApp";

/**
 * One address for getting DockIn onto a phone: dock-in.vercel.app/app
 *
 * It leads with installing the site itself, because that is the route that
 * cannot fail: nothing to download, nothing Android can refuse, and it updates
 * on its own. The Android file is underneath, for the one thing a web page
 * cannot do — read the notifications your payment apps post.
 */

export const metadata: Metadata = {
  title: "Get DockIn",
  description: "Put DockIn on your phone.",
};

/** Served from this site, so the phone never leaves it to fetch the app. */
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
              <span className="text-text">One assignment, the whole class.</span> Share the Word
              file once; everyone gets it back with their own name and roll already in it.
            </li>
            <li>
              <span className="text-text">Money without typing.</span> The places you eat at, one tap
              each, and a monthly budget that tells you what you can spend a day.
            </li>
          </ul>
        </section>

        <section className="lift mt-4 rounded-3xl bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <ShieldCheck size={17} className="text-safe" /> What it can see
          </h2>
          <p className="mt-2 text-[14px] text-muted">
            Your data lives on your phone and in your own account. If you switch payment detection
            on, DockIn reads what GPay, PhonePe, Paytm and your bank put in your notification bar —
            those apps and nothing else. Account and card numbers are removed on the phone before
            anything is sent, and no payment is added to your spending until you tap it.
          </p>
        </section>

        <p className="mt-8 text-center text-[13px] text-muted">
          Already have it?{" "}
          <Link href="/" className="font-medium text-accent">
            Open DockIn
          </Link>
        </p>
      </div>
    </main>
  );
}
