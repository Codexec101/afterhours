import type { EnergyLevel, PlannerSettings, Priority, Task } from "../types/planner.ts";

/**
 * Fixed energy model for a local day. This is a soft preference only.
 * Morning is high energy, afternoon is medium, and evening is low.
 */
export const MORNING_END_MINUTE = 12 * 60;
export const AFTERNOON_END_MINUTE = 17 * 60;

/** One priority step is 5. A full window plus an energy match is 6, so fit can beat one step and cannot beat two. */
const PRIORITY_SCORE: Record<Priority, number> = {
  low: 0,
  medium: 5,
  high: 10,
};

const WINDOW_SCORE_WEIGHT = 2;

const ENERGY_RANK: Record<EnergyLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const ENERGY_BY_RANK: readonly EnergyLevel[] = ["low", "medium", "high"];

function baseEnergyAtMinute(minute: number): EnergyLevel {
  if (minute < MORNING_END_MINUTE) {
    return "high";
  }

  if (minute < AFTERNOON_END_MINUTE) {
    return "medium";
  }

  return "low";
}

/**
 * Steps the user's current energy sits above or below the time-of-day curve at
 * planning start. Zero when current energy is unset or matches the curve.
 */
export function energyOffset(settings: Pick<PlannerSettings, "planningStartMinute" | "currentEnergy">): number {
  if (!settings.currentEnergy) {
    return 0;
  }

  return ENERGY_RANK[settings.currentEnergy] - ENERGY_RANK[baseEnergyAtMinute(settings.planningStartMinute)];
}

/** Time-of-day energy, shifted by `offset` steps and clamped to low..high. */
export function energyAtMinute(minute: number, offset = 0): EnergyLevel {
  const rank = ENERGY_RANK[baseEnergyAtMinute(minute)] + offset;

  return ENERGY_BY_RANK[Math.min(2, Math.max(0, rank))] ?? "medium";
}

/** 2 when the bands match, 1 when they are adjacent, 0 when they are opposites. */
export function energyCompatibility(required: EnergyLevel, available: EnergyLevel): number {
  return 2 - Math.abs(ENERGY_RANK[required] - ENERGY_RANK[available]);
}

/** 2 when the task sits inside the window, 1 on a partial overlap, 0 otherwise. */
export function preferredWindowScore(task: Task, startMinute: number, endMinute: number): number {
  const window = task.preferredWindow;

  if (!window) {
    return 0;
  }

  if (startMinute >= window.startMinute && endMinute <= window.endMinute) {
    return 2;
  }

  if (endMinute <= window.startMinute || startMinute >= window.endMinute) {
    return 0;
  }

  return 1;
}

export function scorePlacement(task: Task, startMinute: number, endMinute: number, offset = 0): number {
  return (
    PRIORITY_SCORE[task.priority] +
    preferredWindowScore(task, startMinute, endMinute) * WINDOW_SCORE_WEIGHT +
    energyCompatibility(task.energy, energyAtMinute(startMinute, offset))
  );
}

export function compareDeadlineTasks(left: Task, right: Task): number {
  const deadlineDelta = (left.deadlineMinute ?? 0) - (right.deadlineMinute ?? 0);

  if (deadlineDelta !== 0) {
    return deadlineDelta;
  }

  return compareFlexibleTasks(left, right);
}

export function compareFlexibleTasks(left: Task, right: Task): number {
  const priorityDelta = PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const durationDelta = right.durationMinutes - left.durationMinutes;

  if (durationDelta !== 0) {
    return durationDelta;
  }

  return compareText(left.id, right.id);
}

export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

