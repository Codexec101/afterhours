import type { SettingsDraft } from "../planner/parsePlannerForm.ts";
import type { EnergyLevel } from "../types/planner.ts";
import { ChoiceGroup } from "./ChoiceGroup.tsx";

const ENERGIES: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function PlanningControls({
  draft,
  onChange,
}: {
  draft: SettingsDraft;
  onChange: (draft: SettingsDraft) => void;
}) {
  return (
    <fieldset className="space-y-5">
      <legend className="font-serif text-2xl text-ink">Available time</legend>
      <p className="text-sm leading-relaxed text-muted">
        The window stays on this local day. Overnight ranges are not scheduled. The buffer stays empty at the end of the window.
      </p>
      <div>
        <ChoiceGroup
          legend="Current energy"
          name="current-energy"
          value={draft.currentEnergy}
          options={ENERGIES}
          onChange={(currentEnergy) => onChange({ ...draft, currentEnergy })}
        />
        <p className="field-hint">
          How you feel at the start of the window. It shifts which hours suit demanding tasks. It is a preference, never a hard limit.
        </p>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Available from</span>
          <input
            className="field-input"
            type="time"
            value={draft.planningStart}
            onChange={(event) => onChange({ ...draft, planningStart: event.target.value })}
            required
          />
        </label>
        <div className="block">
          <label className="block">
            <span className="field-label">Available until</span>
            <input
              className="field-input disabled:opacity-50"
              type="time"
              value={draft.endAtMidnight ? "00:00" : draft.planningEnd}
              disabled={draft.endAtMidnight}
              onChange={(event) => onChange({ ...draft, planningEnd: event.target.value, endAtMidnight: false })}
              required={!draft.endAtMidnight}
            />
          </label>
          <label className="mt-3 flex min-h-11 items-start gap-3 text-sm leading-relaxed text-muted">
            <input
              className="check-input mt-0.5"
              type="checkbox"
              checked={draft.endAtMidnight}
              onChange={(event) => onChange({ ...draft, endAtMidnight: event.target.checked })}
            />
            <span>End at midnight. The window stays on this same day and closes at the end of today.</span>
          </label>
        </div>
        <NumberField
          label="Break frequency"
          hint="Minutes of work before a break is required."
          value={draft.breakFrequencyMinutes}
          min={1}
          onChange={(breakFrequencyMinutes) => onChange({ ...draft, breakFrequencyMinutes })}
        />
        <NumberField
          label="Break duration"
          hint="Use 0 to schedule without breaks."
          value={draft.breakDurationMinutes}
          min={0}
          onChange={(breakDurationMinutes) => onChange({ ...draft, breakDurationMinutes })}
        />
        <NumberField
          label="End-of-day buffer"
          hint="Minutes kept free at the end of the window."
          value={draft.endOfDayBufferMinutes}
          min={0}
          onChange={(endOfDayBufferMinutes) => onChange({ ...draft, endOfDayBufferMinutes })}
        />
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  min: number;
  onChange: (value: string) => void;
}) {
  const hintId = `${label.replace(/\s+/g, "-").toLowerCase()}-hint`;

  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type="number"
        inputMode="numeric"
        min={min}
        step={1}
        value={value}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={hintId} className="field-hint">
        {hint}
      </span>
    </label>
  );
}
