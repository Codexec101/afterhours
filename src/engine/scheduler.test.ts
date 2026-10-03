import { describe, expect, it } from "vitest";
import type {
  FixedCommitment,
  PlannerSettings,
  ScheduleResult,
  ScheduledBlock,
  Task,
} from "../types/planner.ts";
import { createSchedule } from "./scheduler.ts";

function settings(overrides: Partial<PlannerSettings> = {}): PlannerSettings {
  return {
    planningStartMinute: 0,
    planningEndMinute: 240,
    breakFrequencyMinutes: 240,
    breakDurationMinutes: 0,
    endOfDayBufferMinutes: 0,
    ...overrides,
  };
}

function task(overrides: Partial<Task> & Pick<Task, "id" | "durationMinutes">): Task {
  return {
    title: overrides.id,
    priority: "medium",
    energy: "medium",
    completed: false,
    ...overrides,
  };
}

function commitment(
  overrides: Partial<FixedCommitment> & Pick<FixedCommitment, "id" | "startMinute" | "endMinute">,
): FixedCommitment {
  return {
    title: overrides.id,
    ...overrides,
  };
}

function block(result: ScheduleResult, id: string): ScheduledBlock {
  const found = result.blocks.find((item) => item.id === id);

  if (!found) {
    throw new Error(`Missing block ${id}.`);
  }

  return found;
}

function expectTimelineFits(result: ScheduleResult, planned: PlannerSettings): void {
  const sorted = result.blocks.slice().sort((left, right) => left.startMinute - right.startMinute);
  const bufferStart = planned.planningEndMinute - planned.endOfDayBufferMinutes;
  const span = planned.planningEndMinute - planned.planningStartMinute;
  const labels = new Array<string>(span).fill("free");

  expect(result.blocks.map((item) => item.startMinute)).toEqual(sorted.map((item) => item.startMinute));

  for (let minute = bufferStart; minute < planned.planningEndMinute; minute += 1) {
    labels[minute - planned.planningStartMinute] = "buffer";
  }

  for (const block of sorted) {
    expect(block.startMinute).toBeGreaterThanOrEqual(planned.planningStartMinute);
    expect(block.endMinute).toBeLessThanOrEqual(bufferStart);
    expect(block.endMinute).toBeGreaterThan(block.startMinute);

    for (let minute = block.startMinute; minute < block.endMinute; minute += 1) {
      expect(labels[minute - planned.planningStartMinute]).toBe("free");
      labels[minute - planned.planningStartMinute] = block.kind;
    }
  }

  const count = (kind: string) => labels.filter((label) => label === kind).length;

  expect(result.accounting).toEqual({
    windowMinutes: span,
    scheduledWorkMinutes: count("task"),
    breakMinutes: count("break"),
    commitmentMinutes: count("commitment"),
    bufferMinutes: count("buffer"),
    unusedMinutes: count("free"),
  });

  expectWorkWithinBreakFrequency(sorted, planned);
}

function expectWorkWithinBreakFrequency(
  blocks: readonly ScheduledBlock[],
  planned: PlannerSettings,
): void {
  const breaks = blocks.filter((block) => block.kind === "break");

  if (planned.breakDurationMinutes <= 0) {
    expect(breaks).toEqual([]);
    return;
  }

  let work = 0;

  for (const block of blocks) {
    if (block.kind === "commitment") {
      continue;
    }

    if (block.kind === "break") {
      expect(work).toBeGreaterThan(0);
      expect(block.endMinute - block.startMinute).toBe(planned.breakDurationMinutes);
      work = 0;
      continue;
    }

    const duration = block.endMinute - block.startMinute;

    if (work > 0) {
      expect(work + duration).toBeLessThanOrEqual(planned.breakFrequencyMinutes);
    }

    work += duration;
  }
}

function expectActiveTasksPartitioned(result: ScheduleResult, tasks: readonly Task[]): void {
  const scheduled = result.blocks.flatMap((block) => (block.kind === "task" ? [block.taskId] : []));
  const deferred = result.deferred.map((item) => item.taskId);
  const active = tasks.flatMap((item) => (item.completed ? [] : [item.id]));

  expect(new Set(scheduled).size).toBe(scheduled.length);
  expect(new Set(deferred).size).toBe(deferred.length);
  expect([...scheduled, ...deferred].sort()).toEqual(active.slice().sort());

  for (const item of tasks) {
    if (!item.completed) {
      continue;
    }

    expect(scheduled).not.toContain(item.id);
    expect(deferred).not.toContain(item.id);
  }

  for (const item of result.deferred) {
    expect(item.message.trim().length).toBeGreaterThan(0);
  }
}

describe("createSchedule", () => {
  it("reserves commitments and the end-of-day buffer before placing tasks", () => {
    const planned = settings({
      planningStartMinute: 60,
      planningEndMinute: 180,
      endOfDayBufferMinutes: 30,
    });
    const result = createSchedule(
      [task({ id: "deep", durationMinutes: 60 })],
      [
        commitment({ id: "early", startMinute: 0, endMinute: 30 }),
        commitment({ id: "sync", startMinute: 30, endMinute: 90 }),
      ],
      planned,
    );

    expect(result.blocks.find((item) => item.id === "commitment:early")).toBeUndefined();
    expect(block(result, "commitment:sync")).toMatchObject({ startMinute: 60, endMinute: 90 });
    expect(block(result, "task:deep")).toMatchObject({ startMinute: 90, endMinute: 150 });
    expect(result.blocks.every((item) => item.endMinute <= 150)).toBe(true);
    expect(result.accounting).toMatchObject({
      windowMinutes: 120,
      scheduledWorkMinutes: 60,
      commitmentMinutes: 30,
      bufferMinutes: 30,
      unusedMinutes: 0,
    });
    expectTimelineFits(result, planned);
  });

  it("omits completed tasks", () => {
    const result = createSchedule(
      [
        task({ id: "done", durationMinutes: 60, completed: true, deadlineMinute: 60 }),
        task({ id: "open", durationMinutes: 60 }),
      ],
      [],
      settings({ planningEndMinute: 60 }),
    );

    expect(result.blocks.map((item) => item.id)).toEqual(["task:open"]);
    expect(result.deferred).toEqual([]);
  });

  it("places earlier deadlines first, even when they have lower priority", () => {
    const planned = settings({ planningEndMinute: 100 });
    const result = createSchedule(
      [
        task({ id: "later", durationMinutes: 50, priority: "high", deadlineMinute: 100 }),
        task({ id: "sooner", durationMinutes: 30, priority: "low", deadlineMinute: 40 }),
      ],
      [],
      planned,
    );

    expect(block(result, "task:sooner")).toMatchObject({ startMinute: 0, endMinute: 30 });
    expect(block(result, "task:later")).toMatchObject({ startMinute: 30, endMinute: 80 });
    expectTimelineFits(result, planned);
  });

  it("treats the deadline as an inclusive finish time", () => {
    const met = createSchedule(
      [task({ id: "met", durationMinutes: 30, deadlineMinute: 30 })],
      [],
      settings({ planningEndMinute: 90 }),
    );
    const missed = createSchedule(
      [task({ id: "missed", durationMinutes: 30, deadlineMinute: 29 })],
      [],
      settings({ planningEndMinute: 90 }),
    );

    expect(block(met, "task:met").endMinute).toBe(30);
    expect(missed.deferred).toEqual([
      expect.objectContaining({
        taskId: "missed",
        reason: "deadline_unmet",
        message: "No free interval lets this task finish by its deadline.",
      }),
    ]);
  });

  it("defers a task that cannot fit in one free interval", () => {
    const result = createSchedule(
      [task({ id: "long", durationMinutes: 25, deadlineMinute: 50 })],
      [commitment({ id: "mid", startMinute: 20, endMinute: 40 })],
      settings({ planningEndMinute: 50 }),
    );

    expect(result.deferred).toEqual([
      expect.objectContaining({
        taskId: "long",
        reason: "no_contiguous_slot",
      }),
    ]);
    expect(result.blocks.filter((item) => item.kind === "task")).toEqual([]);
  });

  it("keeps each task in a single block, including work longer than the break frequency", () => {
    const planned = settings({
      planningEndMinute: 180,
      breakFrequencyMinutes: 30,
      breakDurationMinutes: 10,
    });
    const result = createSchedule(
      [task({ id: "long", durationMinutes: 90 }), task({ id: "next", durationMinutes: 20 })],
      [],
      planned,
    );

    const long = block(result, "task:long");
    const next = block(result, "task:next");
    const insertedBreak = result.blocks.find((item) => item.kind === "break");

    expect(long.endMinute - long.startMinute).toBe(90);
    expect(result.blocks.filter((item) => item.kind === "task")).toHaveLength(2);
    expect(insertedBreak).toMatchObject({ startMinute: 90, endMinute: 100 });
    expect(next.startMinute).toBe(100);
    expectTimelineFits(result, planned);
  });

  it("inserts breaks from work minutes and does not reset the counter on a commitment", () => {
    const planned = settings({
      planningEndMinute: 300,
      breakFrequencyMinutes: 60,
      breakDurationMinutes: 15,
    });
    const result = createSchedule(
      [task({ id: "a", durationMinutes: 60 }), task({ id: "b", durationMinutes: 30 })],
      [commitment({ id: "meeting", startMinute: 60, endMinute: 120 })],
      planned,
    );

    expect(block(result, "task:a")).toMatchObject({ startMinute: 0, endMinute: 60 });
    expect(block(result, "break-1")).toMatchObject({ startMinute: 120, endMinute: 135 });
    expect(block(result, "task:b")).toMatchObject({ startMinute: 135, endMinute: 165 });
    expect(result.accounting).toMatchObject({
      scheduledWorkMinutes: 90,
      breakMinutes: 15,
      commitmentMinutes: 60,
      unusedMinutes: 135,
    });
    expectTimelineFits(result, planned);
  });

  it("does not break before the work budget is exceeded, then resets after a break", () => {
    const planned = settings({
      planningEndMinute: 300,
      breakFrequencyMinutes: 60,
      breakDurationMinutes: 15,
    });
    const result = createSchedule(
      [
        task({ id: "a", durationMinutes: 30 }),
        task({ id: "b", durationMinutes: 30 }),
        task({ id: "c", durationMinutes: 30 }),
      ],
      [],
      planned,
    );

    expect(block(result, "task:a").endMinute).toBe(block(result, "task:b").startMinute);
    expect(block(result, "break-1")).toMatchObject({ startMinute: 60, endMinute: 75 });
    expect(block(result, "task:c")).toMatchObject({ startMinute: 75, endMinute: 105 });
    expect(result.blocks.filter((item) => item.kind === "break")).toHaveLength(1);
  });

  it("still schedules a task when the only slot has the wrong energy", () => {
    const planned = settings({ planningStartMinute: 8 * 60, planningEndMinute: 9 * 60 });
    const result = createSchedule([task({ id: "tired", durationMinutes: 30, energy: "low" })], [], planned);

    expect(block(result, "task:tired").startMinute).toBe(8 * 60);
    expect(result.deferred).toEqual([]);
  });

  it("uses the preferred window when it outranks an earlier energy match", () => {
    const planned = settings({ planningStartMinute: 9 * 60, planningEndMinute: 17 * 60 });
    const result = createSchedule(
      [
        task({
          id: "focus",
          durationMinutes: 60,
          energy: "high",
          preferredWindow: { startMinute: 14 * 60, endMinute: 16 * 60 },
        }),
      ],
      [],
      planned,
    );

    expect(block(result, "task:focus")).toMatchObject({
      startMinute: 14 * 60,
      endMinute: 15 * 60,
    });
  });

  it("moves a low-energy task toward evening when both parts of the day are free", () => {
    const planned = settings({ planningStartMinute: 9 * 60, planningEndMinute: 18 * 60 });
    const result = createSchedule(
      [task({ id: "admin", durationMinutes: 30, energy: "low" })],
      [],
      planned,
    );

    expect(block(result, "task:admin").startMinute).toBe(17 * 60);
  });

  it("shifts the energy curve down when current energy is lower than the clock suggests", () => {
    const base = { planningStartMinute: 9 * 60, planningEndMinute: 18 * 60 };
    const medium = task({ id: "steady", durationMinutes: 30, energy: "medium" });

    expect(block(createSchedule([medium], [], settings(base)), "task:steady").startMinute).toBe(12 * 60);
    expect(
      block(createSchedule([medium], [], settings({ ...base, currentEnergy: "medium" })), "task:steady").startMinute,
    ).toBe(9 * 60);
  });

  it("treats current energy matching the curve as no shift", () => {
    const base = { planningStartMinute: 9 * 60, planningEndMinute: 18 * 60 };
    const admin = task({ id: "admin", durationMinutes: 30, energy: "low" });

    expect(createSchedule([admin], [], settings({ ...base, currentEnergy: "high" }))).toEqual(
      createSchedule([admin], [], settings(base)),
    );
  });

  it("never lets current energy override a deadline", () => {
    const planned = settings({ planningStartMinute: 9 * 60, planningEndMinute: 18 * 60, currentEnergy: "low" });
    const result = createSchedule(
      [task({ id: "due", durationMinutes: 60, energy: "high", deadlineMinute: 10 * 60 })],
      [],
      planned,
    );

    expect(block(result, "task:due")).toMatchObject({ startMinute: 9 * 60, endMinute: 10 * 60 });
    expect(result.deferred).toEqual([]);
  });

  it("schedules a higher-priority task before a lower-priority one that fits the same slot", () => {
    const planned = settings({ planningEndMinute: 60 });
    const result = createSchedule(
      [
        task({ id: "later", durationMinutes: 60, priority: "low" }),
        task({ id: "first", durationMinutes: 60, priority: "high" }),
      ],
      [],
      planned,
    );

    expect(result.blocks.map((item) => item.id)).toEqual(["task:first"]);
    expect(result.deferred).toEqual([
      expect.objectContaining({ taskId: "later", reason: "no_contiguous_slot" }),
    ]);
  });

  it("defers a task when the required break would push it past its deadline", () => {
    const planned = settings({
      planningEndMinute: 200,
      breakFrequencyMinutes: 60,
      breakDurationMinutes: 15,
    });
    const result = createSchedule(
      [
        task({ id: "warmup", durationMinutes: 40, deadlineMinute: 50 }),
        task({ id: "tight", durationMinutes: 30, deadlineMinute: 80 }),
      ],
      [],
      planned,
    );

    expect(block(result, "task:warmup")).toMatchObject({ startMinute: 0, endMinute: 40 });
    expect(result.deferred).toEqual([
      expect.objectContaining({
        taskId: "tight",
        reason: "break_blocks_deadline",
        message: "A required break leaves no contiguous slot that finishes by this task's deadline.",
      }),
    ]);
  });

  it("defers a flexible task when the break and the task cannot both fit", () => {
    const planned = settings({
      planningEndMinute: 100,
      breakFrequencyMinutes: 60,
      breakDurationMinutes: 30,
    });
    const result = createSchedule(
      [task({ id: "a", durationMinutes: 50 }), task({ id: "b", durationMinutes: 40 })],
      [],
      planned,
    );

    expect(block(result, "task:a")).toMatchObject({ startMinute: 0, endMinute: 50 });
    expect(result.deferred).toEqual([
      expect.objectContaining({ taskId: "b", reason: "break_does_not_fit" }),
    ]);
  });

  it("does not insert breaks when the break duration is zero", () => {
    const planned = settings({
      planningEndMinute: 100,
      breakFrequencyMinutes: 30,
      breakDurationMinutes: 0,
    });
    const result = createSchedule(
      [task({ id: "a", durationMinutes: 50 }), task({ id: "b", durationMinutes: 50 })],
      [],
      planned,
    );

    expect(result.blocks.filter((item) => item.kind === "break")).toEqual([]);
    expect(block(result, "task:a").endMinute).toBe(block(result, "task:b").startMinute);
    expectTimelineFits(result, planned);
  });

  it("is deterministic when the same tasks are supplied in a different order", () => {
    const planned = settings({
      planningStartMinute: 9 * 60,
      planningEndMinute: 18 * 60,
      breakFrequencyMinutes: 90,
      breakDurationMinutes: 10,
      endOfDayBufferMinutes: 20,
    });
    const tasks = [
      task({ id: "b", durationMinutes: 45, priority: "high", energy: "low" }),
      task({ id: "a", durationMinutes: 45, priority: "high", energy: "low" }),
      task({
        id: "due",
        durationMinutes: 30,
        priority: "low",
        deadlineMinute: 12 * 60,
        energy: "high",
      }),
    ];
    const commitments = [
      commitment({ id: "lunch", startMinute: 12 * 60, endMinute: 13 * 60 }),
    ];

    expect(createSchedule(tasks, commitments, planned)).toEqual(
      createSchedule([...tasks].reverse(), [...commitments], planned),
    );
  });

  it("moves a deadline task later when that frees the only gap for other work", () => {
    const planned = settings({ planningEndMinute: 100 });
    const result = createSchedule(
      [
        task({
          id: "due",
          durationMinutes: 40,
          priority: "low",
          deadlineMinute: 100,
          preferredWindow: { startMinute: 0, endMinute: 50 },
        }),
        task({ id: "focus", durationMinutes: 50 }),
      ],
      [commitment({ id: "split", startMinute: 50, endMinute: 60 })],
      planned,
    );

    expect(block(result, "task:due")).toMatchObject({ startMinute: 60, endMinute: 100 });
    expect(block(result, "task:focus")).toMatchObject({ startMinute: 0, endMinute: 50 });
    expect(result.deferred).toEqual([]);
    expectTimelineFits(result, planned);
  });

  it("replays task order when that schedules a task the first pass deferred", () => {
    const planned = settings({ planningEndMinute: 100 });
    const result = createSchedule(
      [
        task({
          id: "early",
          durationMinutes: 30,
          priority: "high",
          energy: "high",
          preferredWindow: { startMinute: 20, endMinute: 50 },
        }),
        task({
          id: "late",
          durationMinutes: 60,
          priority: "high",
          energy: "high",
          preferredWindow: { startMinute: 40, endMinute: 100 },
        }),
      ],
      [],
      planned,
    );

    expect(block(result, "task:early")).toMatchObject({ startMinute: 0, endMinute: 30 });
    expect(block(result, "task:late")).toMatchObject({ startMinute: 40, endMinute: 100 });
    expect(result.deferred).toEqual([]);
    expectTimelineFits(result, planned);
  });

  it("schedules a task that fills one free interval and defers a task that would have to be split", () => {
    const planned = settings({ planningEndMinute: 70 });
    const tasks = [
      task({ id: "split", durationMinutes: 50, priority: "high" }),
      task({ id: "fits", durationMinutes: 30, priority: "low" }),
    ];
    const result = createSchedule(tasks, [commitment({ id: "mid", startMinute: 30, endMinute: 40 })], planned);

    expect(result.blocks.filter((item) => item.kind === "task")).toEqual([
      expect.objectContaining({ taskId: "fits", startMinute: 0, endMinute: 30 }),
    ]);
    expect(result.deferred).toEqual([
      {
        taskId: "split",
        title: "split",
        reason: "no_contiguous_slot",
        message: "No single free interval is long enough for this task.",
      },
    ]);
    expectActiveTasksPartitioned(result, tasks);
    expectTimelineFits(result, planned);
  });

  it("finishes a deadline task by its deadline when a later preferred window would miss it", () => {
    const planned = settings({ planningEndMinute: 180 });
    const result = createSchedule(
      [
        task({
          id: "due",
          durationMinutes: 30,
          deadlineMinute: 60,
          energy: "low",
          preferredWindow: { startMinute: 120, endMinute: 180 },
        }),
      ],
      [],
      planned,
    );

    const due = block(result, "task:due");
    expect(due.endMinute).toBeLessThanOrEqual(60);
    expect(due.endMinute - due.startMinute).toBe(30);
    expect(result.deferred).toEqual([]);
    expectTimelineFits(result, planned);
  });

  it("gives the only slot to a deadline task ahead of a higher-priority flexible task", () => {
    const planned = settings({ planningEndMinute: 60 });
    const tasks = [
      task({ id: "flex", durationMinutes: 60, priority: "high" }),
      task({ id: "due", durationMinutes: 40, priority: "low", deadlineMinute: 60 }),
    ];
    const result = createSchedule(tasks, [], planned);

    expect(block(result, "task:due").endMinute).toBeLessThanOrEqual(60);
    expect(result.deferred).toEqual([
      expect.objectContaining({
        taskId: "flex",
        reason: "no_contiguous_slot",
        message: "No single free interval is long enough for this task.",
      }),
    ]);
    expectActiveTasksPartitioned(result, tasks);
    expectTimelineFits(result, planned);
  });

  it("names why a task is deferred when a break cannot be inserted before later work", () => {
    const planned = settings({
      planningEndMinute: 90,
      breakFrequencyMinutes: 40,
      breakDurationMinutes: 15,
    });
    const tasks = [
      task({
        id: "late",
        durationMinutes: 50,
        priority: "high",
        energy: "high",
        preferredWindow: { startMinute: 40, endMinute: 90 },
      }),
      task({ id: "early", durationMinutes: 30, priority: "low", energy: "high" }),
    ];
    const result = createSchedule(tasks, [], planned);

    expect(block(result, "task:late")).toMatchObject({ startMinute: 40, endMinute: 90 });
    expect(result.deferred).toEqual([
      {
        taskId: "early",
        title: "early",
        reason: "break_does_not_fit",
        message:
          "A break is required before more work, and the break plus this task do not fit in the remaining free time.",
      },
    ]);
    expectTimelineFits(result, planned);
  });

  it("preserves in-window commitment times and keeps the buffer free of tasks", () => {
    const planned = settings({
      planningStartMinute: 60,
      planningEndMinute: 180,
      endOfDayBufferMinutes: 20,
    });
    const result = createSchedule(
      [task({ id: "write", durationMinutes: 30 }), task({ id: "too-long", durationMinutes: 80 })],
      [
        commitment({ id: "before", title: "Before", startMinute: 0, endMinute: 90 }),
        commitment({ id: "focus", title: "Focus", startMinute: 100, endMinute: 130 }),
      ],
      planned,
    );

    expect(block(result, "commitment:before")).toMatchObject({
      title: "Before",
      startMinute: 60,
      endMinute: 90,
    });
    expect(block(result, "commitment:focus")).toMatchObject({
      title: "Focus",
      startMinute: 100,
      endMinute: 130,
    });
    expect(block(result, "task:write")).toMatchObject({ startMinute: 130, endMinute: 160 });
    expect(result.blocks.every((item) => item.endMinute <= 160)).toBe(true);
    expect(result.deferred.map((item) => item.taskId)).toEqual(["too-long"]);
    expectTimelineFits(result, planned);
  });

  it("inserts each break from clock-order work, including when a later task is chosen first", () => {
    const planned = settings({
      planningStartMinute: 9 * 60,
      planningEndMinute: 18 * 60,
      breakFrequencyMinutes: 60,
      breakDurationMinutes: 15,
    });
    const tasks = [
      task({
        id: "evening",
        durationMinutes: 45,
        priority: "high",
        energy: "low",
        preferredWindow: { startMinute: 17 * 60, endMinute: 18 * 60 },
      }),
      task({ id: "morning", durationMinutes: 30, priority: "low", energy: "high" }),
    ];
    const result = createSchedule(tasks, [], planned);

    expect(block(result, "task:morning")).toMatchObject({ startMinute: 9 * 60, endMinute: 9 * 60 + 30 });
    expect(block(result, "break-1")).toMatchObject({ startMinute: 9 * 60 + 30, endMinute: 9 * 60 + 45 });
    expect(block(result, "task:evening")).toMatchObject({ startMinute: 17 * 60, endMinute: 17 * 60 + 45 });
    expect(result.blocks[0]?.kind).toBe("task");
    expect(result.deferred).toEqual([]);
    expectTimelineFits(result, planned);
  });

  it("starts a new work run after each break and keeps a long task in one block", () => {
    const repeated = settings({
      planningEndMinute: 300,
      breakFrequencyMinutes: 60,
      breakDurationMinutes: 10,
    });
    const result = createSchedule(
      [
        task({ id: "a", durationMinutes: 50 }),
        task({ id: "b", durationMinutes: 50 }),
        task({ id: "c", durationMinutes: 50 }),
      ],
      [],
      repeated,
    );

    expect(block(result, "task:a")).toMatchObject({ startMinute: 0, endMinute: 50 });
    expect(block(result, "break-1")).toMatchObject({ startMinute: 50, endMinute: 60 });
    expect(block(result, "task:b")).toMatchObject({ startMinute: 60, endMinute: 110 });
    expect(block(result, "break-2")).toMatchObject({ startMinute: 110, endMinute: 120 });
    expect(block(result, "task:c")).toMatchObject({ startMinute: 120, endMinute: 170 });
    expectTimelineFits(result, repeated);

    const deepPlan = settings({
      planningEndMinute: 300,
      breakFrequencyMinutes: 60,
      breakDurationMinutes: 10,
    });
    const deepDay = createSchedule(
      [
        task({ id: "warmup", durationMinutes: 20, deadlineMinute: 20 }),
        task({ id: "deep", durationMinutes: 90 }),
      ],
      [],
      deepPlan,
    );
    const deep = block(deepDay, "task:deep");

    expect(block(deepDay, "task:warmup")).toMatchObject({ startMinute: 0, endMinute: 20 });
    expect(block(deepDay, "break-1")).toMatchObject({ startMinute: 20, endMinute: 30 });
    expect(deep).toMatchObject({ startMinute: 30, endMinute: 120 });
    expect(deepDay.blocks.filter((item) => item.kind === "task" && item.taskId === "deep")).toHaveLength(1);
    expectTimelineFits(deepDay, deepPlan);
  });

  it("leaves completed tasks out of the schedule and the deferred list", () => {
    const planned = settings({ planningEndMinute: 90 });
    const tasks = [
      task({ id: "done", durationMinutes: 90, completed: true, deadlineMinute: 90, priority: "high" }),
      task({ id: "also-done", durationMinutes: 30, completed: true }),
      task({ id: "open", durationMinutes: 60 }),
      task({ id: "extra", durationMinutes: 40 }),
    ];
    const result = createSchedule(tasks, [], planned);

    expect(block(result, "task:open")).toMatchObject({ startMinute: 0, endMinute: 60 });
    expect(result.deferred).toEqual([
      expect.objectContaining({ taskId: "extra", reason: "no_contiguous_slot" }),
    ]);
    expectActiveTasksPartitioned(result, tasks);
    expectTimelineFits(result, planned);
  });

  it("returns the same schedule for the same inputs without changing those inputs", () => {
    const planned = settings({
      planningStartMinute: 9 * 60,
      planningEndMinute: 18 * 60,
      breakFrequencyMinutes: 90,
      breakDurationMinutes: 10,
      endOfDayBufferMinutes: 20,
    });
    const tasks = [
      task({ id: "b", durationMinutes: 45, priority: "high", energy: "low" }),
      task({ id: "a", durationMinutes: 45, priority: "high", energy: "low" }),
      task({ id: "due", durationMinutes: 30, priority: "low", deadlineMinute: 12 * 60, energy: "high" }),
    ];
    const commitments = [commitment({ id: "lunch", startMinute: 12 * 60, endMinute: 13 * 60 })];
    const originalTasks = structuredClone(tasks);
    const originalCommitments = structuredClone(commitments);
    const originalSettings = structuredClone(planned);

    expect(createSchedule(tasks, commitments, planned)).toEqual(createSchedule(tasks, commitments, planned));
    expect(createSchedule(tasks, commitments, planned)).toEqual(
      createSchedule([...tasks].reverse(), [...commitments].reverse(), planned),
    );
    expect(tasks).toEqual(originalTasks);
    expect(commitments).toEqual(originalCommitments);
    expect(planned).toEqual(originalSettings);
  });

  it("accounts for an empty day, a day filled by commitments, and a task longer than every gap", () => {
    const emptyPlan = settings({ planningEndMinute: 200, endOfDayBufferMinutes: 40 });
    const empty = createSchedule([], [], emptyPlan);

    expect(empty.blocks).toEqual([]);
    expect(empty.deferred).toEqual([]);
    expectTimelineFits(empty, emptyPlan);

    const fullPlan = settings({ planningEndMinute: 150, endOfDayBufferMinutes: 30 });
    const full = createSchedule(
      [task({ id: "spare", durationMinutes: 15 })],
      [commitment({ id: "block", startMinute: 0, endMinute: 120 })],
      fullPlan,
    );

    expect(full.blocks.map((item) => item.id)).toEqual(["commitment:block"]);
    expect(full.deferred).toEqual([
      expect.objectContaining({
        taskId: "spare",
        reason: "no_contiguous_slot",
        message: "No single free interval is long enough for this task.",
      }),
    ]);
    expect(full.accounting.unusedMinutes).toBe(0);
    expectTimelineFits(full, fullPlan);

    const splitPlan = settings({ planningEndMinute: 80 });
    const split = createSchedule(
      [task({ id: "wide", durationMinutes: 50 })],
      [commitment({ id: "mid", startMinute: 30, endMinute: 40 })],
      splitPlan,
    );

    expect(split.blocks.filter((item) => item.kind === "task")).toEqual([]);
    expect(split.deferred[0]).toMatchObject({ taskId: "wide", reason: "no_contiguous_slot" });
    expectTimelineFits(split, splitPlan);
  });
});
