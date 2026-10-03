import { Coffee, Moon, PenLine, Pin } from "lucide-react";
import type { ReactNode } from "react";
import { buildTimeline, type TimelineRow } from "../planner/timeline.ts";
import type { PlannerSettings, ScheduleResult, ScheduledTaskBlock, Task } from "../types/planner.ts";
import { formatDuration, formatMinute, formatMinuteRange } from "../utils/time.ts";

const LEGEND = [
  { tone: "task", label: "Task" },
  { tone: "commitment", label: "Commitment" },
  { tone: "break", label: "Break" },
  { tone: "buffer", label: "Buffer" },
  { tone: "open", label: "Open" },
] as const;

export function ScheduleTimeline({
  result,
  settings,
  tasks,
  onToggleCompleted,
}: {
  result: ScheduleResult;
  settings: PlannerSettings;
  tasks: readonly Task[];
  onToggleCompleted: (id: string) => void;
}) {
  const rows = buildTimeline(result, settings);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <section aria-labelledby="timeline-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 id="timeline-heading" className="font-serif text-3xl text-ink sm:text-4xl">
          The day
        </h2>
        <p className="kicker">{formatMinuteRange(settings.planningStartMinute, settings.planningEndMinute)}</p>
      </div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Schedule legend">
        {LEGEND.map((item) => (
          <li key={item.tone} className="kind-pill">
            <span className={`swatch swatch-${item.tone}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            <TimelineItem row={row} task={taskForRow(row, tasksById)} onToggleCompleted={onToggleCompleted} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function taskForRow(row: TimelineRow, tasksById: ReadonlyMap<string, Task>): Task | undefined {
  if (row.kind !== "task" || row.block.kind !== "task") {
    return undefined;
  }

  return tasksById.get(row.block.taskId);
}

function TimelineItem({
  row,
  task,
  onToggleCompleted,
}: {
  row: TimelineRow;
  task: Task | undefined;
  onToggleCompleted: (id: string) => void;
}) {
  if (row.kind === "open" || row.kind === "buffer") {
    return (
      <Row
        tone={row.kind}
        start={row.startMinute}
        end={row.endMinute}
        title={row.kind === "buffer" ? "End-of-day buffer" : "Open"}
        detail={
          row.kind === "buffer"
            ? `${formatDuration(row.endMinute - row.startMinute)} kept free of tasks, commitments, and breaks.`
            : `${formatDuration(row.endMinute - row.startMinute)} still unassigned.`
        }
        icon={row.kind === "buffer" ? <Moon className="size-4" aria-hidden="true" /> : null}
      />
    );
  }

  const duration = row.block.endMinute - row.block.startMinute;

  if (row.block.kind === "task") {
    return (
      <Row
        tone="task"
        start={row.block.startMinute}
        end={row.block.endMinute}
        title={row.block.title}
        detail={<TaskDetail block={row.block} task={task} duration={duration} />}
        icon={<PenLine className="size-4" aria-hidden="true" />}
        action={
          task ? (
            <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted">
              <input
                className="check-input"
                type="checkbox"
                checked={task.completed}
                onChange={() => onToggleCompleted(task.id)}
              />
              Mark complete
            </label>
          ) : null
        }
      />
    );
  }

  if (row.block.kind === "commitment") {
    return (
      <Row
        tone="commitment"
        start={row.block.startMinute}
        end={row.block.endMinute}
        title={row.block.title}
        detail={`${formatDuration(duration)} held in place.`}
        icon={<Pin className="size-4" aria-hidden="true" />}
      />
    );
  }

  return (
    <Row
      tone="break"
      start={row.block.startMinute}
      end={row.block.endMinute}
      title="Break"
      detail={`${formatDuration(duration)} inserted after the work-minute limit.`}
      icon={<Coffee className="size-4" aria-hidden="true" />}
    />
  );
}

function TaskDetail({
  block,
  task,
  duration,
}: {
  block: ScheduledTaskBlock;
  task: Task | undefined;
  duration: number;
}) {
  const deadline = task?.deadlineMinute;
  const window = task?.preferredWindow;

  return (
    <span>
      {formatDuration(duration)} · {block.priority} priority · {block.energy} energy
      {deadline !== undefined ? ` · due ${formatMinute(deadline)}` : ""}
      {window ? ` · prefers ${formatMinuteRange(window.startMinute, window.endMinute)}` : ""}
    </span>
  );
}

function Row({
  tone,
  start,
  end,
  title,
  detail,
  icon,
  action,
}: {
  tone: "task" | "commitment" | "break" | "open" | "buffer";
  start: number;
  end: number;
  title: string;
  detail: ReactNode;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <article className="timeline-row">
      <div className="timeline-time">
        <p className="font-serif text-base leading-none text-ink sm:text-lg">{formatMinute(start)}</p>
        <p className="mt-1 text-xs text-faint sm:text-sm">{formatMinute(end)}</p>
      </div>
      <div className={`timeline-card timeline-${tone}`}>
        <p className="kind-pill">
          <span className={`swatch swatch-${tone}`} aria-hidden="true" />
          {toneLabel(tone)}
        </p>
        <div className="mt-2 flex items-start gap-2">
          <span className={iconClass(tone)}>{icon}</span>
          <h3 className={`min-w-0 font-serif text-xl leading-tight sm:text-2xl ${tone === "open" ? "text-muted italic" : "text-ink"}`}>
            {title}
          </h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>
        {action}
      </div>
    </article>
  );
}

function toneLabel(tone: "task" | "commitment" | "break" | "open" | "buffer"): string {
  if (tone === "task") {
    return "Task";
  }

  if (tone === "commitment") {
    return "Commitment";
  }

  if (tone === "break") {
    return "Break";
  }

  if (tone === "buffer") {
    return "Buffer";
  }

  return "Open";
}

function iconClass(tone: "task" | "commitment" | "break" | "open" | "buffer"): string {
  if (tone === "task") {
    return "mt-1 text-accent";
  }

  if (tone === "commitment") {
    return "mt-1 text-commitment";
  }

  if (tone === "break") {
    return "mt-1 text-break";
  }

  if (tone === "open") {
    return "text-faint";
  }

  return "mt-1 text-buffer";
}
