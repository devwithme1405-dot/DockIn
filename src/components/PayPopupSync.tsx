"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getProfile } from "@/lib/repo";
import { useCategories, useDues } from "@/lib/hooks";
import { knownPeople } from "@/lib/money";
import { DockIn, onPhone } from "@/lib/native";
import { applyPopupAnswers } from "@/lib/popup";
import { useToast } from "./ui";

/**
 * Two jobs for the payment popup, which runs with DockIn closed:
 *  - hand the phone the categories and people to show as one-tap buttons;
 *  - file whatever was answered in it, as soon as the app is open.
 * Renders nothing; mounted only inside the app.
 */
export function PayPopupSync() {
  const toast = useToast();
  const cats = useCategories();
  const dues = useDues();
  const profile = useLiveQuery(() => getProfile(), []);

  useEffect(() => {
    if (!cats || !dues) return;
    const people = [...knownPeople(dues, 6)];
    for (const f of profile?.friends ?? []) {
      if (!people.some((p) => p.toLowerCase() === f.toLowerCase())) people.push(f);
    }
    void DockIn.setPayChoices({
      categories: cats.slice(0, 12).map((c) => ({ id: c.id, label: c.label, emoji: c.emoji })),
      people: people.slice(0, 6),
    }).catch(() => {});
  }, [cats, dues, profile?.friends]);

  useEffect(() => {
    const run = () =>
      void applyPopupAnswers()
        .then((said) => {
          if (said.length === 1) toast.show(said[0]);
          else if (said.length > 1) toast.show(`${said.length} payments filed from the popup`);
        })
        .catch(() => {});
    run();
    const offNotice = onPhone("notice", run);
    const offResume = onPhone("resume", run);
    return () => {
      offNotice();
      offResume();
    };
  }, [toast]);

  return null;
}
