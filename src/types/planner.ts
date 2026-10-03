/** Minutes from local midnight. Valid instants are integers in `0..1440`. */
export const MINUTES_PER_DAY = 1440;

export type Priority = "low" | "medium" | "high";

export type EnergyLevel = "low" | "medium" | "high";

/** Half-open local time window: `[startMinute, endMinute)`. */
export interface TimeWindow {
  startMinute: number;
  endMinute: number;
}

export interface Task {
  id: string;
  title: string;
  /** Positive length in minutes. Tasks are never split across blocks. */
  durationMinutes: number;
  priority: Priority;
  /**
   * Inclusive finish deadline, in minutes from midnight.
   * A placed task must end at or before this minute.
   */
  deadlineMinute?: number;
  preferredWindow?: TimeWindow;
  energy: EnergyLevel;
  completed: boolean;
}

export interface FixedCommitment {
  id: string;
  title: string;
  startMinute: number;
  endMinute: number;
}

export interface PlannerSettings {
  planningStartMinute: number;
  planningEndMinute: number;
  /** Cumulative work minutes that trigger a break before more work. */
  breakFrequencyMinutes: number;
  breakDurationMinutes: number;
  /** Reserved at the end of the planning window and kept free of blocks. */
  endOfDayBufferMinutes: number;
  /**
   * Energy at planning start. Shifts the time-of-day energy curve as a soft
   * scoring preference only. Unset means the unshifted curve.
   */
  currentEnergy?: EnergyLevel;
}

interface ScheduledBlockBase {
  id: string;
  title: string;
  startMinute: number;
  endMinute: number;
}

export interface ScheduledTaskBlock extends ScheduledBlockBase {
  kind: "task";
  taskId: string;
  priority: Priority;
  energy: EnergyLevel;
}

export interface ScheduledCommitmentBlock extends ScheduledBlockBase {
  kind: "commitment";
  commitmentId: string;
}

export interface ScheduledBreakBlock extends ScheduledBlockBase {
  kind: "break";
  /** Task whose placement required this break. */
  forTaskId: string;
}

export type ScheduledBlock =
  | ScheduledTaskBlock
  | ScheduledCommitmentBlock
  | ScheduledBreakBlock;

export type DeferralReason =
  | "no_contiguous_slot"
  | "deadline_unmet"
  | "break_blocks_deadline"
  | "break_does_not_fit";

export interface DeferredTask {
  taskId: string;
  title: string;
  reason: DeferralReason;
  message: string;
}

/**
 * Parts of the planning window. They sum to `windowMinutes`:
 * scheduled work + breaks + commitments + buffer + unused.
 */
export interface TimeAccounting {
  windowMinutes: number;
  scheduledWorkMinutes: number;
  breakMinutes: number;
  commitmentMinutes: number;
  bufferMinutes: number;
  unusedMinutes: number;
}

export interface ScheduleObjective {
  deadlines: number;
  score: number;
  scheduled: number;
}

export interface ReplayStep {
  kind: "swap" | "move-earlier";
  taskIds: string[];
  deadlines: number;
  score: number;
  scheduled: number;
}

/** Greedy pass, then each replay change the scheduler actually kept. */
export interface ScheduleTrace {
  greedy: ScheduleObjective;
  kept: ScheduleObjective;
  steps: ReplayStep[];
}

export interface ScheduleResult {
  blocks: ScheduledBlock[];
  deferred: DeferredTask[];
  accounting: TimeAccounting;
  trace: ScheduleTrace;
}
