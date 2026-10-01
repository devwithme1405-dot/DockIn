import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./ui";

export function ComingSoon({
  title,
  icon: Icon,
  points,
}: {
  title: string;
  icon: LucideIcon;
  points: string[];
}) {
  return (
    <>
      <PageHeader title={title} />
      <div className="mx-5 rounded-2xl bg-surface p-6">
        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={22} />
        </div>
        <p className="font-semibold">Coming in the next build</p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
