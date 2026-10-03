import { describe, expect, it } from "vitest";
import { toDateKey } from "./dateKey.ts";

describe("toDateKey", () => {
  it("formats the local calendar date as YYYY-MM-DD", () => {
    expect(toDateKey(new Date(2026, 9, 3, 0, 5))).toBe("2026-10-03");
    expect(toDateKey(new Date(2026, 0, 9, 23, 59))).toBe("2026-01-09");
  });

  it("rejects an invalid date", () => {
    expect(() => toDateKey(new Date("not-a-date"))).toThrow(/invalid date/i);
  });
});
