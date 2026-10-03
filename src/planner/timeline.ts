import type { PlannerSettings, ScheduleResult, ScheduledBlock } from "../types/planner.ts";

export interface OpenRow {
  kind: "open";
  id: string;
  startMinute: number;
  endMinute: number;
}

export interface BufferRow {
  kind: "buffer";
  id: string;
  startMinute: number;
  endMinute: number;
}

export interface BlockRow {
  kind: ScheduledBlock["kind"];
  id: string;
  block: ScheduledBlock;
}

export type TimelineRow = BlockRow | OpenRow | BufferRow;

/**
 * Chronological reading order for one generated plan.
 * Open stretches and the end-of-day buffer are display rows.
 * They are not scheduled blocks from the engine.
 */
export function buildTimeline(result: ScheduleResult, settings: PlannerSettings): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const bufferStart = settings.planningEndMinute - settings.endOfDayBufferMinutes;
  let cursor = settings.planningStartMinute;

  for (const block of result.blocks) {
    if (block.startMinute > cursor) {
      rows.push(openRow(cursor, block.startMinute));
    }

    rows.push({
      kind: block.kind,
      id: block.id,
      block,
    });
    cursor = Math.max(cursor, block.endMinute);
  }

  if (cursor < bufferStart) {
    rows.push(openRow(cursor, bufferStart));
  }

  if (settings.endOfDayBufferMinutes > 0) {
    rows.push({
      kind: "buffer",
      id: "end-of-day-buffer",
      startMinute: bufferStart,
      endMinute: settings.planningEndMinute,
    });
  }

  return rows;
}

function openRow(startMinute: number, endMinute: number): OpenRow {
  return {
    kind: "open",
    id: `open-${startMinute}-${endMinute}`,
    startMinute,
    endMinute,
  };
}

export interface LaidOutBlock {
  block: ScheduledBlock;
  /** Percent of the planning window, clamped to 0..100. */
  leftPercent: number;
  widthPercent: number;
}

export interface TimelineLayout {
  windowMinutes: number;
  /** Whole-hour instants inside the planning window. */
  ticks: { minute: number; leftPercent: number }[];
  tasks: LaidOutBlock[];
  commitments: LaidOutBlock[];
  breaks: LaidOutBlock[];
  buffer: { startMinute: number; endMinute: number; leftPercent: number; widthPercent: number } | null;
}

/**
 * Horizontal geometry for one generated plan. Positions come straight from the
 * engine's blocks and the planning window; nothing is rescheduled here.
 * Each lane holds one kind of block, and the engine never overlaps blocks of
 * the same kind, so lane items cannot collide.
 */
export function buildTimelineLayout(result: ScheduleResult, settings: PlannerSettings): TimelineLayout {
  const start = settings.planningStartMinute;
  const end = settings.planningEndMinute;
  const span = end - start;
  const percent = (minute: number) => ((Math.min(end, Math.max(start, minute)) - start) / span) * 100;

  const place = (block: ScheduledBlock): LaidOutBlock | null => {
    const from = percent(block.startMinute);
    const to = percent(block.endMinute);

    return to > from ? { block, leftPercent: from, widthPercent: to - from } : null;
  };

  const lanes = { task: [] as LaidOutBlock[], commitment: [] as LaidOutBlock[], break: [] as LaidOutBlock[] };

  for (const block of result.blocks) {
    const placed = place(block);

    if (placed) {
      lanes[block.kind].push(placed);
    }
  }

  const ticks: TimelineLayout["ticks"] = [];

  for (let minute = Math.ceil(start / 60) * 60; minute <= end; minute += 60) {
    ticks.push({ minute, leftPercent: percent(minute) });
  }

  const bufferStart = end - settings.endOfDayBufferMinutes;

  return {
    windowMinutes: span,
    ticks,
    tasks: lanes.task,
    commitments: lanes.commitment,
    breaks: lanes.break,
    buffer:
      settings.endOfDayBufferMinutes > 0
        ? {
            startMinute: bufferStart,
            endMinute: end,
            leftPercent: percent(bufferStart),
            widthPercent: 100 - percent(bufferStart),
          }
        : null,
  };
}
