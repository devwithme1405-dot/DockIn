import type { ReactNode } from "react";
import { cx } from "./ui";

/** A grey placeholder block with a soft shimmer. Purely decorative. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton rounded-xl", className)} />;
}

function Screen({ children, label = "Loading" }: { children: ReactNode; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Rows({ n, className }: { n: number; className?: string }) {
  return (
    <div className={cx("overflow-hidden lift rounded-3xl bg-surface", className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cx("flex items-center gap-3 p-4", i > 0 && "border-t border-line")}>
          <Bone className="size-11 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className="h-4 w-2/3" />
            <Bone className="h-3 w-1/3" />
          </div>
          <Bone className="h-8 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function TodaySkeleton() {
  return (
    <Screen label="Loading your day">
      <div className="flex h-11 items-center justify-between px-4 pt-[max(0.625rem,env(safe-area-inset-top))] box-content pb-2">
        <div className="flex items-center gap-2.5">
          <Bone className="size-[30px] rounded-lg" />
          <div className="space-y-1.5">
            <Bone className="h-3.5 w-16" />
            <Bone className="h-3 w-24" />
          </div>
        </div>
        <Bone className="size-10 rounded-full" />
      </div>
      <Bone className="mx-4 mt-3 h-[15.5rem] rounded-[28px]" />
      <div className="mt-4 grid grid-cols-2 gap-3 px-5">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-[7.25rem] rounded-3xl" />
        ))}
      </div>
      <Bone className="mx-5 mt-6 h-6 w-24" />
      <Rows n={2} className="mx-5 mt-3" />
    </Screen>
  );
}

export function AttendanceSkeleton() {
  return (
    <Screen label="Loading attendance">
      <Bone className="mx-5 h-[11rem] rounded-3xl" />
      <Bone className="mx-5 mt-3 h-12 rounded-2xl" />
      {[0, 1, 2].map((i) => (
        <Bone key={i} className="mx-5 mt-3 h-36 rounded-3xl" />
      ))}
    </Screen>
  );
}

export function MoneySkeleton() {
  return (
    <Screen label="Loading money">
      <Bone className="mx-5 h-[11.5rem] rounded-3xl" />
      <div className="mt-3 grid grid-cols-3 gap-2.5 px-5">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-[4.5rem] rounded-2xl" />
        ))}
      </div>
      <Bone className="mx-5 mt-6 h-6 w-36" />
      <Rows n={4} className="mx-5 mt-3" />
    </Screen>
  );
}

export function TasksSkeleton() {
  return (
    <Screen label="Loading tasks">
      <div className="grid grid-cols-3 gap-2.5 px-5">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-[4.5rem] rounded-2xl" />
        ))}
      </div>
      <Bone className="mx-5 mt-3 h-12 rounded-2xl" />
      <Bone className="mx-5 mt-3 h-11 rounded-xl" />
      <Rows n={4} className="mx-5 mt-4" />
    </Screen>
  );
}

export function CalendarSkeleton() {
  return (
    <Screen label="Loading calendar">
      <Bone className="mx-5 h-[22rem] rounded-3xl" />
      <Bone className="mx-5 mt-5 h-6 w-32" />
      <Rows n={2} className="mx-5 mt-3" />
    </Screen>
  );
}

export function ProfileSkeleton() {
  return (
    <Screen label="Loading profile">
      <div className="space-y-5 px-5 pt-3">
        <Bone className="h-[7rem] rounded-3xl" />
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <Bone key={i} className="h-[4.5rem] rounded-2xl" />
          ))}
        </div>
        <Bone className="h-32 rounded-3xl" />
        <Bone className="h-48 rounded-3xl" />
      </div>
    </Screen>
  );
}

export function ListSkeleton({ n = 4 }: { n?: number }) {
  return (
    <Screen>
      <Bone className="mx-5 mt-2 mb-4 h-8 w-40" />
      <Rows n={n} className="mx-5" />
    </Screen>
  );
}
