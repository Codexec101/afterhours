import { describe, expect, it } from "vitest";
import { MINUTES_PER_DAY } from "../types/planner.ts";
import {
  defaultSettingsDraft,
  parseCommitmentDraft,
  parseSettingsDraft,
  parseTaskDraft,
} from "./parsePlannerForm.ts";

describe("defaultSettingsDraft", () => {
  it("starts at the next quarter hour and ends at 10:00 PM", () => {
    expect(defaultSettingsDraft(new Date(2026, 9, 3, 15, 7))).toMatchObject({
      planningStart: "15:15",
      planningEnd: "22:00",
      endAtMidnight: false,
      breakFrequencyMinutes: "90",
      breakDurationMinutes: "15",
      endOfDayBufferMinutes: "30",
      currentEnergy: "medium",
    });
  });

  it("uses midnight when the evening end is already past", () => {
    expect(defaultSettingsDraft(new Date(2026, 9, 3, 22, 10))).toMatchObject({
      planningStart: "22:15",
      endAtMidnight: true,
    });
    expect(defaultSettingsDraft(new Date(2026, 9, 3, 23, 50))).toMatchObject({
      planningStart: "23:50",
      endAtMidnight: true,
    });
  });
});

describe("parseSettingsDraft", () => {
  it("ends at minute 1440 when midnight is chosen", () => {
    const parsed = parseSettingsDraft({
      planningStart: "09:00",
      planningEnd: "18:00",
      endAtMidnight: true,
      breakFrequencyMinutes: "90",
      breakDurationMinutes: "0",
      endOfDayBufferMinutes: "15",
      currentEnergy: "low",
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        planningStartMinute: 9 * 60,
        planningEndMinute: MINUTES_PER_DAY,
        breakFrequencyMinutes: 90,
        breakDurationMinutes: 0,
        endOfDayBufferMinutes: 15,
        currentEnergy: "low",
      },
    });
  });

  it("rejects a blank clock and a zero break frequency", () => {
    const parsed = parseSettingsDraft({
      planningStart: "",
      planningEnd: "22:00",
      endAtMidnight: false,
      breakFrequencyMinutes: "0",
      breakDurationMinutes: "15",
      endOfDayBufferMinutes: "30",
      currentEnergy: "medium",
    });

    expect(parsed.ok).toBe(false);

    if (!parsed.ok) {
      expect(parsed.issues).toEqual([
        "Available from needs a time on today's clock.",
        "Break frequency must be a positive whole number of minutes.",
      ]);
    }
  });
});

describe("parseTaskDraft", () => {
  it("leaves deadline and preferred window unset when they are blank", () => {
    const parsed = parseTaskDraft({
      title: "  Read  ",
      durationMinutes: "40",
      priority: "low",
      deadline: "",
      preferredStart: "",
      preferredEnd: "",
      energy: "low",
      completed: false,
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        title: "Read",
        durationMinutes: 40,
        priority: "low",
        deadlineMinute: undefined,
        preferredWindow: undefined,
        energy: "low",
        completed: false,
      },
    });
  });

  it("asks for both sides of a preferred window", () => {
    const parsed = parseTaskDraft({
      title: "Read",
      durationMinutes: "40",
      priority: "medium",
      deadline: "",
      preferredStart: "20:00",
      preferredEnd: "",
      energy: "medium",
      completed: true,
    });

    expect(parsed.ok).toBe(false);

    if (!parsed.ok) {
      expect(parsed.issues).toContain("Preferred window needs both a start and an end, or leave both blank.");
    }
  });
});

describe("parseCommitmentDraft", () => {
  it("requires a title and a forward window", () => {
    const missing = parseCommitmentDraft({ title: " ", start: "18:00", end: "19:00" });
    expect(missing.ok).toBe(false);

    const parsed = parseCommitmentDraft({ title: "Dinner", start: "19:00", end: "19:40" });
    expect(parsed).toEqual({
      ok: true,
      value: { title: "Dinner", startMinute: 19 * 60, endMinute: 19 * 60 + 40 },
    });
  });
});
