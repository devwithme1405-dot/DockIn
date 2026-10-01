"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft } from "lucide-react";
import { applyTheme, exportAll, getProfile, resetAll, saveProfile } from "@/lib/repo";
import type { ThemePref } from "@/lib/types";
import { Button, Chip, Field, inputCls } from "@/components/ui";

export default function SettingsPage() {
  const router = useRouter();
  const profile = useLiveQuery(() => getProfile(), []);
  const [name, setName] = useState<string | null>(null);
  if (!profile) return null;

  const shownName = name ?? profile.name;

  async function download() {
    const blob = new Blob([await exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dockin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function wipe() {
    if (!confirm("Delete all DockIn data on this phone? This cannot be undone.")) return;
    await resetAll();
    try {
      localStorage.removeItem("dockin-theme");
    } catch {}
    applyTheme("system");
    router.replace("/onboarding");
  }

  return (
    <>
      <header className="px-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href="/" className="inline-flex h-10 items-center gap-1 rounded-full px-2 text-accent">
          <ChevronLeft size={20} />
          Today
        </Link>
      </header>
      <h1 className="px-5 pt-1 pb-4 text-[26px] font-semibold tracking-tight">Settings</h1>

      <div className="space-y-6 px-5">
        <section className="rounded-2xl bg-surface p-4">
          <Field label="Name">
            <input
              className={inputCls}
              value={shownName}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== null && saveProfile({ name: name.trim() })}
            />
          </Field>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Required attendance</p>
          <div className="flex flex-wrap gap-2">
            {[65, 70, 75, 80, 85].map((t) => (
              <Chip
                key={t}
                active={profile.target === t}
                onClick={() => saveProfile({ target: t })}
              >
                {t}%
              </Chip>
            ))}
          </div>
          <p className="mt-5 mb-1.5 text-[13px] font-medium text-muted">Theme</p>
          <div className="flex gap-2">
            {(["system", "light", "dark"] as ThemePref[]).map((t) => (
              <Chip
                key={t}
                active={profile.theme === t}
                onClick={() => saveProfile({ theme: t })}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </Chip>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-surface p-4">
          <h2 className="font-semibold">Install on your phone</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              <span className="text-text">iPhone:</span> open in Safari, tap Share, then Add to
              Home Screen.
            </li>
            <li>
              <span className="text-text">Android:</span> open in Chrome, tap the menu, then
              Install app.
            </li>
          </ol>
        </section>

        <section className="space-y-2.5 rounded-2xl bg-surface p-4">
          <h2 className="font-semibold">Your data</h2>
          <p className="text-sm text-muted">
            Right now everything is stored only on this device. Download a backup before
            clearing browser data.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button variant="secondary" size="sm" onClick={download}>
              Download backup
            </Button>
            <Button variant="danger" size="sm" onClick={wipe}>
              Delete all data
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
