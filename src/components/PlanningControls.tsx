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
    <fieldset className="space-y-6">
      <div>
        <legend className="font-serif text-2xl text-ink">Planning settings</legend>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Configure available hours, initial energy, and pacing for today&rsquo;s schedule.
        </p>
      </div>

      <div className="rounded-md border border-line bg-night/50 p-4 space-y-2">
        <ChoiceGroup
          legend="Current energy level"
          name="current-energy"
          value={draft.currentEnergy}
          options={ENERGIES}
          onChange={(currentEnergy) => onChange({ ...draft, currentEnergy })}
        />
        <p className="field-hint">
          How you feel at the start of the window. Shifts demanding tasks toward your highest-energy hours. This is a soft preference, not a hard constraint.
        </p>
      </div>

      <div className="space-y-4">
        <p className="kicker">Available window</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted cursor-pointer">
          <input
            className="check-input mt-0.5"
            type="checkbox"
            checked={draft.endAtMidnight}
            onChange={(event) => onChange({ ...draft, endAtMidnight: event.target.checked })}
          />
          <span>End at midnight (24:00). Keeps the window strictly on today.</span>
        </label>
      </div>

      <div className="space-y-4 border-t border-line/70 pt-4">
        <p className="kicker">Pacing &amp; buffer</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <NumberField
            label="Break every"
            unit="min"
            hint="Minutes of continuous work before a break."
            value={draft.breakFrequencyMinutes}
            min={1}
            onChange={(breakFrequencyMinutes) => onChange({ ...draft, breakFrequencyMinutes })}
          />
          <NumberField
            label="Break length"
            unit="min"
            hint="Break duration (0 for no breaks)."
            value={draft.breakDurationMinutes}
            min={0}
            onChange={(breakDurationMinutes) => onChange({ ...draft, breakDurationMinutes })}
          />
          <NumberField
            label="EOD buffer"
            unit="min"
            hint="Minutes kept free at window end."
            value={draft.endOfDayBufferMinutes}
            min={0}
            onChange={(endOfDayBufferMinutes) => onChange({ ...draft, endOfDayBufferMinutes })}
          />
        </div>
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  unit,
  hint,
  value,
  min,
  onChange,
}: {
  label: string;
  unit?: string;
  hint: string;
  value: string;
  min: number;
  onChange: (value: string) => void;
}) {
  const hintId = `${label.replace(/\s+/g, "-").toLowerCase()}-hint`;

  return (
    <label className="block">
      <span className="field-label">
        {label}
        {unit ? <span className="text-faint normal-case"> ({unit})</span> : null}
      </span>
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
      <span id={hintId} className="field-hint text-xs">
        {hint}
      </span>
    </label>
  );
}
