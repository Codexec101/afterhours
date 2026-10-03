import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, X } from "lucide-react";
import {
  emptyTaskDraft,
  parseTaskDraft,
  taskToDraft,
  type ParsedTaskFields,
  type TaskDraft,
} from "../planner/parsePlannerForm.ts";
import type { EnergyLevel, Priority, Task } from "../types/planner.ts";
import { formatDuration, formatMinute, formatMinuteRange } from "../utils/time.ts";
import { ChoiceGroup } from "./ChoiceGroup.tsx";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const ENERGIES: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function TaskEntry({
  tasks,
  onAdd,
  onUpdate,
  onRemove,
  onToggleCompleted,
}: {
  tasks: readonly Task[];
  onAdd: (fields: ParsedTaskFields) => void;
  onUpdate: (id: string, fields: ParsedTaskFields) => void;
  onRemove: (id: string) => void;
  onToggleCompleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (editingId && !tasks.some((task) => task.id === editingId)) {
      setDraft(emptyTaskDraft());
      setEditingId(null);
      setIssues([]);
    }
  }, [editingId, tasks]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseTaskDraft(draft);

    if (!parsed.ok) {
      setIssues(parsed.issues);
      return;
    }

    if (editingId) {
      onUpdate(editingId, parsed.value);
    } else {
      onAdd(parsed.value);
    }

    setDraft(emptyTaskDraft());
    setEditingId(null);
    setIssues([]);
  }

  function edit(task: Task) {
    setDraft(taskToDraft(task));
    setEditingId(task.id);
    setIssues([]);
    formRef.current?.scrollIntoView({ block: "nearest" });
  }

  function cancelEdit() {
    setDraft(emptyTaskDraft());
    setEditingId(null);
    setIssues([]);
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl text-ink">Flexible tasks</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A task stays in one block. Deadline and preferred window are optional. Energy and the window are preferences, not hard limits.
        </p>
      </div>
      <form ref={formRef} className="scroll-mt-6 space-y-4" onSubmit={submit} noValidate>
        <label className="block">
          <span className="field-label">Title</span>
          <input
            className="field-input"
            type="text"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="field-label">Duration in minutes</span>
          <input
            className="field-input"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft.durationMinutes}
            onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })}
          />
        </label>
        <ChoiceGroup
          legend="Priority"
          name="task-priority"
          value={draft.priority}
          options={PRIORITIES}
          onChange={(priority) => setDraft({ ...draft, priority })}
        />
        <ChoiceGroup
          legend="Energy"
          name="task-energy"
          value={draft.energy}
          options={ENERGIES}
          onChange={(energy) => setDraft({ ...draft, energy })}
        />
        <label className="block">
          <span className="field-label">Deadline, optional</span>
          <input
            className="field-input"
            type="time"
            value={draft.deadline}
            onChange={(event) => setDraft({ ...draft, deadline: event.target.value })}
          />
          <span className="field-hint">The task must finish at or before this time. Leave blank for no deadline.</span>
        </label>
        <fieldset className="space-y-3">
          <legend className="field-label">Preferred window, optional</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">From</span>
              <input
                className="field-input"
                type="time"
                value={draft.preferredStart}
                onChange={(event) => setDraft({ ...draft, preferredStart: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="field-label">Until</span>
              <input
                className="field-input"
                type="time"
                value={draft.preferredEnd}
                onChange={(event) => setDraft({ ...draft, preferredEnd: event.target.value })}
              />
            </label>
          </div>
          <p className="field-hint">Leave both blank to skip. The scheduler can still place the task outside this window.</p>
        </fieldset>
        {editingId ? <p className="kicker text-accent">Editing this task</p> : null}
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed text-muted">
          <input
            className="check-input mt-0.5"
            type="checkbox"
            checked={draft.completed}
            onChange={(event) => setDraft({ ...draft, completed: event.target.checked })}
          />
          <span>Completed. The scheduler leaves completed tasks out of the plan.</span>
        </label>
        {issues.length > 0 ? <IssueList issues={issues} /> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-line">
            <Plus className="size-4" aria-hidden="true" />
            {editingId ? "Save task" : "Add task"}
          </button>
          {editingId ? (
            <button type="button" className="btn btn-quiet" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      <TaskList
        tasks={tasks}
        editingId={editingId}
        onEdit={edit}
        onRemove={onRemove}
        onToggleCompleted={onToggleCompleted}
      />
    </section>
  );
}

function TaskList({
  tasks,
  editingId,
  onEdit,
  onRemove,
  onToggleCompleted,
}: {
  tasks: readonly Task[];
  editingId: string | null;
  onEdit: (task: Task) => void;
  onRemove: (id: string) => void;
  onToggleCompleted: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return <p className="empty-note">No flexible tasks yet. Add one above. It will stay in a single block.</p>;
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => (
        <li key={task.id} className="border-t border-line pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className={`text-pretty ${task.completed ? "text-faint line-through decoration-line" : "text-ink"}`}>
                {task.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {formatDuration(task.durationMinutes)} · {task.priority} priority · {task.energy} energy
                {task.deadlineMinute !== undefined ? ` · due ${formatMinute(task.deadlineMinute)}` : ""}
                {task.preferredWindow
                  ? ` · prefers ${formatMinuteRange(task.preferredWindow.startMinute, task.preferredWindow.endMinute)}`
                  : ""}
              </p>
              {task.completed ? <p className="mt-1 kicker">Done</p> : null}
              {editingId === task.id ? <p className="mt-1 kicker text-accent">Editing</p> : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <button type="button" className="icon-btn" onClick={() => onEdit(task)}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </button>
              <button type="button" className="icon-btn" onClick={() => onRemove(task.id)}>
                <X className="size-4" aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
          <label className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm text-muted">
            <input className="check-input" type="checkbox" checked={task.completed} onChange={() => onToggleCompleted(task.id)} />
            {task.completed ? "Completed" : "Mark complete"}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function IssueList({ issues }: { issues: readonly string[] }) {
  return (
    <ul className="space-y-1 text-sm text-accent" role="alert">
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}
