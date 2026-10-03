import { describe, expect, it } from "vitest";
import { createSchedule } from "../engine/scheduler.ts";
import { explainPlan } from "./explainPlan.ts";
import { SAMPLE_DAY } from "./sampleDay.ts";

describe("SAMPLE_DAY", () => {
  it("is valid scheduler input with a break, a commitment, and a deferred task", () => {
    const result = createSchedule(SAMPLE_DAY.tasks, SAMPLE_DAY.commitments, SAMPLE_DAY.settings);
    const total =
      result.accounting.scheduledWorkMinutes +
      result.accounting.breakMinutes +
      result.accounting.commitmentMinutes +
      result.accounting.bufferMinutes +
      result.accounting.unusedMinutes;

    expect(total).toBe(result.accounting.windowMinutes);
    expect(result.blocks.some((block) => block.kind === "commitment")).toBe(true);
    expect(result.blocks.some((block) => block.kind === "break")).toBe(true);
    expect(result.deferred).toEqual([
      expect.objectContaining({
        taskId: "sample-outline",
        reason: "no_contiguous_slot",
        message: "No single free interval is long enough for this task.",
      }),
    ]);

    const explanation = explainPlan(result, SAMPLE_DAY.tasks, SAMPLE_DAY.commitments, SAMPLE_DAY.settings);

    for (const block of result.blocks) {
      if (block.kind !== "break") {
        continue;
      }

      const trigger = result.blocks.find((item) => item.kind === "task" && item.taskId === block.forTaskId);
      const note = explanation.placements.find((placement) => placement.id === block.id);

      expect(trigger?.kind).toBe("task");

      if (trigger?.kind === "task") {
        expect(note?.facts.some((fact) => fact.includes(trigger.title))).toBe(true);
      }
    }

    expect(explanation.rules.some((rule) => rule.title === "Replay")).toBe(true);
  });
});
