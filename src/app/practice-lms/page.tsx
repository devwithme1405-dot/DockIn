"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The Practice LMS was removed — old links land on Tasks. */
export default function PracticeLmsGone() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tasks");
  }, [router]);
  return null;
}
