import { describe, expect, it } from "vitest";
import type { FixedCommitment, PlannerSettings, Task } from "../types/planner.ts";
import { createSchedule } from "./scheduler.ts";
import { PlannerValidationError, validatePlannerInput } from "./validation.ts";

function settings(overrides: Partial<PlannerSettings> = {}): PlannerSettings {
  return {
    planningStartMinute: 9 * 60,
    planningEndMinute: 17 * 60,
    breakFrequencyMinutes: 90,
    breakDurationMinutes: 15,
    endOfDayBufferMinutes: 30,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "write",
    title: "Write",
    durationMinutes: 30,
    priority: "medium",
    energy: "medium",
    completed: false,
    ...overrides,
  };
}

function commitment(overrides: Partial<FixedCommitment> = {}): FixedCommitment {
  return {
    id: "standup",
    title: "Standup",
    startMinute: 10 * 60,
    endMinute: 11 * 60,
    ...overrides,
  };
}

describe("validatePlannerInput", () => {
  it("rejects an overnight planning window", () => {
    const issues = validatePlannerInput(
      [],
      [],
      settings({ planningStartMinute: 22 * 60, planningEndMinute: 2 * 60 }),
    );

    expect(issues.join(" ")).toMatch(/overnight/i);
  });

  it("rejects an empty planning window and a buffer that consumes it", () => {
    expect(validatePlannerInput([], [], settings({ planningStartMinute: 600, planningEndMinute: 600 })).join(" ")).toMatch(
      /start before it ends/i,
    );
    expect(
      validatePlannerInput([], [], settings({ endOfDayBufferMinutes: 8 * 60 })).join(" "),
    ).toMatch(/shorter than the planning window/i);
  });

  it("rejects overlapping fixed commitments and commitments that enter the buffer", () => {
    const overlap = validatePlannerInput(
      [],
      [
        commitment({ id: "a", title: "A", startMinute: 600, endMinute: 660 }),
        commitment({ id: "b", title: "B", startMinute: 630, endMinute: 700 }),
      ],
      settings({ endOfDayBufferMinutes: 0 }),
    );
    expect(overlap.join(" ")).toMatch(/overlap/i);

    const bufferStart = 17 * 60 - 30;
    const bufferClash = validatePlannerInput(
      [],
      [commitment({ startMinute: bufferStart, endMinute: bufferStart + 15 })],
      settings(),
    );
    expect(bufferClash.join(" ")).toMatch(/end-of-day buffer/i);
  });

  it("allows commitments that only touch at an endpoint", () => {
    const issues = validatePlannerInput(
      [],
      [
        commitment({ id: "a", title: "A", startMinute: 600, endMinute: 660 }),
        commitment({ id: "b", title: "B", startMinute: 660, endMinute: 720 }),
      ],
      settings({ endOfDayBufferMinutes: 0 }),
    );

    expect(issues).toEqual([]);
  });

  it("rejects invalid durations, deadlines, and duplicate ids", () => {
    const issues = validatePlannerInput(
      [
        task({ durationMinutes: 0 }),
        task({ id: "shared", title: "Shared", durationMinutes: 1.5, deadlineMinute: 1500 }),
      ],
      [commitment({ id: "shared", title: "Shared commitment" })],
      settings(),
    );
    const text = issues.join(" ");

    expect(text).toMatch(/positive whole number/i);
    expect(text).toMatch(/deadline/i);
    expect(text).toMatch(/used more than once/i);
  });

  it("rejects non-positive break settings and non-integer planning bounds", () => {
    expect(validatePlannerInput([], [], settings({ breakFrequencyMinutes: 0 })).join(" ")).toMatch(
      /break frequency/i,
    );
    expect(validatePlannerInput([], [], settings({ breakDurationMinutes: -5 })).join(" ")).toMatch(
      /break duration/i,
    );
    expect(validatePlannerInput([], [], settings({ endOfDayBufferMinutes: -1 })).join(" ")).toMatch(
      /end-of-day buffer/i,
    );
    expect(validatePlannerInput([], [], settings({ planningStartMinute: 9 * 60 + 0.5 })).join(" ")).toMatch(
      /same local day/i,
    );
  });

  it("rejects a commitment contained in another and a zero-length commitment", () => {
    const nested = validatePlannerInput(
      [],
      [
        commitment({ id: "outer", title: "Outer", startMinute: 9 * 60, endMinute: 12 * 60 }),
        commitment({ id: "inner", title: "Inner", startMinute: 10 * 60, endMinute: 11 * 60 }),
      ],
      settings({ endOfDayBufferMinutes: 0 }),
    );
    expect(nested.join(" ")).toMatch(/overlap/i);

    const empty = validatePlannerInput(
      [],
      [commitment({ title: "Empty", startMinute: 11 * 60, endMinute: 11 * 60 })],
      settings(),
    );
    expect(empty.join(" ")).toMatch(/start before it ends/i);
  });

  it("throws the same issues from the scheduler", () => {
    const overnight = settings({ planningStartMinute: 20 * 60, planningEndMinute: 8 * 60 });

    expect(() => createSchedule([], [], overnight)).toThrow(PlannerValidationError);
    expect(() => createSchedule([], [], overnight)).toThrow(/overnight/i);

    const overlapping = [
      commitment({ id: "a", title: "A", startMinute: 10 * 60, endMinute: 12 * 60 }),
      commitment({ id: "b", title: "B", startMinute: 11 * 60, endMinute: 13 * 60 }),
    ];

    expect(() => createSchedule([], overlapping, settings({ endOfDayBufferMinutes: 0 }))).toThrow(
      /overlap/i,
    );
  });
});
