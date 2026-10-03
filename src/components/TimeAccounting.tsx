import type { TimeAccounting as Accounting } from "../types/planner.ts";
import { formatDuration } from "../utils/time.ts";

const PARTS = [
  { key: "scheduledWorkMinutes", label: "Scheduled work", swatch: "swatch-task" },
  { key: "breakMinutes", label: "Breaks", swatch: "swatch-break" },
  { key: "commitmentMinutes", label: "Commitments", swatch: "swatch-commitment" },
  { key: "bufferMinutes", label: "End-of-day buffer", swatch: "swatch-buffer" },
  { key: "unusedMinutes", label: "Open", swatch: "swatch-open" },
] as const;

export function TimeAccounting({ accounting }: { accounting: Accounting }) {
  const total =
    accounting.scheduledWorkMinutes +
    accounting.breakMinutes +
    accounting.commitmentMinutes +
    accounting.bufferMinutes +
    accounting.unusedMinutes;
  const balanced = total === accounting.windowMinutes && accounting.unusedMinutes >= 0;

  return (
    <section aria-labelledby="accounting-heading">
      <h2 id="accounting-heading" className="font-serif text-2xl text-ink">
        Time accounting
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        The planning window is {formatDuration(accounting.windowMinutes)}. Work, breaks, commitments, the end-of-day buffer,
        and open time are the whole of that window.
      </p>
      <div className="mt-6 flex h-3 overflow-hidden rounded-sm bg-white/5" aria-hidden="true">
        {PARTS.map((part) => {
          const minutes = accounting[part.key];

          if (minutes <= 0 || accounting.windowMinutes === 0) {
            return null;
          }

          return (
            <div
              key={part.key}
              className={part.swatch}
              style={{ width: `${(minutes / accounting.windowMinutes) * 100}%` }}
              title={`${part.label}: ${formatDuration(minutes)}`}
            />
          );
        })}
      </div>
      <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {PARTS.map((part) => (
          <div key={part.key} className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
            <dt className="flex min-w-0 items-center gap-2 text-sm text-muted">
              <span className={`swatch ${part.swatch}`} aria-hidden="true" />
              {part.label}
            </dt>
            <dd className="shrink-0 text-sm text-ink tabular-nums">{formatDuration(accounting[part.key])}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-pretty font-serif text-lg leading-relaxed text-ink">
        {formatDuration(accounting.windowMinutes)} = {formatDuration(accounting.scheduledWorkMinutes)} work +{" "}
        {formatDuration(accounting.breakMinutes)} breaks + {formatDuration(accounting.commitmentMinutes)} commitments +{" "}
        {formatDuration(accounting.bufferMinutes)} buffer + {formatDuration(accounting.unusedMinutes)} open.
      </p>
      {balanced ? (
        <p className="mt-2 text-sm text-faint">These five parts add up to the planning window.</p>
      ) : (
        <p className="mt-2 text-sm text-accent" role="alert">
          The parts add up to {formatDuration(total)}, which does not match the {formatDuration(accounting.windowMinutes)}{" "}
          window.
        </p>
      )}
    </section>
  );
}
