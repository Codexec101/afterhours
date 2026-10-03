import { MINUTES_PER_DAY, type EnergyLevel, type FixedCommitment, type PlannerSettings, type Priority, type Task, type TimeWindow } from "../types/planner.ts";
import { energyAtMinute } from "../engine/scoring.ts";
import { formatClockInput, parseClockInput } from "../utils/time.ts";

export interface SettingsDraft {
  planningStart: string;
  planningEnd: string;
  /** When true, the window ends at minute 1440 instead of the clock in `planningEnd`. */
  endAtMidnight: boolean;
  breakFrequencyMinutes: string;
  breakDurationMinutes: string;
  endOfDayBufferMinutes: string;
  currentEnergy: EnergyLevel;
}

export interface TaskDraft {
  title: string;
  durationMinutes: string;
  priority: Priority;
  deadline: string;
  preferredStart: string;
  preferredEnd: string;
  energy: EnergyLevel;
  completed: boolean;
}

export interface CommitmentDraft {
  title: string;
  start: string;
  end: string;
}

export interface ParsedTaskFields {
  title: string;
  durationMinutes: number;
  priority: Priority;
  deadlineMinute?: number;
  preferredWindow?: TimeWindow;
  energy: EnergyLevel;
  completed: boolean;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

export function defaultSettingsDraft(now: Date): SettingsDraft {
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil(nowMinute / 15) * 15;
  const start = rounded >= MINUTES_PER_DAY ? nowMinute : rounded;
  let end = 22 * 60;

  if (end <= start) {
    end = MINUTES_PER_DAY;
  }

  return {
    planningStart: formatClockInput(start),
    planningEnd: end === MINUTES_PER_DAY ? "22:00" : formatClockInput(end),
    endAtMidnight: end === MINUTES_PER_DAY,
    breakFrequencyMinutes: "90",
    breakDurationMinutes: "15",
    endOfDayBufferMinutes: "30",
    currentEnergy: energyAtMinute(start),
  };
}

export function emptyTaskDraft(): TaskDraft {
  return {
    title: "",
    durationMinutes: "30",
    priority: "medium",
    deadline: "",
    preferredStart: "",
    preferredEnd: "",
    energy: "medium",
    completed: false,
  };
}

export function emptyCommitmentDraft(): CommitmentDraft {
  return {
    title: "",
    start: "",
    end: "",
  };
}

export function parseSettingsDraft(draft: SettingsDraft): ParseResult<PlannerSettings> {
  const issues: string[] = [];
  const planningStartMinute = parseClockInput(draft.planningStart, "start");
  const planningEndMinute = draft.endAtMidnight ? MINUTES_PER_DAY : parseClockInput(draft.planningEnd, "start");
  const breakFrequencyMinutes = parseWholeNumber(draft.breakFrequencyMinutes);
  const breakDurationMinutes = parseWholeNumber(draft.breakDurationMinutes);
  const endOfDayBufferMinutes = parseWholeNumber(draft.endOfDayBufferMinutes);

  if (planningStartMinute === null) {
    issues.push("Available from needs a time on today's clock.");
  }

  if (!draft.endAtMidnight && draft.planningEnd.trim() === "00:00") {
    issues.push("12:00 AM is the start of the day. Choose End at midnight to keep the window open until the day ends.");
  } else if (planningEndMinute === null) {
    issues.push("Available until needs a time on today's clock, or choose End at midnight.");
  } else if (
    planningStartMinute !== null &&
    planningStartMinute >= planningEndMinute
  ) {
    issues.push(
      "Available from has to be earlier than available until on this same day. Overnight windows are not supported. Choose End at midnight to use the rest of today.",
    );
  }

  if (breakFrequencyMinutes === null || breakFrequencyMinutes < 1) {
    issues.push("Break frequency must be a positive whole number of minutes.");
  }

  if (breakDurationMinutes === null || breakDurationMinutes > MINUTES_PER_DAY) {
    issues.push("Break duration must be a whole number of minutes from 0 through 1440.");
  }

  if (endOfDayBufferMinutes === null || endOfDayBufferMinutes > MINUTES_PER_DAY) {
    issues.push("End-of-day buffer must be a whole number of minutes from 0 through 1440.");
  }

  if (issues.length > 0 || planningStartMinute === null || planningEndMinute === null) {
    return { ok: false, issues };
  }

  if (breakFrequencyMinutes === null || breakDurationMinutes === null || endOfDayBufferMinutes === null) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      planningStartMinute,
      planningEndMinute,
      breakFrequencyMinutes,
      breakDurationMinutes,
      endOfDayBufferMinutes,
      currentEnergy: draft.currentEnergy,
    },
  };
}

export function parseTaskDraft(draft: TaskDraft): ParseResult<ParsedTaskFields> {
  const issues: string[] = [];
  const title = draft.title.trim();
  const durationMinutes = parseWholeNumber(draft.durationMinutes);

  if (title.length === 0) {
    issues.push("Give the task a title.");
  }

  if (durationMinutes === null || durationMinutes < 1 || durationMinutes > MINUTES_PER_DAY) {
    issues.push("Duration must be a positive whole number of minutes.");
  }

  let deadlineMinute: number | undefined;

  if (draft.deadline.trim().length > 0) {
    const parsed = parseClockInput(draft.deadline, "end");

    if (parsed === null) {
      issues.push("Deadline must be a time on today's clock. 12:00 AM means midnight.");
    } else {
      deadlineMinute = parsed;
    }
  }

  const preferredWindow = parseOptionalWindow(
    draft.preferredStart,
    draft.preferredEnd,
    "Preferred window",
    issues,
  );

  if (issues.length > 0 || durationMinutes === null) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      title,
      durationMinutes,
      priority: draft.priority,
      deadlineMinute,
      preferredWindow,
      energy: draft.energy,
      completed: draft.completed,
    },
  };
}

export function taskFromFields(id: string, fields: ParsedTaskFields): Task {
  return {
    id,
    title: fields.title,
    durationMinutes: fields.durationMinutes,
    priority: fields.priority,
    deadlineMinute: fields.deadlineMinute,
    preferredWindow: fields.preferredWindow,
    energy: fields.energy,
    completed: fields.completed,
  };
}

export function taskToDraft(task: Task): TaskDraft {
  return {
    title: task.title,
    durationMinutes: String(task.durationMinutes),
    priority: task.priority,
    deadline: task.deadlineMinute === undefined ? "" : formatClockInput(task.deadlineMinute),
    preferredStart: task.preferredWindow ? formatClockInput(task.preferredWindow.startMinute) : "",
    preferredEnd: task.preferredWindow ? formatClockInput(task.preferredWindow.endMinute) : "",
    energy: task.energy,
    completed: task.completed,
  };
}

export function commitmentToDraft(commitment: FixedCommitment): CommitmentDraft {
  return {
    title: commitment.title,
    start: formatClockInput(commitment.startMinute),
    end: formatClockInput(commitment.endMinute),
  };
}

export function parseCommitmentDraft(
  draft: CommitmentDraft,
): ParseResult<{ title: string; startMinute: number; endMinute: number }> {
  const issues: string[] = [];
  const title = draft.title.trim();
  const startMinute = parseClockInput(draft.start, "start");
  const endMinute = parseClockInput(draft.end, "end");

  if (title.length === 0) {
    issues.push("Give the commitment a title.");
  }

  if (startMinute === null || endMinute === null) {
    issues.push("A commitment needs a start and an end on today's clock. 12:00 AM as the end means midnight.");
  }

  if (issues.length > 0 || startMinute === null || endMinute === null) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: { title, startMinute, endMinute },
  };
}

function parseOptionalWindow(
  start: string,
  end: string,
  label: string,
  issues: string[],
): TimeWindow | undefined {
  const startText = start.trim();
  const endText = end.trim();

  if (startText.length === 0 && endText.length === 0) {
    return undefined;
  }

  const startMinute = parseClockInput(startText, "start");
  const endMinute = parseClockInput(endText, "end");

  if (startMinute === null || endMinute === null) {
    issues.push(`${label} needs both a start and an end, or leave both blank.`);
    return undefined;
  }

  if (startMinute >= endMinute) {
    issues.push(`${label} must start before it ends on the same local day.`);
    return undefined;
  }

  return { startMinute, endMinute };
}

function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}
