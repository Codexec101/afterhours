import { CircleOff } from "lucide-react";
import { deferralLabel } from "../planner/explainPlan.ts";
import type { DeferredTask, Task } from "../types/planner.ts";
import { formatDuration, formatMinute } from "../utils/time.ts";

export function DeferredTasks({ deferred, tasks }: { deferred: readonly DeferredTask[]; tasks: readonly Task[] }) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <section aria-labelledby="deferred-heading" className="mt-12">
      <h2 id="deferred-heading" className="font-serif text-3xl text-ink">
        Left for later
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        These tasks stayed out of the plan. Each note is the scheduler’s reason, and each task still needs one continuous block.
      </p>
      {deferred.length === 0 ? (
        <p className="empty-note mt-5">Every active task found a single block in this plan.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {deferred.map((item) => {
            const task = tasksById.get(item.taskId);

            return (
              <li key={item.taskId} className="panel px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-start gap-3">
                  <CircleOff className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="kicker text-accent">{deferralLabel(item.reason)}</p>
                    <h3 className="mt-2 font-serif text-2xl text-ink">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-ink">{item.message}</p>
                    {task ? (
                      <p className="mt-3 text-sm leading-relaxed text-faint">
                        Needs {formatDuration(task.durationMinutes)} in one block · {task.priority} priority · {task.energy}{" "}
                        energy
                        {task.deadlineMinute !== undefined ? ` · due ${formatMinute(task.deadlineMinute)}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
