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
