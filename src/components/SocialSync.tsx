"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { listenChat, pullChat } from "@/lib/chat";
import { startPush, syncPushToken } from "@/lib/push";
import { ensureProfile, publishProfile, pullSocial } from "@/lib/social";
import { getProfile } from "@/lib/repo";
import { getSupabase } from "@/lib/supabase";
import { TAB_SHOWN, goTab, tabOf } from "@/lib/tabs";
import { whileVisible } from "@/lib/visible";

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
    // Your name and photo reach friends right after sign-in, not only once
    // you open Friends — so a request you send never arrives as "A student".
    void (async () => {
      const mine = await ensureProfile();
      const local = await getProfile();
      if (local) await publishProfile(local, mine.shareAttendance);
    })().catch(() => {});
    const openPath = (path: string) => {
      const url = new URL(path, window.location.href);
      if (tabOf(url.pathname)) goTab(url.pathname + url.search);
      else window.location.assign(path);
    };
    void startPush(openPath);
    void syncPushToken().catch(() => {});
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
    // Live channels only while the app is on screen (see whileVisible): one
    // websocket per phone in use, not per phone that has DockIn installed.
    const sb = getSupabase();
    const live = whileVisible(() => {
      const stopChat = listenChat();
      const ch = sb
        ?.channel("dockin-social")
        .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => soon())
        .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => soon())
        .on("postgres_changes", { event: "*", schema: "public", table: "shares" }, () => soon())
        .on("postgres_changes", { event: "*", schema: "public", table: "share_progress" }, () => soon(1500))
        .subscribe();
      return () => Promise.all([stopChat(), sb && ch ? sb.removeChannel(ch) : undefined]);
    });
    const onTab = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "/circle" && Date.now() - last > 15_000) soon(0);
    };
    window.addEventListener(TAB_SHOWN, onTab);
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      // A permission switched on in Settings meanwhile gets this phone registered now.
      void startPush(openPath);
      void pullChat();
      if (Date.now() - last > 15_000) soon(300);
    };
    document.addEventListener("visibilitychange", onShow);
    const onGranted = () => void startPush(openPath);
    window.addEventListener("dockin:notifications", onGranted);
    return () => {
      window.removeEventListener("dockin:notifications", onGranted);
      live();
      window.clearTimeout(timer);
      window.removeEventListener(TAB_SHOWN, onTab);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [uid]);

  return null;
}
