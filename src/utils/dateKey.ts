import { format, isValid } from "date-fns";

/**
 * Local calendar date as `YYYY-MM-DD`.
 * This is the only place that formats a planner date key.
 */
export function toDateKey(date: Date): string {
  if (!isValid(date)) {
    throw new Error("Cannot format an invalid date.");
  }

  return format(date, "yyyy-MM-dd");
}
