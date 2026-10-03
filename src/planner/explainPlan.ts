import {
  energyAtMinute,
  energyOffset,
  energyCompatibility,
  preferredWindowScore,
  scorePlacement,
} from "../engine/scoring.ts";
import type {
  DeferralReason,
  FixedCommitment,
  PlannerSettings,
  ScheduleObjective,
  ScheduleResult,
  ScheduledBlock,
  ScheduledTaskBlock,
  Task,
} from "../types/planner.ts";
import { formatDuration, formatMinute, formatMinuteRange } from "../utils/time.ts";

export interface RuleNote {
  title: string;
  body: string;
}

export interface PlacementFact {
  id: string;
  title: string;
  kind: ScheduledBlock["kind"];
  facts: string[];
}

export interface PlanExplanation {
  scheduledCount: number;
  deferredCount: number;
  rules: RuleNote[];
  placements: PlacementFact[];
}

const WINDOW_SCORE_WEIGHT = 2;

const REASON_LABEL: Record<DeferralReason, string> = {
  no_contiguous_slot: "No contiguous time",
  deadline_unmet: "Deadline cannot be met",
  break_blocks_deadline: "Break blocks the deadline",
  break_does_not_fit: "Break does not fit",
};

export function deferralLabel(reason: DeferralReason): string {
  return REASON_LABEL[reason];
}

/**
 * Explains a generated plan from the scheduler's blocks, scores, and documented rules.
 * Placement numbers come from the same scoring functions the engine uses.
 */
export function explainPlan(
  result: ScheduleResult,
  tasks: readonly Task[],
  commitments: readonly FixedCommitment[],
  settings: PlannerSettings,
): PlanExplanation {
  const scheduledCount = result.blocks.filter((block) => block.kind === "task").length;
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const commitmentsById = new Map(commitments.map((commitment) => [commitment.id, commitment]));

  return {
    scheduledCount,
    deferredCount: result.deferred.length,
    rules: ruleNotes(result, tasks, settings),
    placements: result.blocks.map((block) => placementFact(block, tasksById, commitmentsById, result.blocks, settings)),
  };
}

function ruleNotes(result: ScheduleResult, tasks: readonly Task[], settings: PlannerSettings): RuleNote[] {
  const { accounting, trace } = result;
  const completed = tasks.filter((task) => task.completed);
  const completedSentence =
    completed.length === 0
      ? "No tasks were marked completed."
      : `Left out because they are completed: ${completed.map((task) => task.title).join(", ")}.`;
  const breakRule =
    settings.breakDurationMinutes === 0
      ? "Break duration is 0, so the scheduler inserts no breaks."
      : `A break of ${formatDuration(settings.breakDurationMinutes)} is inserted before a task that would push cumulative work past ${formatDuration(settings.breakFrequencyMinutes)}. That total follows the clock order of blocks. Fixed commitments and other gaps do not reset it. A task longer than the frequency stays in one block. Each break names the task the scheduler recorded as the reason.`;

  return [
    {
      title: "Reserved first",
      body: `Fixed commitments and the end-of-day buffer are held before any task is placed. This window is ${formatDuration(accounting.windowMinutes)}: ${formatDuration(accounting.commitmentMinutes)} of commitments and ${formatDuration(accounting.bufferMinutes)} of buffer.`,
    },
    {
      title: "Order of tasks",
      body: `${completedSentence} Deadline tasks are placed earliest deadline first. A deadline task keeps its earliest high-scoring slot unless a later legal slot leaves more other tasks a contiguous gap. Flexible tasks then take the remaining gaps.`,
    },
    {
      title: "Soft preferences",
      body: "Every feasible start minute is scored. Priority is worth 0, 5, or 10. A preferred window adds 0, 2, or 4. Energy adds 0, 1, or 2: morning is high, afternoon is medium, and evening is low, shifted up or down when your current energy differs from that curve at the start of the window. One priority step outweighs a full window plus an energy match. None of these preferences makes a task ineligible.",
    },
    {
      title: "Breaks",
      body: breakRule,
    },
    {
      title: "Replay",
      body: replayBody(trace, tasks),
    },
    {
      title: "Limit of this plan",
      body: "The scheduler is a greedy heuristic. The replay above is the sequence it kept, not a search of every packing, and it is not a globally optimal plan. Counting whether other tasks still have a gap can overestimate, because those tasks may all need the same interval.",
    },
  ];
}

function replayBody(trace: ScheduleResult["trace"], tasks: readonly Task[]): string {
  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  const first = `The first pass scheduled ${countTasks(trace.greedy)}.`;

  if (trace.steps.length === 0) {
    return `${first} The replay tried adjacent swaps and moving a deferred task earlier. It did not find a schedule with more deadlines, a higher placement score, or more tasks, so this plan is that first pass.`;
  }

  const steps = trace.steps.map((step, index) => {
    const previous = index === 0 ? trace.greedy : trace.steps[index - 1];
    const reason = keepReason(previous ?? trace.greedy, step);
    const order = step.taskIds.map((id) => titles.get(id) ?? id).join(", ");
    const action = step.kind === "swap" ? "swapped two adjacent tasks" : "moved a deferred task earlier";

    return `Step ${index + 1} ${action} and was kept because ${reason}. Order considered: ${order}.`;
  });

  return `${first} ${steps.join(" ")} The kept plan scheduled ${countTasks(trace.kept)}.`;
}

function countTasks(objective: ScheduleObjective): string {
  const taskLabel = objective.scheduled === 1 ? "1 task" : `${objective.scheduled} tasks`;
  const deadlineLabel = objective.deadlines === 1 ? "1 deadline" : `${objective.deadlines} deadlines`;

  return `${taskLabel}, including ${deadlineLabel}, at placement score ${objective.score}`;
}

function keepReason(
  previous: ScheduleObjective,
  next: ScheduleObjective,
): string {
  if (next.deadlines !== previous.deadlines) {
    return `it schedules more deadlines (${previous.deadlines} to ${next.deadlines})`;
  }

  if (next.score !== previous.score) {
    return `it has a higher placement score (${previous.score} to ${next.score})`;
  }

  return `it schedules more tasks (${previous.scheduled} to ${next.scheduled})`;
}

function placementFact(
  block: ScheduledBlock,
  tasksById: ReadonlyMap<string, Task>,
  commitmentsById: ReadonlyMap<string, FixedCommitment>,
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): PlacementFact {
  if (block.kind === "task") {
    return {
      id: block.id,
      title: block.title,
      kind: "task",
      facts: taskFacts(block, tasksById.get(block.taskId), settings),
    };
  }

  if (block.kind === "commitment") {
    return {
      id: block.id,
      title: block.title,
      kind: "commitment",
      facts: commitmentFacts(block, commitmentsById.get(block.commitmentId), settings),
    };
  }

  return {
    id: block.id,
    title: block.title,
    kind: "break",
    facts: breakFacts(block, blocks, settings),
  };
}

function taskFacts(block: ScheduledTaskBlock, task: Task | undefined, settings: PlannerSettings): string[] {
  const facts = [
    `${formatMinuteRange(block.startMinute, block.endMinute)} · ${formatDuration(block.endMinute - block.startMinute)}.`,
  ];

  if (!task) {
    facts.push("The task record for this block was not in the inputs used to generate the plan.");
    return facts;
  }

  const offset = energyOffset(settings);
  const score = scorePlacement(task, block.startMinute, block.endMinute, offset);
  const windowScore = preferredWindowScore(task, block.startMinute, block.endMinute);
  const available = energyAtMinute(block.startMinute, offset);
  const compatibility = energyCompatibility(task.energy, available);
  const priorityPoints = score - windowScore * WINDOW_SCORE_WEIGHT - compatibility;

  facts.push(
    `Placement score ${score}. Priority contributes ${priorityPoints}. Preferred-window fit is ${windowScore} of 2, weighted by ${WINDOW_SCORE_WEIGHT}. Energy compatibility is ${compatibility} of 2.`,
  );
  facts.push(
    `The task asks for ${task.energy} energy. ${formatMinute(block.startMinute)} is in the ${available} band. Energy is a soft preference, so a mismatch still leaves the task eligible.`,
  );

  if (task.preferredWindow) {
    facts.push(
      `Preferred window ${formatMinuteRange(task.preferredWindow.startMinute, task.preferredWindow.endMinute)}: ${windowFitLabel(windowScore)}.`,
    );
  } else {
    facts.push("No preferred window was set, so that part of the score is 0.");
  }

  if (task.deadlineMinute !== undefined) {
    facts.push(
      `Deadline ${formatMinute(task.deadlineMinute)}. A placed task has to end at or before that minute. Deadline tasks are considered earliest deadline first.`,
    );
  } else {
    facts.push("No deadline. Flexible tasks are scored into the gaps left after deadline tasks.");
  }

  return facts;
}

function commitmentFacts(
  block: Extract<ScheduledBlock, { kind: "commitment" }>,
  commitment: FixedCommitment | undefined,
  settings: PlannerSettings,
): string[] {
  const facts = [
    `${formatMinuteRange(block.startMinute, block.endMinute)} · ${formatDuration(block.endMinute - block.startMinute)}.`,
    "Fixed commitments are reserved before tasks. The scheduler does not move them to make room.",
  ];

  if (
    commitment &&
    (commitment.startMinute < settings.planningStartMinute || commitment.endMinute > settings.planningEndMinute)
  ) {
    facts.push(
      `Only the portion inside the planning window is shown. The commitment runs ${formatMinuteRange(commitment.startMinute, commitment.endMinute)}.`,
    );
  }

  return facts;
}

function breakFacts(
  block: Extract<ScheduledBlock, { kind: "break" }>,
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): string[] {
  const work = workSinceBreak(blocks, block.startMinute);
  const trigger = blocks.find((item) => item.kind === "task" && item.taskId === block.forTaskId);
  const facts = [
    `${formatMinuteRange(block.startMinute, block.endMinute)} · ${formatDuration(block.endMinute - block.startMinute)}.`,
    `Work since the previous break is ${formatDuration(work)}. The break frequency is ${formatDuration(settings.breakFrequencyMinutes)}. Commitments do not reset that count.`,
  ];

  if (trigger && trigger.kind === "task") {
    const duration = trigger.endMinute - trigger.startMinute;
    const placedEarly = trigger.startMinute > block.endMinute;

    facts.push(
      placedEarly
        ? `"${trigger.title}" required this break. That task is ${formatDuration(duration)} and starts at ${formatMinute(trigger.startMinute)}. The break is the earliest legal minute after the previous task or break.`
        : `"${trigger.title}" is ${formatDuration(duration)}. The scheduler inserted this break before that task because placing it would push cumulative work past the frequency.`,
    );
  } else {
    facts.push(`The scheduler recorded this break for task ${block.forTaskId}.`);
  }

  if (work > settings.breakFrequencyMinutes) {
    facts.push("A task longer than the frequency stays in a single block. The break is placed before more work, not inside that task.");
  }

  return facts;
}

function workSinceBreak(blocks: readonly ScheduledBlock[], start: number): number {
  let work = 0;

  for (const block of blocks) {
    if (block.startMinute >= start) {
      break;
    }

    if (block.kind === "commitment" || block.endMinute > start) {
      continue;
    }

    if (block.kind === "break") {
      work = 0;
      continue;
    }

    work += block.endMinute - block.startMinute;
  }

  return work;
}

function windowFitLabel(score: number): string {
  if (score >= 2) {
    return "the block sits inside the window";
  }

  if (score === 1) {
    return "the block overlaps the window only in part";
  }

  return "the block falls outside the window";
}
