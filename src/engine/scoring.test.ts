import { describe, expect, it } from "vitest";
import type { Task } from "../types/planner.ts";
import {
  compareDeadlineTasks,
  energyAtMinute,
  energyCompatibility,
  preferredWindowScore,
  scorePlacement,
} from "./scoring.ts";

function task(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: overrides.id,
    durationMinutes: 30,
    priority: "medium",
    energy: "medium",
    completed: false,
    ...overrides,
  };
}

describe("energy compatibility", () => {
  it("treats morning, afternoon, and evening as high, medium, and low", () => {
    expect(energyAtMinute(8 * 60)).toBe("high");
    expect(energyAtMinute(12 * 60)).toBe("medium");
    expect(energyAtMinute(17 * 60)).toBe("low");
  });

  it("scores an exact match above an adjacent band and an opposite band", () => {
    expect(energyCompatibility("high", "high")).toBe(2);
    expect(energyCompatibility("high", "medium")).toBe(1);
    expect(energyCompatibility("high", "low")).toBe(0);
  });
});

describe("placement score", () => {
  it("prefers a contained window over a partial overlap and an outside slot", () => {
    const focused = task({
      id: "focus",
      durationMinutes: 60,
      preferredWindow: { startMinute: 14 * 60, endMinute: 16 * 60 },
    });

    expect(preferredWindowScore(focused, 14 * 60, 15 * 60)).toBe(2);
    expect(preferredWindowScore(focused, 13 * 60, 15 * 60)).toBe(1);
    expect(preferredWindowScore(focused, 9 * 60, 10 * 60)).toBe(0);
  });

  it("lets a full window and energy match beat one priority step, not two", () => {
    const highWithNoFit = task({ id: "high", priority: "high", energy: "high" });
    const lowInItsWindow = task({
      id: "low",
      priority: "low",
      energy: "high",
      preferredWindow: { startMinute: 9 * 60, endMinute: 12 * 60 },
    });
    const mediumInItsWindow = task({
      id: "medium",
      priority: "medium",
      energy: "high",
      preferredWindow: { startMinute: 9 * 60, endMinute: 12 * 60 },
    });

    const highAwayFromPreferences = scorePlacement(highWithNoFit, 18 * 60, 19 * 60);
    const lowPerfect = scorePlacement(lowInItsWindow, 9 * 60, 9 * 60 + 30);
    const mediumPerfect = scorePlacement(mediumInItsWindow, 9 * 60, 9 * 60 + 30);

    expect(highAwayFromPreferences).toBeGreaterThan(lowPerfect);
    expect(mediumPerfect).toBeGreaterThan(highAwayFromPreferences);
  });
});

describe("deadline ordering", () => {
  it("orders earlier deadlines first and uses priority only as a tie-break", () => {
    const laterButUrgent = task({
      id: "later",
      priority: "high",
      deadlineMinute: 15 * 60,
    });
    const earlier = task({
      id: "earlier",
      priority: "low",
      deadlineMinute: 11 * 60,
    });

    expect(compareDeadlineTasks(earlier, laterButUrgent)).toBeLessThan(0);
  });
});
