import { SAMPLE_DAY } from "../planner/sampleDay.ts";
import { humanizeMinuteRanges } from "../utils/time.ts";

export function GeneratePlan({
  issues,
  hasPlan,
  stale,
  onLoadSample,
  onClear,
}: {
  issues: readonly string[];
  hasPlan: boolean;
  stale: boolean;
  onLoadSample: () => void;
  onClear: () => void;
}) {
  const label = stale ? "Update plan" : hasPlan ? "Generate again" : "Generate plan";

  return (
    <div className="space-y-4 border-t border-line pt-6">
      {issues.length > 0 ? (
        <div id="plan-issues" role="alert" className="notice notice-warn">
          <p className="kicker text-accent">Could not generate a plan</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
            {issues.map((issue) => (
              <li key={issue}>{humanizeMinuteRanges(issue)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary">
        {label}
      </button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-150 hover:decoration-accent"
          onClick={onLoadSample}
        >
          {SAMPLE_DAY.label}
        </button>
        <button type="button" className="btn btn-quiet px-2" onClick={onClear}>
          Clear the desk
        </button>
      </div>
      <p className="text-sm leading-relaxed text-faint">{SAMPLE_DAY.description}</p>
    </div>
  );
}
