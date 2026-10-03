import { describe, expect, it } from "vitest";
import { MINUTES_PER_DAY } from "../types/planner.ts";
import {
  formatClockInput,
  formatDuration,
  formatMinute,
  formatMinuteRange,
  humanizeMinuteRanges,
  parseClockInput,
} from "./time.ts";

describe("clock formatting", () => {
  it("formats minutes as 12-hour clock times", () => {
    expect(formatMinute(0)).toBe("12:00 AM");
    expect(formatMinute(9 * 60 + 5)).toBe("9:05 AM");
    expect(formatMinute(12 * 60)).toBe("12:00 PM");
    expect(formatMinute(17 * 60 + 30)).toBe("5:30 PM");
    expect(formatMinute(MINUTES_PER_DAY)).toBe("12:00 AM");
  });

  it("formats durations in hours and minutes", () => {
    expect(formatDuration(1)).toBe("1 minute");
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(150)).toBe("2 hours 30 minutes");
  });

  it("formats a half-open range with an en dash", () => {
    expect(formatMinuteRange(17 * 60, 18 * 60 + 30)).toBe("5:00 PM – 6:30 PM");
  });
});

describe("clock inputs", () => {
  it("round-trips input values, treating an end of 00:00 as midnight", () => {
    expect(formatClockInput(17 * 60 + 15)).toBe("17:15");
    expect(formatClockInput(MINUTES_PER_DAY)).toBe("00:00");
    expect(parseClockInput("17:15", "start")).toBe(17 * 60 + 15);
    expect(parseClockInput("00:00", "start")).toBe(0);
    expect(parseClockInput("00:00", "end")).toBe(MINUTES_PER_DAY);
    expect(parseClockInput("24:00", "end")).toBe(MINUTES_PER_DAY);
    expect(parseClockInput("25:00", "start")).toBeNull();
    expect(parseClockInput("", "end")).toBeNull();
  });
});

describe("humanizeMinuteRanges", () => {
  it("replaces engine minute ranges and leaves the rest of the message", () => {
    expect(
      humanizeMinuteRanges(
        'Fixed commitment "Dinner" overlaps the reserved end-of-day buffer (1290–1320).',
      ),
    ).toBe(
      'Fixed commitment "Dinner" overlaps the reserved end-of-day buffer (9:30 PM – 10:00 PM).',
    );
  });
});
