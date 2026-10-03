import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlannerValidationError } from "./engine/validation.ts";
import { createSchedule } from "./engine/scheduler.ts";
import { CommitmentForm } from "./components/CommitmentForm.tsx";
import { DeferredTasks } from "./components/DeferredTasks.tsx";
import { EmptyPlan } from "./components/EmptyPlan.tsx";
import { GeneratePlan } from "./components/GeneratePlan.tsx";
import { Notice } from "./components/Notice.tsx";
import { PlanExplanation } from "./components/PlanExplanation.tsx";
import { PlanningControls } from "./components/PlanningControls.tsx";
import { SummaryCards, type SummaryInput } from "./components/SummaryCards.tsx";
import { TopNav } from "./components/TopNav.tsx";
import { ScheduleTimeline } from "./components/ScheduleTimeline.tsx";
import { IssueList, TaskEntry } from "./components/TaskEntry.tsx";
import { TimeAccounting } from "./components/TimeAccounting.tsx";
import { openLocalStorage, readDesk, writeDesk, type DeskSnapshot } from "./planner/deskStorage.ts";
import {
  defaultSettingsDraft,
  parseSettingsDraft,
  taskFromFields,
  type ParsedTaskFields,
  type SettingsDraft,
} from "./planner/parsePlannerForm.ts";
import { SAMPLE_DAY, sampleSettingsDraft } from "./planner/sampleDay.ts";
import type { FixedCommitment, PlannerSettings, ScheduleResult, Task } from "./types/planner.ts";

interface GeneratedPlan {
  result: ScheduleResult;
  tasks: Task[];
  commitments: FixedCommitment[];
  settings: PlannerSettings;
}

interface BootState {
  settings: SettingsDraft;
  tasks: Task[];
  commitments: FixedCommitment[];
  plan: GeneratedPlan | null;
  persist: boolean;
  storageNote: string | null;
}

export default function App() {
  const [now] = useState(() => new Date());
  const [boot] = useState(() => loadBoot(now));
  const [settings, setSettings] = useState<SettingsDraft>(boot.settings);
  const [tasks, setTasks] = useState<Task[]>(boot.tasks);
  const [commitments, setCommitments] = useState<FixedCommitment[]>(boot.commitments);
  const [plan, setPlan] = useState<GeneratedPlan | null>(boot.plan);
  const [issues, setIssues] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [storageNote, setStorageNote] = useState<string | null>(boot.storageNote);
  const [deskEpoch, setDeskEpoch] = useState(0);
  const persist = useRef(boot.persist);
  const savedBaseline = useRef<string | null>(null);

  useEffect(() => {
    const snapshot = deskSnapshot(settings, tasks, commitments, plan);
    const serialized = JSON.stringify(snapshot);

    if (savedBaseline.current === null) {
      savedBaseline.current = serialized;
      return;
    }

    if (!persist.current || savedBaseline.current === serialized) {
      return;
    }

    const storage = openLocalStorage();

    if (!storage) {
      persist.current = false;
      setStorageNote("This browser could not open local storage. The desk still works in this tab.");
      return;
    }

    try {
      const wrote = writeDesk(storage, now, snapshot);

      if (wrote === "newer") {
        persist.current = false;
        setStorageNote("Saved plans belong to a newer version of Afterhours, so this session will not replace them.");
        return;
      }

      if (wrote === "failed") {
        setStorageNote("Changes could not be saved in this browser. The desk still works in this tab.");
        return;
      }

      savedBaseline.current = serialized;
    } catch {
      setStorageNote("Changes could not be saved in this browser. The desk still works in this tab.");
    }
  }, [settings, tasks, commitments, plan, now]);

  const [editRequest, setEditRequest] = useState<{ id: string; nonce: number } | null>(null);

  function changeSettings(next: SettingsDraft) {
    setSettings(next);
    setFeedback(null);
    setIssues([]);
  }

  function addTask(fields: ParsedTaskFields) {
    publish(tasks.concat(taskFromFields(createId(), fields)), commitments, "Task added.");
  }

  function updateTask(id: string, fields: ParsedTaskFields) {
    publish(
      tasks.map((task) => (task.id === id ? taskFromFields(id, fields) : task)),
      commitments,
      "Task saved.",
    );
  }

  function removeTask(id: string) {
    publish(
      tasks.filter((task) => task.id !== id),
      commitments,
      "Task removed.",
    );
  }

  function toggleCompleted(id: string) {
    const next = tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task));
    const completed = next.find((task) => task.id === id)?.completed;
    publish(
      next,
      commitments,
      completed ? "Marked complete." : "Marked as still to do.",
    );
  }

  function addCommitment(value: { title: string; startMinute: number; endMinute: number }) {
    publish(
      tasks,
      commitments.concat({ id: createId(), title: value.title, startMinute: value.startMinute, endMinute: value.endMinute }),
      "Commitment added.",
    );
  }

  function updateCommitment(id: string, value: { title: string; startMinute: number; endMinute: number }) {
    publish(
      tasks,
      commitments.map((commitment) => (commitment.id === id ? { id, ...value } : commitment)),
      "Commitment saved.",
    );
  }

  function removeCommitment(id: string) {
    publish(
      tasks,
      commitments.filter((commitment) => commitment.id !== id),
      "Commitment removed.",
    );
  }

  function publish(nextTasks: Task[], nextCommitments: FixedCommitment[], success: string) {
    setTasks(nextTasks);
    setCommitments(nextCommitments);

    if (!plan) {
      setFeedback(null);
      return;
    }

    const refreshed = refreshPlan(plan, nextTasks, nextCommitments);

    if (!refreshed.ok) {
      setIssues(refreshed.issues);
      setFeedback(null);
      return;
    }

    setPlan(refreshed.plan);
    setIssues([]);
    setFeedback(success);
  }

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSettingsDraft(settings);

    if (!parsed.ok) {
      setIssues(parsed.issues);
      setFeedback(null);
      return;
    }

    try {
      setPlan(makePlan(tasks, commitments, parsed.value));
      setIssues([]);
      setFeedback("Plan generated for these hours.");
    } catch (error) {
      setIssues(errorIssues(error));
      setFeedback(null);
    }
  }

  function loadSample() {
    setSettings(sampleSettingsDraft());
    setTasks(SAMPLE_DAY.tasks.map(copyTask));
    setCommitments(SAMPLE_DAY.commitments.map((commitment) => ({ ...commitment })));
    setPlan(null);
    setIssues([]);
    setFeedback("Sample evening loaded. Generate a plan when you want it placed.");
    setDeskEpoch((epoch) => epoch + 1);
  }

  function clearDesk() {
    setSettings(defaultSettingsDraft(now));
    setTasks([]);
    setCommitments([]);
    setPlan(null);
    setIssues([]);
    setFeedback("The desk is clear.");
    setDeskEpoch((epoch) => epoch + 1);
  }

  const stale = plan !== null && !planMatches(plan, tasks, commitments, settings);

  const parsedWindow = parseSettingsDraft(settings);
  const summary: SummaryInput = {
    window: parsedWindow.ok
      ? {
          startMinute: parsedWindow.value.planningStartMinute,
          endMinute: parsedWindow.value.planningEndMinute,
          bufferMinutes: parsedWindow.value.endOfDayBufferMinutes,
        }
      : null,
    commitments,
    plan: plan
      ? {
          accounting: plan.result.accounting,
          placedTasks: plan.result.blocks.filter((block) => block.kind === "task").length,
          deferredTasks: plan.result.deferred.length,
          plannedTasks: plan.tasks.filter((task) => !task.completed).length,
        }
      : null,
    stale,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => task.completed).length,
  };

  return (
    <>
      <TopNav now={now} />
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-8">
        <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-20 pt-6 pb-4 sm:pt-8 sm:pb-6">
          <p className="kicker">Overview</p>
          <div className="mt-2.5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="min-w-0">
              <h1
                id="overview-heading"
                className="font-serif text-3xl leading-tight font-medium tracking-tight text-ink sm:text-4xl lg:text-5xl"
              >
                Shape your day.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                Afterhours arranges flexible tasks around your fixed commitments and your energy, for the hours that are
                left today.
              </p>
            </div>
            <div className="min-w-0 lg:max-w-xl lg:shrink-0">
              <GeneratePlan
                issues={issues}
                hasPlan={plan !== null}
                stale={stale}
                onLoadSample={loadSample}
                onClear={clearDesk}
              />
            </div>
          </div>
          {storageNote || feedback ? (
            <div className="mt-4 space-y-3" aria-live="polite">
              {storageNote ? <Notice tone="warn">{storageNote}</Notice> : null}
              {feedback ? <Notice tone="ok">{feedback}</Notice> : null}
            </div>
          ) : null}
        </section>

        <div className="mt-5">
          <SummaryCards summary={summary} />
        </div>

        <div className="mt-6 min-w-0">
          {plan ? (
            <>
              {stale ? (
                <div className="mb-4">
                  <Notice tone="warn">
                    <p>This plan is behind the desk. Update it to match the latest hours, tasks, and commitments.</p>
                    <button type="submit" form="desk-form" className="btn btn-line mt-4">
                      Update the plan
                    </button>
                  </Notice>
                </div>
              ) : null}
              <div className="panel px-4 py-5 sm:px-8 sm:py-7">
                <ScheduleTimeline
                  result={plan.result}
                  settings={plan.settings}
                  tasks={tasks}
                  onToggleCompleted={toggleCompleted}
                  onOpenTask={(id) => setEditRequest({ id, nonce: Date.now() })}
                />
              </div>
            </>
          ) : (
            <EmptyPlan taskCount={tasks.length} commitmentCount={commitments.length} />
          )}
        </div>

        {plan ? (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
            <div className="panel px-4 py-5 sm:px-6 sm:py-6">
              <DeferredTasks deferred={plan.result.deferred} tasks={plan.tasks} />
            </div>
            <div className="panel px-4 py-5 sm:px-6 sm:py-6">
              <TimeAccounting accounting={plan.result.accounting} />
            </div>
          </div>
        ) : null}

        <section id="planner" aria-labelledby="planner-heading" className="scroll-mt-20 pt-14">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="kicker">Workspace</p>
              <h2 id="planner-heading" className="font-serif text-3xl text-ink">
                Planner
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-faint">
              Add tasks and commitments, adjust available hours, and regenerate your personalized day plan.
            </p>
          </div>
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-12">
            <div className="space-y-8 lg:col-span-7 xl:col-span-8">
              <div id="tasks" className="panel scroll-mt-20 p-5 sm:p-7">
                <TaskEntry
                  key={`tasks-${deskEpoch}`}
                  editRequest={editRequest}
                  tasks={tasks}
                  onAdd={addTask}
                  onUpdate={updateTask}
                  onRemove={removeTask}
                  onToggleCompleted={toggleCompleted}
                />
              </div>
              <div id="commitments" className="panel scroll-mt-20 p-5 sm:p-7">
                <CommitmentForm
                  key={`commitments-${deskEpoch}`}
                  commitments={commitments}
                  onAdd={addCommitment}
                  onUpdate={updateCommitment}
                  onRemove={removeCommitment}
                />
              </div>
            </div>
            <div id="settings" className="scroll-mt-20 lg:col-span-5 xl:col-span-4">
              <form
                id="desk-form"
                className="panel p-5 sm:p-7 space-y-6 lg:sticky lg:top-20"
                onSubmit={generate}
                noValidate
                aria-describedby={issues.length > 0 ? "plan-issues" : undefined}
              >
                <PlanningControls draft={settings} onChange={changeSettings} />
                {issues.length > 0 ? (
                  <div id="plan-issues" className="border-t border-line/70 pt-4">
                    <IssueList issues={issues} />
                  </div>
                ) : null}
                <button type="submit" className="btn btn-primary w-full">
                  {stale ? "Update plan" : plan ? "Regenerate plan" : "Generate plan"}
                </button>
              </form>
            </div>
          </div>
        </section>

        {plan ? (
          <div className="mt-14">
            <PlanExplanation
              result={plan.result}
              tasks={plan.tasks}
              commitments={plan.commitments}
              settings={plan.settings}
            />
          </div>
        ) : null}
      </main>
    </>
  );
}

function refreshPlan(
  current: GeneratedPlan,
  tasks: readonly Task[],
  commitments: readonly FixedCommitment[],
): { ok: true; plan: GeneratedPlan } | { ok: false; issues: string[] } {
  try {
    return { ok: true, plan: makePlan(tasks, commitments, current.settings) };
  } catch (error) {
    return { ok: false, issues: errorIssues(error) };
  }
}

function makePlan(tasks: readonly Task[], commitments: readonly FixedCommitment[], settings: PlannerSettings): GeneratedPlan {
  return {
    result: createSchedule(tasks, commitments, settings),
    tasks: tasks.map(copyTask),
    commitments: commitments.map((commitment) => ({ ...commitment })),
    settings: { ...settings },
  };
}

function errorIssues(error: unknown): string[] {
  if (error instanceof PlannerValidationError) {
    return [...error.issues];
  }

  return [error instanceof Error ? error.message : "The schedule could not be created."];
}

function planMatches(
  plan: GeneratedPlan,
  tasks: readonly Task[],
  commitments: readonly FixedCommitment[],
  draft: SettingsDraft,
): boolean {
  const parsed = parseSettingsDraft(draft);

  if (!parsed.ok) {
    return false;
  }

  return (
    JSON.stringify(snapshot(tasks, commitments, parsed.value)) ===
    JSON.stringify(snapshot(plan.tasks, plan.commitments, plan.settings))
  );
}

function snapshot(tasks: readonly Task[], commitments: readonly FixedCommitment[], settings: PlannerSettings) {
  return {
    tasks: tasks.map(copyTask),
    commitments: commitments.map((commitment) => ({ ...commitment })),
    settings: { ...settings },
  };
}

function deskSnapshot(
  settings: SettingsDraft,
  tasks: readonly Task[],
  commitments: readonly FixedCommitment[],
  plan: GeneratedPlan | null,
): DeskSnapshot {
  return {
    settings,
    tasks: tasks.map(copyTask),
    commitments: commitments.map((commitment) => ({ ...commitment })),
    planInputs: plan
      ? {
          tasks: plan.tasks.map(copyTask),
          commitments: plan.commitments.map((commitment) => ({ ...commitment })),
          settings: { ...plan.settings },
        }
      : null,
  };
}

function copyTask(task: Task): Task {
  return {
    ...task,
    preferredWindow: task.preferredWindow ? { ...task.preferredWindow } : undefined,
  };
}

function loadBoot(now: Date): BootState {
  const fresh = (): BootState => ({
    settings: defaultSettingsDraft(now),
    tasks: [],
    commitments: [],
    plan: null,
    persist: true,
    storageNote: null,
  });

  const storage = openLocalStorage();

  if (!storage) {
    return {
      ...fresh(),
      persist: false,
      storageNote: "This browser could not open local storage. The desk still works in this tab.",
    };
  }

  const saved = readDesk(storage, now);

  if (saved.status === "unavailable") {
    return {
      ...fresh(),
      persist: false,
      storageNote: "Saved plans could not be read. The desk still works in this tab and will not replace them.",
    };
  }

  if (saved.status === "newer") {
    return {
      ...fresh(),
      persist: false,
      storageNote: "Saved plans belong to a newer version of Afterhours. This desk started fresh and will not replace them.",
    };
  }

  if (saved.status === "malformed") {
    return {
      ...fresh(),
      storageNote: "Saved plans could not be read, so this desk started fresh.",
    };
  }

  if (saved.status === "empty") {
    return fresh();
  }

  const plan = restorePlan(saved.desk.planInputs);
  let storageNote: string | null = null;

  if (saved.carriedSettings) {
    storageNote = "Today uses the hours from your last saved day. Tasks and commitments start empty.";
  } else if (saved.desk.planInputs && !plan) {
    storageNote = "A saved plan could not be rebuilt. Generate again once the hours and blocks are valid.";
  }

  return {
    settings: saved.desk.settings,
    tasks: saved.desk.tasks.map(copyTask),
    commitments: saved.desk.commitments.map((commitment) => ({ ...commitment })),
    plan,
    persist: true,
    storageNote,
  };
}

function restorePlan(planInputs: DeskSnapshot["planInputs"]): GeneratedPlan | null {
  if (!planInputs) {
    return null;
  }

  try {
    return makePlan(planInputs.tasks, planInputs.commitments, planInputs.settings);
  } catch {
    return null;
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
