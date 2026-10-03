import type { ReactNode } from "react";
import type { TimeAccounting } from "../types/planner.ts";
import { formatDurationShort } from "../utils/time.ts";

export interface SummaryInput {
  /** Live planning window from the settings form, or null while the form is invalid. */
  window: { startMinute: number; endMinute: number; bufferMinutes: number } | null;
  /** Live fixed commitments. Used only to show reserved time, never counted as task work. */
  commitments: readonly { startMinute: number; endMinute: number }[];
  /** Figures from the last generated plan, or null before the first one. */
  plan: {
    accounting: TimeAccounting;
    placedTasks: number;
    deferredTasks: number;
    /** Incomplete tasks that were given to the scheduler. */
    plannedTasks: number;
  } | null;
  /** The plan no longer matches the desk. */
  stale: boolean;
  totalTasks: number;
  completedTasks: number;
}

/**
 * Four figures read from live app state and the last scheduling result.
 * Nothing is estimated and nothing is scored.
 */
export function SummaryCards({ summary }: { summary: SummaryInput }) {
  const { window, commitments, plan, stale, totalTasks, completedTasks } = summary;
  const remaining = totalTasks - completedTasks;
  const staleNote = stale ? " · out of date" : "";

  return (
    <section aria-label="Day summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <AvailableCard window={window} commitments={commitments} />
      <Card
        label="Scheduled work"
        value={plan ? formatDurationShort(plan.accounting.scheduledWorkMinutes) : "—"}
        note={
          plan
            ? `of ${formatDurationShort(freeMinutes(plan.accounting))} free · ${countLabel(plan.placedTasks, "task")}${staleNote}`
            : "No plan generated yet"
        }
      />
      <Card
        label="Completed"
        value={String(completedTasks)}
        note={totalTasks === 0 ? "No tasks added yet" : `of ${countLabel(totalTasks, "task")}`}
      />
      <Card
        label="Deferred"
        value={plan ? String(plan.deferredTasks) : "—"}
        note={
          plan
            ? `of ${countLabel(plan.plannedTasks, "planned task")}${staleNote}`
            : remaining === 0
              ? "Nothing to place"
              : `${countLabel(remaining, "task")} to place`
        }
      />
    </section>
  );
}

/** Time left for tasks and breaks once commitments and the buffer are reserved. */
function freeMinutes(accounting: TimeAccounting): number {
  return accounting.windowMinutes - accounting.commitmentMinutes - accounting.bufferMinutes;
}

function AvailableCard({
  window,
  commitments,
}: {
  window: SummaryInput["window"];
  commitments: SummaryInput["commitments"];
}) {
  if (!window) {
    return <Card label="Available time" value="—" note="Fix the planning hours to see this" />;
  }

  const windowMinutes = window.endMinute - window.startMinute;
  const fixed = commitments.reduce((total, commitment) => {
    const start = Math.max(window.startMinute, commitment.startMinute);
    const end = Math.min(window.endMinute, commitment.endMinute);

    return total + Math.max(0, end - start);
  }, 0);
  const free = Math.max(0, windowMinutes - fixed - window.bufferMinutes);
  const reserved = [
    fixed > 0 ? `${formatDurationShort(fixed)} fixed` : null,
    window.bufferMinutes > 0 ? `${formatDurationShort(window.bufferMinutes)} buffer` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Card
      label="Available time"
      value={formatDurationShort(free)}
      note={
        reserved.length > 0
          ? `${formatDurationShort(windowMinutes)} window − ${reserved.join(" − ")}`
          : `${formatDurationShort(windowMinutes)} window, nothing reserved`
      }
    />
  );
}

function Card({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="panel stat-card flex h-full flex-col justify-between">
      <div>
        <p className="kicker">{label}</p>
        <p className="mt-2.5 font-serif text-2xl leading-none text-ink tabular-nums sm:text-3xl lg:text-4xl">{value}</p>
      </div>
      <p className="mt-3 text-xs leading-snug text-faint sm:text-sm">{note}</p>
    </div>
  );
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
