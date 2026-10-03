import { describe, expect, it } from "vitest";
import { createSchedule } from "../engine/scheduler.ts";
import type { PlannerSettings } from "../types/planner.ts";
import { buildTimeline } from "./timeline.ts";

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
