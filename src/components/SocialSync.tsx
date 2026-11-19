"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { listenChat, pullChat } from "@/lib/chat";
import { startPush } from "@/lib/push";
import { goTab, tabOf } from "@/lib/tabs";

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
    const onShow = () => {
      if (document.visibilityState === "visible") void pullChat();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [uid]);

  return null;
}
