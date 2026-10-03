import { describe, expect, it } from "vitest";
import { scorePlacement } from "../engine/scoring.ts";
import { createSchedule } from "../engine/scheduler.ts";
import type { PlannerSettings, Task } from "../types/planner.ts";
import { explainPlan } from "./explainPlan.ts";

const settings: PlannerSettings = {
  planningStartMinute: 0,
  planningEndMinute: 120,
  breakFrequencyMinutes: 50,
  breakDurationMinutes: 10,
  endOfDayBufferMinutes: 0,
};

const tasks: Task[] = [
  {
    id: "a",
    title: "First",
    durationMinutes: 40,
    priority: "high",
    energy: "high",
    completed: false,
  },
  {
    id: "b",
    title: "Second",
    durationMinutes: 30,
    priority: "low",
    energy: "low",
    preferredWindow: { startMinute: 60, endMinute: 120 },
    completed: false,
  },
];

describe("explainPlan", () => {
  it("quotes scheduler scores and the documented heuristic limit", () => {
    const result = createSchedule(tasks, [], settings);
    const explanation = explainPlan(result, tasks, [], settings);
    const first = result.blocks.find((block) => block.kind === "task" && block.taskId === "a");
    const placement = explanation.placements.find((item) => item.id === "task:a");

    expect(first?.kind).toBe("task");

    if (first?.kind === "task") {
      const score = scorePlacement(tasks[0] as Task, first.startMinute, first.endMinute);
      expect(placement?.facts.some((fact) => fact.includes(`Placement score ${score}`))).toBe(true);
    }

    expect(explanation.rules.map((rule) => rule.title)).toContain("Limit of this plan");
    expect(explanation.rules.some((rule) => rule.body.includes("not a globally optimal plan"))).toBe(true);
    expect(explanation.scheduledCount).toBe(2);
    expect(explanation.deferredCount).toBe(0);
  });

  it("keeps the scheduler's deferral message", () => {
    const result = createSchedule(
      [
        {
          id: "long",
          title: "Too long",
          durationMinutes: 90,
          priority: "medium",
          energy: "medium",
          completed: false,
        },
      ],
      [{ id: "mid", title: "Meeting", startMinute: 30, endMinute: 60 }],
      { ...settings, breakDurationMinutes: 0, breakFrequencyMinutes: 120 },
    );
    const explanation = explainPlan(result, [], [], settings);

    expect(result.deferred[0]?.message).toBe("No single free interval is long enough for this task.");
    expect(explanation.deferredCount).toBe(1);
    expect(explanation.placements.some((item) => item.kind === "commitment")).toBe(true);
  });
});
