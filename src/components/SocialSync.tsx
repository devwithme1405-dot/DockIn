"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { listenChat, pullChat } from "@/lib/chat";
import { startPush } from "@/lib/push";
import { pullSocial } from "@/lib/social";
import { getSupabase } from "@/lib/supabase";
import { TAB_SHOWN, goTab, tabOf } from "@/lib/tabs";

/**
 * Keeps chat live and push registered while someone is signed in: a pull on
 * start and whenever the app comes back to the front, a realtime channel while
 * it is open, and this phone's push token on the server.
 */
export function SocialSync() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  useEffect(() => {
    if (!uid) return;
    void pullChat();
    const stop = listenChat();
    void startPush((path) => {
      const url = new URL(path, window.location.href);
      if (tabOf(url.pathname)) goTab(url.pathname + url.search);
      else window.location.assign(path);
    });
    // Friends, groups and shared work: pull when something changes on the
    // server (realtime), when the app comes back, and when Friends is opened —
    // coalesced, so a burst of changes is one pull, never a storm.
    let timer = 0;
    let last = 0;
    const soon = (wait = 700) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        last = Date.now();
        void pullSocial().catch(() => {});
      }, wait);
    };
    const sb = getSupabase();
    const ch = sb
      ?.channel("dockin-social")
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => soon())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => soon())
      .on("postgres_changes", { event: "*", schema: "public", table: "shares" }, () => soon())
      .on("postgres_changes", { event: "*", schema: "public", table: "share_progress" }, () => soon(1500))
      .subscribe();
    const onTab = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "/circle" && Date.now() - last > 15_000) soon(0);
    };
    window.addEventListener(TAB_SHOWN, onTab);
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      void pullChat();
      if (Date.now() - last > 15_000) soon(300);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop();
      window.clearTimeout(timer);
      window.removeEventListener(TAB_SHOWN, onTab);
      if (sb && ch) void sb.removeChannel(ch);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [uid]);

  return null;
}
