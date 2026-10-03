import { describe, expect, it } from "vitest";
import { createSchedule } from "../engine/scheduler.ts";
import type { PlannerSettings } from "../types/planner.ts";
import { buildTimeline, buildTimelineLayout } from "./timeline.ts";

const settings: PlannerSettings = {
  planningStartMinute: 60,
  planningEndMinute: 180,
  breakFrequencyMinutes: 90,
  breakDurationMinutes: 0,
  endOfDayBufferMinutes: 30,
};

describe("buildTimeline", () => {
  it("fills open time and appends the buffer after scheduled blocks", () => {
    const result = createSchedule(
      [
        {
          id: "deep",
          title: "Deep work",
          durationMinutes: 30,
          priority: "high",
          energy: "medium",
          completed: false,
        },
      ],
      [{ id: "sync", title: "Sync", startMinute: 90, endMinute: 120 }],
      settings,
    );
    const rows = buildTimeline(result, settings);

    expect(rows.map((row) => row.kind)).toEqual(["task", "commitment", "open", "buffer"]);
    expect(rows.at(-1)).toMatchObject({ kind: "buffer", startMinute: 150, endMinute: 180 });

    const covered = rows.reduce((total, row) => {
      if (row.kind === "open" || row.kind === "buffer") {
        return total + (row.endMinute - row.startMinute);
      }

      return total + (row.block.endMinute - row.block.startMinute);
    }, 0);

    expect(covered).toBe(settings.planningEndMinute - settings.planningStartMinute);
  });
});

describe("buildTimelineLayout", () => {
  const window: PlannerSettings = {
    planningStartMinute: 9 * 60 + 30,
    planningEndMinute: 13 * 60 + 30,
    breakFrequencyMinutes: 60,
    breakDurationMinutes: 10,
    endOfDayBufferMinutes: 30,
  };
  const task = (id: string, durationMinutes: number) => ({
    id,
    title: id,
    durationMinutes,
    priority: "medium" as const,
    energy: "medium" as const,
    completed: false,
  });

  it("positions blocks by their real minutes inside the window", () => {
    const result = createSchedule(
      [task("a", 60)],
      [{ id: "c", title: "Call", startMinute: 11 * 60 + 30, endMinute: 12 * 60 + 30 }],
      window,
    );
    const layout = buildTimelineLayout(result, window);
    const call = layout.commitments[0];

    expect(layout.windowMinutes).toBe(240);
    expect(call?.leftPercent).toBeCloseTo((120 / 240) * 100);
    expect(call?.widthPercent).toBeCloseTo((60 / 240) * 100);
    expect(layout.tasks).toHaveLength(1);
  });

  it("ticks only whole hours inside the window and places the buffer at the end", () => {
    const layout = buildTimelineLayout(createSchedule([], [], window), window);

    expect(layout.ticks.map((tick) => tick.minute)).toEqual([10 * 60, 11 * 60, 12 * 60, 13 * 60]);
    expect(layout.ticks[0]?.leftPercent).toBeCloseTo((30 / 240) * 100);
    expect(layout.buffer).toMatchObject({ startMinute: 13 * 60, endMinute: 13 * 60 + 30 });
    expect((layout.buffer?.leftPercent ?? 0) + (layout.buffer?.widthPercent ?? 0)).toBeCloseTo(100);
  });

  it("keeps blocks of one kind from overlapping and inside 0..100 percent", () => {
    const result = createSchedule([task("a", 60), task("b", 45), task("c", 30), task("d", 30)], [], window);
    const layout = buildTimelineLayout(result, window);

    for (const lane of [layout.tasks, layout.breaks]) {
      const sorted = lane.slice().sort((left, right) => left.leftPercent - right.leftPercent);

      sorted.forEach((item, index) => {
        expect(item.leftPercent).toBeGreaterThanOrEqual(0);
        expect(item.leftPercent + item.widthPercent).toBeLessThanOrEqual(100 + 1e-9);

        const next = sorted[index + 1];

        if (next) {
          expect(item.leftPercent + item.widthPercent).toBeLessThanOrEqual(next.leftPercent + 1e-9);
        }
      });
    }
  });
});

