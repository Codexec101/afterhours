import { SAMPLE_DAY } from "../planner/sampleDay.ts";
import { humanizeMinuteRanges } from "../utils/time.ts";

/**
 * Overview actions. The primary button submits the planning-settings form
 * (`desk-form`) through the `form` attribute, so the settings panel can sit
 * lower on the page.
 */
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
  const label = stale ? "Update plan" : hasPlan ? "Regenerate plan" : "Generate plan";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="submit" form="desk-form" className="btn btn-primary sm:w-auto sm:px-7">
          {label}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-150 hover:decoration-accent"
          onClick={onLoadSample}
          title={SAMPLE_DAY.description}
        >
          {SAMPLE_DAY.label}
        </button>
        <button type="button" className="btn btn-quiet px-2" onClick={onClear}>
          Clear the desk
        </button>
      </div>
      {issues.length > 0 ? (
        <div id="plan-issues" role="alert" className="notice notice-warn max-w-3xl">
          <p className="kicker text-accent">Could not generate a plan</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
            {issues.map((issue) => (
              <li key={issue}>{humanizeMinuteRanges(issue)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
