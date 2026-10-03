import type { FixedCommitment, PlannerSettings, Task } from "../types/planner.ts";
import { formatClockInput } from "../utils/time.ts";
import type { SettingsDraft } from "./parsePlannerForm.ts";

/** A labelled example evening. It is input for the scheduler, not a canned result. */
export const SAMPLE_DAY = {
  label: "Load a sample day",
  description: "An example evening with one dinner, five tasks, and a 20-minute buffer. Nothing is scheduled until you generate a plan.",
  settings: {
    planningStartMinute: 17 * 60,
    planningEndMinute: 22 * 60,
    breakFrequencyMinutes: 60,
    breakDurationMinutes: 10,
    endOfDayBufferMinutes: 20,
  } satisfies PlannerSettings,
  tasks: [
    {
      id: "sample-draft",
      title: "Draft the evening note",
      durationMinutes: 50,
      priority: "high",
      deadlineMinute: 18 * 60 + 30,
      preferredWindow: { startMinute: 17 * 60, endMinute: 18 * 60 + 30 },
      energy: "high",
      completed: false,
    },
    {
      id: "sample-call",
      title: "Call home",
      durationMinutes: 25,
      priority: "high",
      deadlineMinute: 21 * 60,
      energy: "medium",
      completed: false,
    },
    {
      id: "sample-read",
      title: "Read a chapter",
      durationMinutes: 45,
      priority: "medium",
      preferredWindow: { startMinute: 20 * 60, endMinute: 21 * 60 + 40 },
      energy: "low",
      completed: false,
    },
    {
      id: "sample-pack",
      title: "Pack for tomorrow",
      durationMinutes: 20,
      priority: "low",
      energy: "low",
      completed: false,
    },
    {
      id: "sample-outline",
      title: "Rewrite the whole outline",
      durationMinutes: 180,
      priority: "medium",
      energy: "medium",
      completed: false,
    },
  ] satisfies Task[],
  commitments: [
    {
      id: "sample-dinner",
      title: "Dinner",
      startMinute: 19 * 60,
      endMinute: 19 * 60 + 40,
    },
  ] satisfies FixedCommitment[],
};

export function sampleSettingsDraft(): SettingsDraft {
  const { settings } = SAMPLE_DAY;

  return {
    planningStart: formatClockInput(settings.planningStartMinute),
    planningEnd: formatClockInput(settings.planningEndMinute),
    endAtMidnight: false,
    breakFrequencyMinutes: String(settings.breakFrequencyMinutes),
    breakDurationMinutes: String(settings.breakDurationMinutes),
    endOfDayBufferMinutes: String(settings.endOfDayBufferMinutes),
    currentEnergy: "low",
  };
}
