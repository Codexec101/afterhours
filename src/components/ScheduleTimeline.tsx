import type { ReactNode } from "react";
import { buildTimelineLayout, type LaidOutBlock } from "../planner/timeline.ts";
import type {
  EnergyLevel,
  PlannerSettings,
  Priority,
  ScheduleResult,
  ScheduledBlock,
  ScheduledTaskBlock,
  Task,
} from "../types/planner.ts";
import { formatDurationShort, formatHourLabel, formatMinute, formatMinuteRange } from "../utils/time.ts";

/** Narrowest readable width for one hour. Shorter windows fill the panel; longer ones scroll sideways. */
const HOUR_MIN_PX = 132;
const LABEL_COLUMN = "5.25rem";

const LEGEND = [
  { tone: "task", label: "Task" },
  { tone: "commitment", label: "Commitment" },
  { tone: "break", label: "Break" },
  { tone: "buffer", label: "Buffer" },
] as const;

const ENERGY_BARS: Record<EnergyLevel, number> = { low: 1, medium: 2, high: 3 };

export function ScheduleTimeline({
  result,
  settings,
  tasks,
  onToggleCompleted,
  onOpenTask,
}: {
  result: ScheduleResult;
  settings: PlannerSettings;
  tasks: readonly Task[];
  onToggleCompleted: (id: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const layout = buildTimelineLayout(result, settings);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const hours = layout.windowMinutes / 60;

  return (
    <section aria-labelledby="timeline-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id="timeline-heading" className="font-serif text-2xl text-ink sm:text-3xl">
            The day
          </h2>
          <p className="kicker mt-2">{formatMinuteRange(settings.planningStartMinute, settings.planningEndMinute)}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Schedule legend">
          {LEGEND.map((item) => (
            <li key={item.tone} className="kind-pill">
              <span className={`swatch swatch-${item.tone}`} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {layout.tasks.length === 0 ? (
        <p className="empty-note mb-4">
          No task was placed in this plan. Check Left for later below, or add tasks and update the plan.
        </p>
      ) : null}

      <ol className="sr-only">
        {result.blocks.map((block) => (
          <li key={block.id}>
            {block.title}, {block.kind}, {formatMinuteRange(block.startMinute, block.endMinute)}
          </li>
        ))}
      </ol>

      <div className="overflow-x-auto overflow-y-hidden pb-1" tabIndex={0} aria-label="Daily timeline, scrolls sideways on narrow screens">
        <div style={{ minWidth: `calc(${LABEL_COLUMN} + ${Math.ceil(hours * HOUR_MIN_PX)}px)` }}>
          <Row label="" height="1.75rem" first>
            {layout.ticks.map((tick, index) => (
              <span
                key={tick.minute}
                className="tl-tick-label"
                style={{
                  left: `${tick.leftPercent}%`,
                  transform:
                    tick.leftPercent < 3 && index === 0
                      ? "none"
                      : tick.leftPercent > 97
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {formatHourLabel(tick.minute)}
              </span>
            ))}
          </Row>
          <Row label="Tasks" height="5.75rem" layout={layout} bufferLabel>
            {layout.tasks.map((item) => (
              <TaskBlock
                key={item.block.id}
                item={item}
                task={item.block.kind === "task" ? tasksById.get(item.block.taskId) : undefined}
                onToggleCompleted={onToggleCompleted}
                onOpenTask={onOpenTask}
              />
            ))}
          </Row>
          {layout.commitments.length > 0 ? (
            <Row label="Fixed" height="4rem" layout={layout}>
              {layout.commitments.map((item) => (
                <PlainBlock key={item.block.id} item={item} tone="commitment" />
              ))}
            </Row>
          ) : null}
          {layout.breaks.length > 0 ? (
            <Row label="Breaks" height="3rem" layout={layout}>
              {layout.breaks.map((item) => (
                <PlainBlock key={item.block.id} item={item} tone="break" />
              ))}
            </Row>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  height,
  layout,
  bufferLabel,
  first,
  children,
}: {
  label: string;
  height: string;
  layout?: ReturnType<typeof buildTimelineLayout>;
  bufferLabel?: boolean;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex ${first ? "" : "border-t border-line/70"}`}>
      <div className="tl-lane-label" style={{ width: LABEL_COLUMN }}>
        {label}
      </div>
      <div className="relative min-w-0 flex-1" style={{ height }}>
        {layout ? (
          <>
            {layout.ticks.map((tick) => (
              <span key={tick.minute} className="tl-gridline" style={{ left: `${tick.leftPercent}%` }} aria-hidden="true" />
            ))}
            {layout.buffer ? (
              <div
                className="tl-buffer"
                style={{ left: `${layout.buffer.leftPercent}%`, width: `${layout.buffer.widthPercent}%` }}
                title={`End-of-day buffer, ${formatMinuteRange(layout.buffer.startMinute, layout.buffer.endMinute)}, kept free`}
              >
                {bufferLabel ? <span className="tl-buffer-label">Buffer</span> : null}
              </div>
            ) : null}
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function position(item: LaidOutBlock) {
  return {
    left: `calc(${item.leftPercent}% + 1px)`,
    width: `calc(${item.widthPercent}% - 2px)`,
  };
}

function tooltip(block: ScheduledBlock, extra?: string): string {
  const minutes = block.endMinute - block.startMinute;
  const parts = [block.title, formatMinuteRange(block.startMinute, block.endMinute), formatDurationShort(minutes)];

  if (extra) {
    parts.push(extra);
  }

  return parts.join(" · ");
}

function TaskBlock({
  item,
  task,
  onToggleCompleted,
  onOpenTask,
}: {
  item: LaidOutBlock;
  task: Task | undefined;
  onToggleCompleted: (id: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const block = item.block as ScheduledTaskBlock;
  const minutes = block.endMinute - block.startMinute;
  const label = `${capitalize(block.priority)} priority`;

  return (
    <div className="tl-block tl-task" style={position(item)} title={tooltip(block, `${label}, ${block.energy} energy`)}>
      <div className="tl-inner">
        {task ? (
          <input
            className="check-input tl-check"
            type="checkbox"
            checked={task.completed}
            onChange={() => onToggleCompleted(task.id)}
            aria-label={`Mark ${block.title} complete`}
          />
        ) : null}
        {task ? (
          <button type="button" className="tl-main" onClick={() => onOpenTask(task.id)} aria-label={`Edit ${block.title}`}>
            <TaskText block={block} minutes={minutes} priority={block.priority} />
          </button>
        ) : (
          <div className="tl-main">
            <TaskText block={block} minutes={minutes} priority={block.priority} />
          </div>
        )}
        <EnergyMark level={block.energy} />
      </div>
    </div>
  );
}

function TaskText({ block, minutes, priority }: { block: ScheduledTaskBlock; minutes: number; priority: Priority }) {
  return (
    <>
      <span className="tl-title">{block.title}</span>
      <span className="tl-meta tl-dur">
        {formatDurationShort(minutes)} · {capitalize(priority)}
      </span>
      <span className="tl-meta tl-range">{formatMinuteRange(block.startMinute, block.endMinute)}</span>
    </>
  );
}

function EnergyMark({ level }: { level: EnergyLevel }) {
  const filled = ENERGY_BARS[level];

  return (
    <span className="tl-energy" role="img" aria-label={`${level} energy`} title={`${capitalize(level)} energy`}>
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={bar <= filled ? "tl-energy-bar tl-energy-on" : "tl-energy-bar"} />
      ))}
    </span>
  );
}

function PlainBlock({ item, tone }: { item: LaidOutBlock; tone: "commitment" | "break" }) {
  const { block } = item;
  const minutes = block.endMinute - block.startMinute;

  return (
    <div className={`tl-block tl-${tone}`} style={position(item)} title={tooltip(block)}>
      <div className="tl-inner">
        <div className="tl-main">
          <span className="tl-title">{tone === "break" ? "Break" : block.title}</span>
          {tone === "break" ? (
            <span className="tl-meta tl-dur">{formatDurationShort(minutes)}</span>
          ) : (
            <span className="tl-meta tl-range">
              {formatMinute(block.startMinute)} – {formatMinute(block.endMinute)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
