"use client";

import { RotateCcw, Sprout, UserMinus, UserPlus } from "lucide-react";
import { growth, pctOf } from "@/lib/adminApi";
import { CohortGrid, Funnel } from "./charts";
import { Card, Failed, Pills, RefreshButton, Skeleton, Stat, useLoad } from "./parts";
import { useState } from "react";

const RANGE = [
  ["30", "30 days"],
  ["90", "90 days"],
  ["0", "All time"],
] as const;

export function Growth() {
  const [days, setDays] = useState<(typeof RANGE)[number][0]>("30");
  const { data, error, loading, reload } = useLoad(() => growth(Number(days)), [days]);

  if (error && !data) return <Failed error={error} retry={reload} />;

  const f = data?.funnel;
  const steps = f
    ? [
        { label: "Signed up", value: f.signed_up },
        { label: "Added their name", value: f.named },
        { label: "Verified with MyCamu", value: f.verified },
        { label: "Connected MyCamu", value: f.camu },
        { label: "Turned on notifications", value: f.notif },
        { label: "Made an outpass", value: f.outpass },
        { label: "Active in last 7 days", value: f.active7 },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Pills value={days} onChange={setDays} options={RANGE} />
        <RefreshButton loading={loading} onClick={() => void reload()} />
      </div>

      {!data ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <Card title="Signup funnel" sub={`Of everyone who joined ${days === "0" ? "ever" : `in the last ${days} days`}, how far they got`}>
            <Funnel steps={steps} />
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <ReturnTile label="Next-day return" num={data.returns.d1} den={data.returns.d1_n} />
            <ReturnTile label="Week-1 return" num={data.returns.w1} den={data.returns.w1_n} />
            <ReturnTile label="Month-1 return" num={data.returns.m1} den={data.returns.m1_n} />
          </div>

          <Card title="Weekly retention" sub="Each row is a signup week; cells show the % of that group still opening DockIn N weeks later">
            {data.cohorts.length === 0 || !data.tracking_since ? (
              <p className="py-4 text-center text-[13px] text-muted">Retention starts counting once DockIn records daily opens{data.tracking_since ? "" : " — not enough history yet"}.</p>
            ) : (
              <CohortGrid rows={data.cohorts} labelOf={(w) => new Date(`${w}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
            )}
          </Card>

          <Card title="This week vs last" sub="Who stayed, who left, who came back">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Active this week" value={data.churn.active} />
              <Stat label="Stayed from last week" value={data.churn.retained} tone="good" sub={`${pctOf(data.churn.retained, data.churn.retained + data.churn.churned)}% kept`} />
              <Stat label="Went quiet" value={data.churn.churned} tone={data.churn.churned > data.churn.retained ? "bad" : undefined} />
              <Stat label="New + came back" value={data.churn.new_users + data.churn.resurrected} tone="good" sub={`${data.churn.new_users} new · ${data.churn.resurrected} returned`} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <UserPlus size={13} className="text-safe" /> New joiners
              </span>
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw size={13} className="text-accent" /> Resurrected
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UserMinus size={13} className="text-danger" /> Churned
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ReturnTile({ label, num, den }: { label: string; num: number; den: number }) {
  const pct = pctOf(num, den);
  const tone = pct >= 40 ? "text-safe" : pct >= 20 ? "text-warn" : "text-danger";
  return (
    <div className="adm-card rounded-2xl border border-line bg-card px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
        <Sprout size={14} /> {label}
      </p>
      <p className={`font-display mt-1 text-[26px] font-extrabold tabular-nums ${den === 0 ? "text-muted" : tone}`}>{den === 0 ? "—" : `${pct}%`}</p>
      <p className="text-[11.5px] text-muted">{den === 0 ? "no cohort old enough yet" : `${num} of ${den}`}</p>
    </div>
  );
}
