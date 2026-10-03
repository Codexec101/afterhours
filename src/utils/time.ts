import { MINUTES_PER_DAY } from "../types/planner.ts";

const CLOCK_INPUT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Clock time for a minute instant. Minute 1440 is midnight at the end of the day. */
export function formatMinute(minute: number): string {
  const clockMinute = minute === MINUTES_PER_DAY ? 0 : minute;
  const hours24 = Math.floor(clockMinute / 60);
  const mins = clockMinute % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${hours12}:${mins.toString().padStart(2, "0")} ${suffix}`;
}

/** Value for `<input type="time">`. An end at minute 1440 is `00:00`. */
export function formatClockInput(minute: number): string {
  const clockMinute = minute === MINUTES_PER_DAY ? 0 : minute;
  const hours = Math.floor(clockMinute / 60);
  const mins = clockMinute % 60;

  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Parse a time input. Start-of-day midnight is 0.
 * End-of-day midnight (`00:00` or `24:00`) is 1440.
 */
export function parseClockInput(value: string, edge: "start" | "end"): number | null {
  const trimmed = value.trim();

  if (edge === "end" && trimmed === "24:00") {
    return MINUTES_PER_DAY;
  }

  const match = CLOCK_INPUT.exec(trimmed);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const mins = Number(match[2]);
  const minute = hours * 60 + mins;

  if (edge === "end" && minute === 0) {
    return MINUTES_PER_DAY;
  }

  return minute;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;

  if (remainder === 0) {
    return hourLabel;
  }

  const minuteLabel = remainder === 1 ? "1 minute" : `${remainder} minutes`;

  return `${hourLabel} ${minuteLabel}`;
}

export function formatMinuteRange(startMinute: number, endMinute: number): string {
  return `${formatMinute(startMinute)} – ${formatMinute(endMinute)}`;
}

/** Rewrite engine ranges such as `(1290–1320)` into clock times. */
export function humanizeMinuteRanges(message: string): string {
  return message.replace(/\((\d+)–(\d+)\)/g, (_match, start: string, end: string) => {
    return `(${formatMinute(Number(start))} – ${formatMinute(Number(end))})`;
  });
}
