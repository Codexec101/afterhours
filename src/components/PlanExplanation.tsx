import { explainPlan } from "../planner/explainPlan.ts";
import type { FixedCommitment, PlannerSettings, ScheduleResult, Task } from "../types/planner.ts";

export function PlanExplanation({
  result,
  tasks,
  commitments,
  settings,
}: {
  result: ScheduleResult;
  tasks: readonly Task[];
  commitments: readonly FixedCommitment[];
  settings: PlannerSettings;
}) {
  const explanation = explainPlan(result, tasks, commitments, settings);

  return (
    <section aria-labelledby="why-heading" className="border-t border-line pt-8">
      <h2 id="why-heading" className="font-serif text-2xl text-ink">
        Why this plan?
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        {explanation.scheduledCount} scheduled, {explanation.deferredCount} deferred. The notes below use the scheduler’s
        blocks, placement scores, and written rules.
      </p>
      <div className="mt-8 space-y-6">
        {explanation.rules.map((rule) => (
          <article key={rule.title}>
            <h3 className="kicker">{rule.title}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">{rule.body}</p>
          </article>
        ))}
      </div>
      {explanation.placements.length > 0 ? (
        <div className="mt-10 space-y-6">
          <h3 className="font-serif text-2xl text-ink">Placement notes</h3>
          {explanation.placements.map((placement) => (
            <article key={placement.id} className="border-t border-line pt-4">
              <h4 className="text-pretty text-ink">
                {placement.title}
                <span className="ml-3 kicker">{placement.kind}</span>
              </h4>
              <ul className="mt-3 space-y-2">
                {placement.facts.map((fact) => (
                  <li key={fact} className="text-sm leading-relaxed text-muted">
                    {fact}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted">No tasks, commitments, or breaks were placed inside the window.</p>
      )}
    </section>
  );
}
