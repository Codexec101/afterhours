import {
  MINUTES_PER_DAY,
  type EnergyLevel,
  type FixedCommitment,
  type PlannerSettings,
  type Priority,
  type Task,
} from "../types/planner.ts";

const PRIORITIES = new Set<Priority>(["low", "medium", "high"]);
const ENERGY_LEVELS = new Set<EnergyLevel>(["low", "medium", "high"]);

export class PlannerValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join(" "));
    this.name = "PlannerValidationError";
    this.issues = issues;
  }
}

export function validatePlannerInput(
  tasks: readonly Task[],
  commitments: readonly FixedCommitment[],
  settings: PlannerSettings,
): string[] {
  const issues: string[] = [];

  validateSettings(settings, issues);
  validateCommitments(commitments, settings, issues);
  validateTasks(tasks, issues);
  validateUniqueIds(tasks, commitments, issues);

  return issues;
}

function validateSettings(settings: PlannerSettings, issues: string[]): void {
  const startOk = isMinute(settings.planningStartMinute, 0, MINUTES_PER_DAY);
  const endOk = isMinute(settings.planningEndMinute, 0, MINUTES_PER_DAY);

  if (!startOk || !endOk || settings.planningStartMinute >= settings.planningEndMinute) {
    issues.push(
      "Planning window must start before it ends on the same local day. Overnight windows are not supported.",
    );
  }

  if (!isMinute(settings.breakFrequencyMinutes, 1, MINUTES_PER_DAY)) {
    issues.push("Break frequency must be a positive whole number of minutes.");
  }

  if (!isMinute(settings.breakDurationMinutes, 0, MINUTES_PER_DAY)) {
    issues.push("Break duration must be a whole number of minutes from 0 through 1440.");
  }

  if (!isMinute(settings.endOfDayBufferMinutes, 0, MINUTES_PER_DAY)) {
    issues.push("End-of-day buffer must be a whole number of minutes from 0 through 1440.");
  } else if (
    startOk &&
    endOk &&
    settings.planningStartMinute < settings.planningEndMinute &&
    settings.endOfDayBufferMinutes >= settings.planningEndMinute - settings.planningStartMinute
  ) {
    issues.push("End-of-day buffer must be shorter than the planning window.");
  }
}

function validateCommitments(
  commitments: readonly FixedCommitment[],
  settings: PlannerSettings,
  issues: string[],
): void {
  for (const commitment of commitments) {
    if (!isNonEmptyText(commitment.id)) {
      issues.push("Each fixed commitment needs a non-empty id.");
    }

    if (!isNonEmptyText(commitment.title)) {
      issues.push("Each fixed commitment needs a non-empty title.");
    }

    if (
      !isMinute(commitment.startMinute, 0, MINUTES_PER_DAY - 1) ||
      !isMinute(commitment.endMinute, 1, MINUTES_PER_DAY) ||
      commitment.startMinute >= commitment.endMinute
    ) {
      const label = isNonEmptyText(commitment.title) ? commitment.title : commitment.id;
      issues.push(
        `Fixed commitment "${label}" must start before it ends, within a single local day.`,
      );
    }
  }

  const ordered = commitments
    .filter(
      (commitment) =>
        isMinute(commitment.startMinute, 0, MINUTES_PER_DAY) &&
        isMinute(commitment.endMinute, 0, MINUTES_PER_DAY) &&
        commitment.startMinute < commitment.endMinute,
    )
    .slice()
    .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];

    if (current && previous && current.startMinute < previous.endMinute) {
      issues.push(`Fixed commitments "${previous.title}" and "${current.title}" overlap.`);
    }
  }

  if (!canPlaceBuffer(settings) || settings.endOfDayBufferMinutes === 0) {
    return;
  }

  const bufferStart = settings.planningEndMinute - settings.endOfDayBufferMinutes;
  const bufferEnd = settings.planningEndMinute;

  for (const commitment of ordered) {
    if (commitment.startMinute < bufferEnd && commitment.endMinute > bufferStart) {
      issues.push(
        `Fixed commitment "${commitment.title}" overlaps the reserved end-of-day buffer (${bufferStart}–${bufferEnd}).`,
      );
    }
  }
}

function validateTasks(tasks: readonly Task[], issues: string[]): void {
  for (const task of tasks) {
    const label = isNonEmptyText(task.title) ? task.title : isNonEmptyText(task.id) ? task.id : "task";

    if (!isNonEmptyText(task.id)) {
      issues.push("Each task needs a non-empty id.");
    }

    if (!isNonEmptyText(task.title)) {
      issues.push("Each task needs a non-empty title.");
    }

    if (!isMinute(task.durationMinutes, 1, MINUTES_PER_DAY)) {
      issues.push(`Task "${label}" duration must be a positive whole number of minutes.`);
    }

    if (!PRIORITIES.has(task.priority)) {
      issues.push(`Task "${label}" has an invalid priority.`);
    }

    if (!ENERGY_LEVELS.has(task.energy)) {
      issues.push(`Task "${label}" has an invalid energy requirement.`);
    }

    if (typeof task.completed !== "boolean") {
      issues.push(`Task "${label}" completion status must be true or false.`);
    }

    if (task.deadlineMinute !== undefined && !isMinute(task.deadlineMinute, 0, MINUTES_PER_DAY)) {
      issues.push(`Task "${label}" deadline must be a whole minute from 0 through 1440.`);
    }

    const window = task.preferredWindow;

    if (!window) {
      continue;
    }

    if (
      !isMinute(window.startMinute, 0, MINUTES_PER_DAY - 1) ||
      !isMinute(window.endMinute, 1, MINUTES_PER_DAY) ||
      window.startMinute >= window.endMinute
    ) {
      issues.push(`Task "${label}" preferred window must start before it ends on the same local day.`);
    }
  }
}

function validateUniqueIds(
  tasks: readonly Task[],
  commitments: readonly FixedCommitment[],
  issues: string[],
): void {
  const seen = new Set<string>();

  for (const item of [...tasks, ...commitments]) {
    if (!isNonEmptyText(item.id) || seen.has(item.id)) {
      if (isNonEmptyText(item.id) && seen.has(item.id)) {
        issues.push(`Id "${item.id}" is used more than once.`);
      }
      continue;
    }

    seen.add(item.id);
  }
}

function canPlaceBuffer(settings: PlannerSettings): boolean {
  return (
    isMinute(settings.planningStartMinute, 0, MINUTES_PER_DAY) &&
    isMinute(settings.planningEndMinute, 0, MINUTES_PER_DAY) &&
    settings.planningStartMinute < settings.planningEndMinute &&
    isMinute(settings.endOfDayBufferMinutes, 0, MINUTES_PER_DAY) &&
    settings.endOfDayBufferMinutes < settings.planningEndMinute - settings.planningStartMinute
  );
}

function isMinute(value: number, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isNonEmptyText(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
