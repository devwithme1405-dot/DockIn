"use client";

import { useRouter } from "next/navigation";
import { ExpenseForm } from "@/components/ExpenseForm";

/**
 * Quick-add screen. The iPhone back-tap Shortcut and the home-screen shortcut
 * open this address directly, so it goes straight to the amount field.
 */
export default function AddPage() {
  const router = useRouter();
  return (
    <div className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <h1 className="text-[26px] font-semibold tracking-tight">Add expense</h1>
      <p className="mb-5 text-[13px] text-muted">Takes about five seconds.</p>
      <ExpenseForm onDone={() => router.replace("/money")} />
    </div>
  );
}
