import {
  compareDeadlineTasks,
  compareFlexibleTasks,
  compareText,
  energyOffset,
  scorePlacement,
} from "./scoring.ts";
import { PlannerValidationError, validatePlannerInput } from "./validation.ts";
import type {
  DeferredTask,
  DeferralReason,
  FixedCommitment,
  PlannerSettings,
  ReplayStep,
  ScheduleResult,
  ScheduledBlock,
  Task,
  TimeAccounting,
} from "../types/planner.ts";

/**
 * Greedy scheduler for one local day, followed by a short replay of order
 * changes. It does not search every packing and it is not a globally optimal
 * planner.
 *
 * Fixed commitments and the end-of-day buffer are reserved first. Completed
 * tasks are left out. Deadline tasks are placed earliest-deadline-first.
 * A deadline task keeps its earliest high-scoring slot unless a later legal
 * slot leaves more other tasks a contiguous gap. Flexible tasks then take
 * remaining gaps. Every feasible start minute is scored. Priority, preferred
 * window, and energy can trade off; none of the soft preferences makes a
 * task ineligible.
 *
 * A break is inserted before a task that would push cumulative work minutes
 * past the break frequency. That total follows the clock order of blocks,
 * not the order tasks were chosen. Fixed commitments and other wall-clock
 * gaps do not reset the counter. A task longer than the frequency stays in
 * one block.
 *
 * The replay tries adjacent swaps and moves a deferred task earlier, then
 * keeps a schedule only when it schedules more deadlines, a higher placement
 * score, or more tasks. It stops after a few rounds. Counting whether each
 * other task still has its own gap can overestimate, because those tasks may
 * all need the same interval. Break timing still follows the work-minute rule.
 */

const MAX_IMPROVEMENT_ROUNDS = 12;

interface Gap {
  start: number;
  end: number;
}

interface BreakSpan extends Gap {
  forTaskId: string;
}

interface Candidate {
  start: number;
  end: number;
  breakBlocks: BreakSpan[];
  score: number;
}

interface Objective {
  deadlines: number;
  score: number;
  scheduled: number;
}

interface Attempt {
  blocks: ScheduledBlock[];
  deferred: DeferredTask[];
  accounting: TimeAccounting;
  placedTasks: Task[];
  deferredTasks: Task[];
  objective: Objective;
}

export function createSchedule(
  tasks: readonly Task[],
  commitments: readonly FixedCommitment[],
  settings: PlannerSettings,
): ScheduleResult {
  const issues = validatePlannerInput(tasks, commitments, settings);

  if (issues.length > 0) {
    throw new PlannerValidationError(issues);
  }

  const fixedBlocks = commitmentBlocks(commitments, settings);
  const gaps = freeGaps(settings, commitments);
  const activeTasks = tasks.filter((task) => !task.completed);
  const deadlineTasks = activeTasks
    .filter((task) => task.deadlineMinute !== undefined)
    .slice()
    .sort(compareDeadlineTasks);
  const flexibleTasks = activeTasks.filter((task) => task.deadlineMinute === undefined);
  const greedy = placeGreedy(deadlineTasks, flexibleTasks, gaps, fixedBlocks, settings);
  const improved = improve(
    [...greedy.placedTasks, ...greedy.deferredTasks],
    greedy,
    gaps,
    fixedBlocks,
    settings,
  );

  return {
    blocks: improved.attempt.blocks,
    deferred: improved.attempt.deferred,
    accounting: improved.attempt.accounting,
    trace: {
      greedy: greedy.objective,
      kept: improved.attempt.objective,
      steps: improved.steps,
    },
  };
}

function placeGreedy(
  deadlineTasks: readonly Task[],
  flexibleTasks: readonly Task[],
  initialGaps: readonly Gap[],
  fixedBlocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): Attempt {
  let gaps = copyGaps(initialGaps);
  let blocks = fixedBlocks.slice();
  let breakCount = 0;
  const deferred: DeferredTask[] = [];
  const deferredTasks: Task[] = [];
  const placedTasks: Task[] = [];
  let score = 0;

  for (let index = 0; index < deadlineTasks.length; index += 1) {
    const task = deadlineTasks[index];

    if (!task) {
      continue;
    }

    const others = [...deadlineTasks.slice(index + 1), ...flexibleTasks, ...deferredTasks];
    const candidate = chooseDeadlineCandidate(task, others, gaps, blocks, settings);

    if (!candidate) {
      deferred.push(explainDeferral(task, gaps));
      deferredTasks.push(task);
      continue;
    }

    ({ gaps, breakCount } = placeCandidate(task, candidate, gaps, breakCount, blocks));
    placedTasks.push(task);
    score += candidate.score;
  }

  const open = flexibleTasks.slice();

  while (open.length > 0) {
    const choice = bestFlexibleCandidate(open, gaps, blocks, settings);

    if (!choice) {
      const leftovers = open.slice().sort(compareFlexibleTasks);

      for (const task of leftovers) {
        deferred.push(explainDeferral(task, gaps));
        deferredTasks.push(task);
      }

      break;
    }

    ({ gaps, breakCount } = placeCandidate(choice.task, choice.candidate, gaps, breakCount, blocks));
    placedTasks.push(choice.task);
    score += choice.candidate.score;
    open.splice(choice.index, 1);
  }

  return finalizeAttempt(blocks, deferred, deferredTasks, placedTasks, score, settings);
}

function improve(
  initialOrder: readonly Task[],
  initial: Attempt,
  initialGaps: readonly Gap[],
  fixedBlocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): { attempt: Attempt; steps: ReplayStep[] } {
  let order = initialOrder.slice();
  let current = initial;
  const steps: ReplayStep[] = [];

  for (let round = 0; round < MAX_IMPROVEMENT_ROUNDS; round += 1) {
    const move = bestImprovement(order, current, initialGaps, fixedBlocks, settings);

    if (!move) {
      break;
    }

    order = move.order;
    current = move.attempt;
    steps.push({
      kind: move.kind,
      taskIds: move.order.map((task) => task.id),
      deadlines: move.attempt.objective.deadlines,
      score: move.attempt.objective.score,
      scheduled: move.attempt.objective.scheduled,
    });
  }

  return { attempt: current, steps };
}

function bestImprovement(
  order: readonly Task[],
  current: Attempt,
  initialGaps: readonly Gap[],
  fixedBlocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): { order: Task[]; attempt: Attempt; kind: ReplayStep["kind"] } | null {
  let best: { order: Task[]; attempt: Attempt; kind: ReplayStep["kind"] } | null = null;
  const deferredIds = new Set(current.deferredTasks.map((task) => task.id));

  const consider = (nextOrder: Task[], kind: ReplayStep["kind"]): void => {
    const attempt = placeSequence(nextOrder, initialGaps, fixedBlocks, settings);
    const baseline = best ? best.attempt.objective : current.objective;

    if (isBetterObjective(attempt.objective, baseline)) {
      best = { order: nextOrder, attempt, kind };
    }
  };

  for (let index = 0; index < order.length - 1; index += 1) {
    consider(swapAdjacent(order, index), "swap");
  }

  for (let from = 0; from < order.length; from += 1) {
    const task = order[from];

    if (!task || !deferredIds.has(task.id)) {
      continue;
    }

    for (let to = 0; to < from; to += 1) {
      consider(moveEarlier(order, from, to), "move-earlier");
    }
  }

  return best;
}

function placeSequence(
  order: readonly Task[],
  initialGaps: readonly Gap[],
  fixedBlocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): Attempt {
  let gaps = copyGaps(initialGaps);
  let blocks = fixedBlocks.slice();
  let breakCount = 0;
  const deferred: DeferredTask[] = [];
  const deferredTasks: Task[] = [];
  const placedTasks: Task[] = [];
  let score = 0;

  for (let index = 0; index < order.length; index += 1) {
    const task = order[index];

    if (!task) {
      continue;
    }

    const others = order.slice(index + 1);
    const candidate =
      task.deadlineMinute === undefined
        ? bestSlot(task, gaps, blocks, settings)
        : chooseDeadlineCandidate(task, others, gaps, blocks, settings);

    if (!candidate) {
      deferred.push(explainDeferral(task, gaps));
      deferredTasks.push(task);
      continue;
    }

    ({ gaps, breakCount } = placeCandidate(task, candidate, gaps, breakCount, blocks));
    placedTasks.push(task);
    score += candidate.score;
  }

  return finalizeAttempt(blocks, deferred, deferredTasks, placedTasks, score, settings);
}

function chooseDeadlineCandidate(
  task: Task,
  others: readonly Task[],
  gaps: readonly Gap[],
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): Candidate | null {
  if (!hasContiguousDeadlineSlot(task, gaps)) {
    return null;
  }

  let best: { candidate: Candidate; residual: number } | null = null;

  for (const candidate of collectCandidates(task, gaps, blocks, settings)) {
    const residual = countPlaceable(others, gapsAfter(gaps, candidate));

    if (best === null || isBetterDeadlineChoice(candidate, residual, best)) {
      best = { candidate, residual };
    }
  }

  return best?.candidate ?? null;
}

function isBetterDeadlineChoice(
  candidate: Candidate,
  residual: number,
  best: { candidate: Candidate; residual: number },
): boolean {
  if (residual !== best.residual) {
    return residual > best.residual;
  }

  if (candidate.score !== best.candidate.score) {
    return candidate.score > best.candidate.score;
  }

  return candidate.start < best.candidate.start;
}

function countPlaceable(tasks: readonly Task[], gaps: readonly Gap[]): number {
  let count = 0;

  for (const task of tasks) {
    const fits =
      task.deadlineMinute === undefined
        ? gaps.some((gap) => gap.end - gap.start >= task.durationMinutes)
        : hasContiguousDeadlineSlot(task, gaps);

    if (fits) {
      count += 1;
    }
  }

  return count;
}

function bestSlot(
  task: Task,
  gaps: readonly Gap[],
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): Candidate | null {
  let best: Candidate | null = null;

  for (const candidate of collectCandidates(task, gaps, blocks, settings)) {
    if (best === null || isBetterSlot(candidate, best)) {
      best = candidate;
    }
  }

  return best;
}

function isBetterSlot(candidate: Candidate, current: Candidate): boolean {
  if (candidate.score !== current.score) {
    return candidate.score > current.score;
  }

  return candidate.start < current.start;
}

function bestFlexibleCandidate(
  tasks: readonly Task[],
  gaps: readonly Gap[],
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): { task: Task; candidate: Candidate; index: number } | null {
  let best: { task: Task; candidate: Candidate; index: number } | null = null;

  tasks.forEach((task, index) => {
    for (const candidate of collectCandidates(task, gaps, blocks, settings)) {
      if (best === null || isBetterFlexibleChoice(task, candidate, best.task, best.candidate)) {
        best = { task, candidate, index };
      }
    }
  });

  return best;
}

function isBetterFlexibleChoice(
  task: Task,
  candidate: Candidate,
  currentTask: Task,
  current: Candidate,
): boolean {
  if (candidate.score !== current.score) {
    return candidate.score > current.score;
  }

  if (candidate.start !== current.start) {
    return candidate.start < current.start;
  }

  if (task.durationMinutes !== currentTask.durationMinutes) {
    return task.durationMinutes > currentTask.durationMinutes;
  }

  return compareText(task.id, currentTask.id) < 0;
}

function collectCandidates(
  task: Task,
  gaps: readonly Gap[],
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): Candidate[] {
  const candidates: Candidate[] = [];
  const offset = energyOffset(settings);

  for (const gap of gaps) {
    let maxStart = gap.end - task.durationMinutes;

    if (task.deadlineMinute !== undefined) {
      maxStart = Math.min(maxStart, task.deadlineMinute - task.durationMinutes);
    }

    if (gap.start > maxStart) {
      continue;
    }

    for (let start = gap.start; start <= maxStart; start += 1) {
      const end = start + task.durationMinutes;
      const breakBlocks = breaksForPlacement(task, start, end, gaps, blocks, settings);

      if (!breakBlocks) {
        continue;
      }

      candidates.push({
        start,
        end,
        breakBlocks,
        score: scorePlacement(task, start, end, offset),
      });
    }
  }

  return candidates;
}

/**
 * Breaks required to insert this task without pushing any chronological run of
 * work past the break frequency. Returns null when no legal break placement exists.
 * An empty list means the task can be inserted with no new break.
 */
function breaksForPlacement(
  task: Task,
  start: number,
  end: number,
  gaps: readonly Gap[],
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): BreakSpan[] | null {
  const breakBlocks: BreakSpan[] = [];
  let free = gaps;

  if (needsBreak(workBefore(blocks, start), end - start, settings)) {
    const breakBlock = earliestBreakBefore(start, blocks, free, settings);

    if (!breakBlock) {
      return null;
    }

    breakBlocks.push({ ...breakBlock, forTaskId: task.id });
    free = subtract(free, breakBlock);
  }

  free = subtract(free, { start, end });
  let preview = [
    ...blocks,
    previewTask(task, start, end),
    ...breakBlocks.map(previewBreak),
  ];

  if (workBreaksHold(preview, settings)) {
    return breakBlocks;
  }

  const violation = firstViolatingTask(preview, settings);

  if (!violation || violation.kind !== "task" || violation.startMinute === start) {
    return null;
  }

  const repair = earliestBreakBefore(violation.startMinute, preview, free, settings);

  if (!repair) {
    return null;
  }

  preview = [...preview, previewBreak(repair)];

  if (!workBreaksHold(preview, settings)) {
    return null;
  }

  return [...breakBlocks, { ...repair, forTaskId: violation.taskId }];
}

function gapsAfter(gaps: readonly Gap[], candidate: Candidate): Gap[] {
  let next = gaps;

  for (const breakBlock of candidate.breakBlocks) {
    next = subtract(next, breakBlock);
  }

  return subtract(next, { start: candidate.start, end: candidate.end });
}

function hasContiguousDeadlineSlot(task: Task, gaps: readonly Gap[]): boolean {
  const deadline = task.deadlineMinute;

  if (deadline === undefined) {
    return false;
  }

  return gaps.some(
    (gap) => gap.end - gap.start >= task.durationMinutes && gap.start + task.durationMinutes <= deadline,
  );
}

function explainDeferral(task: Task, gaps: readonly Gap[]): DeferredTask {
  const fitsSomewhere = gaps.some((gap) => gap.end - gap.start >= task.durationMinutes);

  if (!fitsSomewhere) {
    return deferred(task, "no_contiguous_slot", "No single free interval is long enough for this task.");
  }

  if (task.deadlineMinute !== undefined && !hasContiguousDeadlineSlot(task, gaps)) {
    return deferred(task, "deadline_unmet", "No free interval lets this task finish by its deadline.");
  }

  if (task.deadlineMinute !== undefined) {
    return deferred(
      task,
      "break_blocks_deadline",
      "A required break leaves no contiguous slot that finishes by this task's deadline.",
    );
  }

  return deferred(
    task,
    "break_does_not_fit",
    "A break is required before more work, and the break plus this task do not fit in the remaining free time.",
  );
}

function deferred(task: Task, reason: DeferralReason, message: string): DeferredTask {
  return {
    taskId: task.id,
    title: task.title,
    reason,
    message,
  };
}

function needsBreak(workSinceBreak: number, durationMinutes: number, settings: PlannerSettings): boolean {
  if (settings.breakDurationMinutes <= 0 || workSinceBreak <= 0) {
    return false;
  }

  return workSinceBreak + durationMinutes > settings.breakFrequencyMinutes;
}

function workBefore(blocks: readonly ScheduledBlock[], start: number): number {
  let work = 0;

  for (const block of blocksByTime(blocks)) {
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

/** Latest task or break end before `start`. Commitments do not move it. */
function workSegmentEnd(blocks: readonly ScheduledBlock[], start: number): number {
  let anchor = 0;

  for (const block of blocksByTime(blocks)) {
    if (block.startMinute >= start) {
      break;
    }

    if (block.kind === "commitment" || block.endMinute > start) {
      continue;
    }

    anchor = block.endMinute;
  }

  return anchor;
}

function earliestBreakBefore(
  start: number,
  blocks: readonly ScheduledBlock[],
  gaps: readonly Gap[],
  settings: PlannerSettings,
): Gap | null {
  const anchor = workSegmentEnd(blocks, start);

  for (const gap of gaps) {
    const earliest = Math.max(gap.start, anchor);
    const latestStart = Math.min(gap.end, start) - settings.breakDurationMinutes;

    if (earliest <= latestStart) {
      return { start: earliest, end: earliest + settings.breakDurationMinutes };
    }
  }

  return null;
}

function workBreaksHold(blocks: readonly ScheduledBlock[], settings: PlannerSettings): boolean {
  return firstViolatingTask(blocks, settings) === null && breaksFollowWork(blocks, settings);
}

function firstViolatingTask(
  blocks: readonly ScheduledBlock[],
  settings: PlannerSettings,
): ScheduledBlock | null {
  let work = 0;

  for (const block of blocksByTime(blocks)) {
    if (block.kind === "commitment") {
      continue;
    }

    if (block.kind === "break") {
      work = 0;
      continue;
    }

    const duration = block.endMinute - block.startMinute;

    if (needsBreak(work, duration, settings)) {
      return block;
    }

    work += duration;
  }

  return null;
}

function breaksFollowWork(blocks: readonly ScheduledBlock[], settings: PlannerSettings): boolean {
  if (settings.breakDurationMinutes <= 0) {
    return true;
  }

  let work = 0;

  for (const block of blocksByTime(blocks)) {
    if (block.kind === "commitment") {
      continue;
    }

    if (block.kind === "break") {
      if (work <= 0) {
        return false;
      }

      work = 0;
      continue;
    }

    work += block.endMinute - block.startMinute;
  }

  return true;
}

function previewTask(task: Task, start: number, end: number): ScheduledBlock {
  return {
    kind: "task",
    id: `task:${task.id}`,
    taskId: task.id,
    title: task.title,
    startMinute: start,
    endMinute: end,
    priority: task.priority,
    energy: task.energy,
  };
}

function previewBreak(gap: Gap): ScheduledBlock {
  return {
    kind: "break",
    id: "break-preview",
    title: "Break",
    startMinute: gap.start,
    endMinute: gap.end,
    forTaskId: "preview",
  };
}

function blocksByTime(blocks: readonly ScheduledBlock[]): ScheduledBlock[] {
  return blocks.slice().sort((left, right) => left.startMinute - right.startMinute || compareText(left.id, right.id));
}

function placeCandidate(
  task: Task,
  candidate: Candidate,
  gaps: Gap[],
  breakCount: number,
  blocks: ScheduledBlock[],
): { gaps: Gap[]; breakCount: number } {
  let nextGaps = gaps;
  let nextBreakCount = breakCount;
  const orderedBreaks = candidate.breakBlocks.slice().sort((left, right) => left.start - right.start);

  for (const breakBlock of orderedBreaks) {
    nextBreakCount += 1;
    blocks.push({
      kind: "break",
      id: `break-${nextBreakCount}`,
      title: "Break",
      startMinute: breakBlock.start,
      endMinute: breakBlock.end,
      forTaskId: breakBlock.forTaskId,
    });
    nextGaps = subtract(nextGaps, breakBlock);
  }

  blocks.push(previewTask(task, candidate.start, candidate.end));
  nextGaps = subtract(nextGaps, { start: candidate.start, end: candidate.end });

  return { gaps: nextGaps, breakCount: nextBreakCount };
}

function finalizeAttempt(
  blocks: ScheduledBlock[],
  deferred: DeferredTask[],
  deferredTasks: Task[],
  placedTasks: Task[],
  score: number,
  settings: PlannerSettings,
): Attempt {
  blocks.sort(
    (left, right) => left.startMinute - right.startMinute || compareText(left.id, right.id),
  );
  let seenBreaks = 0;

  for (const block of blocks) {
    if (block.kind !== "break") {
      continue;
    }

    seenBreaks += 1;
    block.id = `break-${seenBreaks}`;
  }

  assertSchedule(blocks, settings);
  assertWorkBreaks(blocks, settings);

  const accounting = account(blocks, settings);
  assertBalanced(accounting);

  return {
    blocks,
    deferred,
    accounting,
    placedTasks,
    deferredTasks,
    objective: {
      deadlines: placedTasks.filter((task) => task.deadlineMinute !== undefined).length,
      score,
      scheduled: placedTasks.length,
    },
  };
}

function isBetterObjective(next: Objective, current: Objective): boolean {
  if (next.deadlines !== current.deadlines) {
    return next.deadlines > current.deadlines;
  }

  if (next.score !== current.score) {
    return next.score > current.score;
  }

  return next.scheduled > current.scheduled;
}

function swapAdjacent(order: readonly Task[], index: number): Task[] {
  const next = order.slice();
  const left = next[index];
  const right = next[index + 1];

  if (left && right) {
    next[index] = right;
    next[index + 1] = left;
  }

  return next;
}

function moveEarlier(order: readonly Task[], from: number, to: number): Task[] {
  const next = order.slice();
  const [task] = next.splice(from, 1);

  if (task) {
    next.splice(to, 0, task);
  }

  return next;
}

function copyGaps(gaps: readonly Gap[]): Gap[] {
  return gaps.map((gap) => ({ start: gap.start, end: gap.end }));
}

function commitmentBlocks(
  commitments: readonly FixedCommitment[],
  settings: PlannerSettings,
): ScheduledBlock[] {
  return commitments
    .slice()
    .sort(
      (left, right) =>
        left.startMinute - right.startMinute || compareText(left.id, right.id),
    )
    .flatMap((commitment) => {
      const clipped = clip(
        commitment.startMinute,
        commitment.endMinute,
        settings.planningStartMinute,
        settings.planningEndMinute,
      );

      if (!clipped) {
        return [];
      }

      return [
        {
          kind: "commitment" as const,
          id: `commitment:${commitment.id}`,
          commitmentId: commitment.id,
          title: commitment.title,
          startMinute: clipped.start,
          endMinute: clipped.end,
        },
      ];
    });
}

function freeGaps(settings: PlannerSettings, commitments: readonly FixedCommitment[]): Gap[] {
  const usableEnd = settings.planningEndMinute - settings.endOfDayBufferMinutes;
  let gaps: Gap[] = [{ start: settings.planningStartMinute, end: usableEnd }];

  const reserved = commitments
    .flatMap((commitment) => {
      const clipped = clip(
        commitment.startMinute,
        commitment.endMinute,
        settings.planningStartMinute,
        usableEnd,
      );
      return clipped ? [clipped] : [];
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);

  for (const block of reserved) {
    gaps = subtract(gaps, block);
  }

  return gaps;
}

function clip(start: number, end: number, windowStart: number, windowEnd: number): Gap | null {
  const clippedStart = Math.max(start, windowStart);
  const clippedEnd = Math.min(end, windowEnd);

  if (clippedStart >= clippedEnd) {
    return null;
  }

  return { start: clippedStart, end: clippedEnd };
}

function subtract(gaps: readonly Gap[], block: Gap): Gap[] {
  const next: Gap[] = [];

  for (const gap of gaps) {
    if (block.end <= gap.start || block.start >= gap.end) {
      next.push(gap);
      continue;
    }

    if (block.start > gap.start) {
      next.push({ start: gap.start, end: block.start });
    }

    if (block.end < gap.end) {
      next.push({ start: block.end, end: gap.end });
    }
  }

  return next;
}

function account(blocks: readonly ScheduledBlock[], settings: PlannerSettings): TimeAccounting {
  const windowMinutes = settings.planningEndMinute - settings.planningStartMinute;
  const scheduledWorkMinutes = sumKind(blocks, "task");
  const breakMinutes = sumKind(blocks, "break");
  const commitmentMinutes = sumKind(blocks, "commitment");
  const bufferMinutes = settings.endOfDayBufferMinutes;
  const unusedMinutes =
    windowMinutes - scheduledWorkMinutes - breakMinutes - commitmentMinutes - bufferMinutes;

  return {
    windowMinutes,
    scheduledWorkMinutes,
    breakMinutes,
    commitmentMinutes,
    bufferMinutes,
    unusedMinutes,
  };
}

function sumKind(blocks: readonly ScheduledBlock[], kind: ScheduledBlock["kind"]): number {
  return blocks
    .filter((block) => block.kind === kind)
    .reduce((total, block) => total + (block.endMinute - block.startMinute), 0);
}

function assertSchedule(blocks: readonly ScheduledBlock[], settings: PlannerSettings): void {
  const sorted = blocks.slice().sort((left, right) => left.startMinute - right.startMinute);
  const bufferStart = settings.planningEndMinute - settings.endOfDayBufferMinutes;
  const taskIds = new Set<string>();

  for (let index = 0; index < sorted.length; index += 1) {
    const block = sorted[index];

    if (!block || block.startMinute >= block.endMinute) {
      throw new Error("Scheduled block is empty.");
    }

    if (block.startMinute < settings.planningStartMinute || block.endMinute > settings.planningEndMinute) {
      throw new Error(`Scheduled block ${block.id} is outside the planning window.`);
    }

    if (block.endMinute > bufferStart) {
      throw new Error(`Scheduled block ${block.id} overlaps the end-of-day buffer.`);
    }

    const previous = sorted[index - 1];

    if (previous && block.startMinute < previous.endMinute) {
      throw new Error(`Scheduled blocks overlap: ${previous.id} and ${block.id}.`);
    }

    if (block.kind !== "task") {
      continue;
    }

    if (taskIds.has(block.taskId)) {
      throw new Error(`Task ${block.taskId} was split across multiple blocks.`);
    }

    taskIds.add(block.taskId);
  }
}

function assertWorkBreaks(blocks: readonly ScheduledBlock[], settings: PlannerSettings): void {
  if (workBreaksHold(blocks, settings)) {
    return;
  }

  throw new Error("Scheduled work exceeds the break frequency without a break between those tasks.");
}

function assertBalanced(accounting: TimeAccounting): void {
  const total =
    accounting.scheduledWorkMinutes +
    accounting.breakMinutes +
    accounting.commitmentMinutes +
    accounting.bufferMinutes +
    accounting.unusedMinutes;

  if (total !== accounting.windowMinutes || accounting.unusedMinutes < 0) {
    throw new Error(
      `Time accounting does not balance: ${total} counted minutes in a ${accounting.windowMinutes}-minute window.`,
    );
  }
}
