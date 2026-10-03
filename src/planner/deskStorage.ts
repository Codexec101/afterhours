import type { EnergyLevel, FixedCommitment, PlannerSettings, Priority, Task, TimeWindow } from "../types/planner.ts";
import { energyAtMinute } from "../engine/scoring.ts";
import { toDateKey } from "../utils/dateKey.ts";
import { parseClockInput } from "../utils/time.ts";
import type { SettingsDraft } from "./parsePlannerForm.ts";

/** Versioned document. Newer versions are left untouched. */
export const DESK_VERSION = 1;

export const DESK_STORAGE_KEY = "afterhours.desk.v1";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface PlanInputs {
  tasks: Task[];
  commitments: FixedCommitment[];
  settings: PlannerSettings;
}

export interface DeskSnapshot {
  settings: SettingsDraft;
  tasks: Task[];
  commitments: FixedCommitment[];
  planInputs: PlanInputs | null;
}

export type DeskReadResult =
  | { status: "empty" }
  | { status: "ready"; desk: DeskSnapshot; carriedSettings: boolean }
  | { status: "malformed" }
  | { status: "unavailable" }
  | { status: "newer" };

interface DayRecord {
  dateKey: string;
  snapshot: DeskSnapshot;
}

export function readDesk(storage: Storage, date: Date): DeskReadResult {
  const today = toDateKey(date);
  let raw: string | null;

  try {
    raw = storage.getItem(DESK_STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }

  if (raw === null) {
    return { status: "empty" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "malformed" };
  }

  if (isNewerVersion(parsed)) {
    return { status: "newer" };
  }

  const legacy = parseLegacySnapshot(parsed);

  if (legacy) {
    return { status: "ready", desk: legacy, carriedSettings: false };
  }

  if (!isVersionedFile(parsed)) {
    return { status: "malformed" };
  }

  const days = collectDays(parsed.days);
  const todayRecord = days.get(today);

  if (todayRecord) {
    return { status: "ready", desk: todayRecord.snapshot, carriedSettings: false };
  }

  const carried = carrySettings(days, today);

  if (!carried) {
    return { status: "empty" };
  }

  return {
    status: "ready",
    carriedSettings: true,
    desk: {
      settings: carried,
      tasks: [],
      commitments: [],
      planInputs: null,
    },
  };
}

export type DeskWriteResult = "saved" | "newer" | "failed";

/**
 * Writes this local day's desk.
 * A newer saved document is left untouched.
 * Other days already in the file are left in place.
 */
export function writeDesk(storage: Storage, date: Date, desk: DeskSnapshot): DeskWriteResult {
  const dateKey = toDateKey(date);
  let raw: string | null;

  try {
    raw = storage.getItem(DESK_STORAGE_KEY);
  } catch {
    return "failed";
  }

  let days: Record<string, unknown> = {};

  if (raw !== null) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    if (isNewerVersion(parsed)) {
      return "newer";
    }

    if (isVersionedFile(parsed)) {
      days = { ...parsed.days };
    }
  }

  days[dateKey] = {
    dateKey,
    settings: desk.settings,
    tasks: desk.tasks,
    commitments: desk.commitments,
    planInputs: desk.planInputs,
  };

  try {
    storage.setItem(DESK_STORAGE_KEY, JSON.stringify({ version: DESK_VERSION, days }));
    return "saved";
  } catch {
    return "failed";
  }
}

export function openLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }

    return localStorage;
  } catch {
    return null;
  }
}

function collectDays(value: unknown): Map<string, DayRecord> {
  const days = new Map<string, DayRecord>();

  if (!isRecord(value)) {
    return days;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (!DATE_KEY.test(key)) {
      continue;
    }

    const snapshot = parseDay(entry, key);

    if (snapshot) {
      days.set(key, { dateKey: key, snapshot });
    }
  }

  return days;
}

function carrySettings(days: Map<string, DayRecord>, today: string): SettingsDraft | null {
  const earlier = [...days.keys()].filter((key) => key < today).sort();
  const latest = earlier.at(-1);

  if (!latest) {
    return null;
  }

  return days.get(latest)?.snapshot.settings ?? null;
}

function parseDay(value: unknown, dateKey: string): DeskSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.dateKey !== undefined && value.dateKey !== dateKey) {
    return null;
  }

  return parseSnapshot(value);
}

function parseLegacySnapshot(value: unknown): DeskSnapshot | null {
  if (!isRecord(value) || "version" in value || "days" in value) {
    return null;
  }

  return parseSnapshot(value);
}

function parseSnapshot(value: Record<string, unknown>): DeskSnapshot | null {
  const settings = parseSettingsDraft(value.settings);
  const tasks = Array.isArray(value.tasks) ? value.tasks.flatMap(parseTask) : null;
  const commitments = Array.isArray(value.commitments) ? value.commitments.flatMap(parseCommitment) : null;

  if (!settings || !tasks || !commitments) {
    return null;
  }

  if (value.planInputs === undefined) {
    return null;
  }

  const planInputs = value.planInputs === null ? null : parsePlanInputs(value.planInputs);

  if (value.planInputs !== null && !planInputs) {
    return null;
  }

  return { settings, tasks, commitments, planInputs };
}

function parsePlanInputs(value: unknown): PlanInputs | null {
  if (!isRecord(value)) {
    return null;
  }

  const tasks = Array.isArray(value.tasks) ? value.tasks.flatMap(parseTask) : null;
  const commitments = Array.isArray(value.commitments) ? value.commitments.flatMap(parseCommitment) : null;
  const settings = parsePlannerSettings(value.settings);

  if (!tasks || !commitments || !settings) {
    return null;
  }

  return { tasks, commitments, settings };
}

function parseSettingsDraft(value: unknown): SettingsDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.planningStart !== "string" ||
    typeof value.planningEnd !== "string" ||
    typeof value.breakFrequencyMinutes !== "string" ||
    typeof value.breakDurationMinutes !== "string" ||
    typeof value.endOfDayBufferMinutes !== "string"
  ) {
    return null;
  }

  return {
    planningStart: value.planningStart,
    planningEnd: value.planningEnd,
    endAtMidnight: typeof value.endAtMidnight === "boolean" ? value.endAtMidnight : value.planningEnd === "00:00",
    breakFrequencyMinutes: value.breakFrequencyMinutes,
    breakDurationMinutes: value.breakDurationMinutes,
    endOfDayBufferMinutes: value.endOfDayBufferMinutes,
    currentEnergy:
      energyField(value.currentEnergy) ?? energyAtMinute(parseClockInput(value.planningStart, "start") ?? 12 * 60),
  };
}

function parsePlannerSettings(value: unknown): PlannerSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const planningStartMinute = numberField(value.planningStartMinute);
  const planningEndMinute = numberField(value.planningEndMinute);
  const breakFrequencyMinutes = numberField(value.breakFrequencyMinutes);
  const breakDurationMinutes = numberField(value.breakDurationMinutes);
  const endOfDayBufferMinutes = numberField(value.endOfDayBufferMinutes);

  if (
    planningStartMinute === null ||
    planningEndMinute === null ||
    breakFrequencyMinutes === null ||
    breakDurationMinutes === null ||
    endOfDayBufferMinutes === null
  ) {
    return null;
  }

  return {
    planningStartMinute,
    planningEndMinute,
    breakFrequencyMinutes,
    breakDurationMinutes,
    endOfDayBufferMinutes,
    ...(energyField(value.currentEnergy) ? { currentEnergy: energyField(value.currentEnergy) as EnergyLevel } : {}),
  };
}

function parseTask(value: unknown): Task[] {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.title !== "string") {
    return [];
  }

  const durationMinutes = numberField(value.durationMinutes);
  const priority = priorityField(value.priority);
  const energy = energyField(value.energy);

  if (durationMinutes === null || !priority || !energy || typeof value.completed !== "boolean") {
    return [];
  }

  let deadlineMinute: number | undefined;

  if (value.deadlineMinute !== undefined) {
    const parsedDeadline = numberField(value.deadlineMinute);

    if (parsedDeadline === null) {
      return [];
    }

    deadlineMinute = parsedDeadline;
  }

  let preferredWindow: TimeWindow | undefined;

  if (value.preferredWindow !== undefined) {
    preferredWindow = parseWindow(value.preferredWindow);

    if (!preferredWindow) {
      return [];
    }
  }

  return [
    {
      id: value.id,
      title: value.title,
      durationMinutes,
      priority,
      deadlineMinute,
      preferredWindow,
      energy,
      completed: value.completed,
    },
  ];
}

function parseCommitment(value: unknown): FixedCommitment[] {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.title !== "string") {
    return [];
  }

  const startMinute = numberField(value.startMinute);
  const endMinute = numberField(value.endMinute);

  if (startMinute === null || endMinute === null) {
    return [];
  }

  return [{ id: value.id, title: value.title, startMinute, endMinute }];
}

function parseWindow(value: unknown): TimeWindow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const startMinute = numberField(value.startMinute);
  const endMinute = numberField(value.endMinute);

  if (startMinute === null || endMinute === null) {
    return undefined;
  }

  return { startMinute, endMinute };
}

function isNewerVersion(value: unknown): boolean {
  return isRecord(value) && typeof value.version === "number" && value.version > DESK_VERSION;
}

function isVersionedFile(value: unknown): value is { version: number; days: Record<string, unknown> } {
  return isRecord(value) && value.version === DESK_VERSION && isRecord(value.days);
}

function priorityField(value: unknown): Priority | null {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return null;
}

function energyField(value: unknown): EnergyLevel | null {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return null;
}

function numberField(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
