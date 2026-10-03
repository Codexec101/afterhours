import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Clock, Pencil, Plus, Trash2, X } from "lucide-react";
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

const ENERGY_BARS: Record<EnergyLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function TaskEntry({
  tasks,
  onAdd,
  onUpdate,
  onRemove,
  onToggleCompleted,
  editRequest,
}: {
  /** Set by the timeline to open a task in the existing edit form. */
  editRequest?: { id: string; nonce: number } | null;
  tasks: readonly Task[];
  onAdd: (fields: ParsedTaskFields) => void;
  onUpdate: (id: string, fields: ParsedTaskFields) => void;
  onRemove: (id: string) => void;
  onToggleCompleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && !tasks.some((task) => task.id === editingId)) {
      setDraft(emptyTaskDraft());
      setEditingId(null);
      setIsFormOpen(false);
      setIssues([]);
    }
  }, [editingId, tasks]);

  useEffect(() => {
    if (!editRequest) {
      return;
    }

    const task = tasks.find((candidate) => candidate.id === editRequest.id);

    if (task) {
      setDraft(taskToDraft(task));
      setEditingId(task.id);
      setIsFormOpen(true);
      setIssues([]);
      setTimeout(() => {
        formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        titleInputRef.current?.focus();
      }, 50);
    }
    // Only a new request (nonce) should open the form, not later task edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  function startAdd() {
    setDraft(emptyTaskDraft());
    setEditingId(null);
    setIsFormOpen(true);
    setIssues([]);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      titleInputRef.current?.focus();
    }, 50);
  }

  function edit(task: Task) {
    setDraft(taskToDraft(task));
    setEditingId(task.id);
    setIsFormOpen(true);
    setIssues([]);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      titleInputRef.current?.focus();
    }, 50);
  }

  function cancelEdit() {
    setDraft(emptyTaskDraft());
    setEditingId(null);
    setIsFormOpen(false);
    setIssues([]);
  }

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
    setIsFormOpen(false);
    setIssues([]);
  }

  const incompleteCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - incompleteCount;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-2xl text-ink">Flexible tasks</h2>
            <span className="rounded border border-line bg-night px-2.5 py-0.5 font-mono text-xs text-muted">
              {incompleteCount} to do{completedCount > 0 ? ` · ${completedCount} completed` : ""}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Work placed around your fixed schedule and energy. Click any task to edit or mark complete.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-line"
          onClick={() => (isFormOpen && !editingId ? cancelEdit() : startAdd())}
          aria-expanded={isFormOpen}
        >
          {isFormOpen && !editingId ? (
            <>
              <X className="size-4" aria-hidden="true" />
              Close form
            </>
          ) : (
            <>
              <Plus className="size-4 text-accent" aria-hidden="true" />
              Add task
            </>
          )}
        </button>
      </div>

      {isFormOpen ? (
        <form
          ref={formRef}
          className="scroll-mt-20 rounded-md border border-line/90 bg-night/70 p-5 space-y-4 shadow-sm"
          onSubmit={submit}
          noValidate
        >
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="font-serif text-lg font-medium text-ink">
              {editingId ? "Edit task" : "New flexible task"}
            </h3>
            <button
              type="button"
              className="icon-btn text-muted hover:text-ink"
              onClick={cancelEdit}
              aria-label="Cancel editing"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <label className="block">
            <span className="field-label">Title</span>
            <input
              ref={titleInputRef}
              className="field-input"
              type="text"
              placeholder="e.g. Write design spec"
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
              placeholder="45"
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

          <div>
            <ChoiceGroup
              legend="Energy requirement"
              name="task-energy"
              value={draft.energy}
              options={ENERGIES}
              onChange={(energy) => setDraft({ ...draft, energy })}
            />
            <p className="field-hint">
              Tasks needing high energy fit best when your energy is high. It is a soft preference, not a hard limit.
            </p>
          </div>

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
            <p className="field-hint">Leave both blank to skip. The scheduler can place the task outside this window if needed.</p>
          </fieldset>

          <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed text-muted">
            <input
              className="check-input mt-0.5"
              type="checkbox"
              checked={draft.completed}
              onChange={(event) => setDraft({ ...draft, completed: event.target.checked })}
            />
            <span>Marked completed. Completed tasks are kept in your list but excluded from the scheduled timeline.</span>
          </label>

          {issues.length > 0 ? <IssueList issues={issues} /> : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className="btn btn-primary sm:w-auto">
              <Plus className="size-4" aria-hidden="true" />
              {editingId ? "Save task" : "Add task"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

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
    return (
      <div className="empty-note text-center py-8">
        <p className="text-base text-ink">No flexible tasks yet.</p>
        <p className="mt-1 text-sm text-faint">
          Click &ldquo;Add task&rdquo; above to add your first work item.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Flexible tasks list">
      {tasks.map((task) => {
        const isEditing = editingId === task.id;

        return (
          <li
            key={task.id}
            className={`group rounded-md border p-3.5 transition-colors sm:p-4 ${
              task.completed
                ? "border-line/50 bg-panel/30"
                : "border-line bg-panel hover:border-line/80"
            } ${isEditing ? "ring-1 ring-accent border-accent" : ""}`}
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <input
                className="check-input mt-1 cursor-pointer"
                type="checkbox"
                checked={task.completed}
                onChange={() => onToggleCompleted(task.id)}
                aria-label={`Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h4
                    className={`font-serif text-base font-medium leading-snug sm:text-lg ${
                      task.completed ? "text-faint line-through decoration-line" : "text-ink"
                    }`}
                  >
                    {task.title}
                  </h4>
                  {task.completed ? (
                    <span className="inline-flex items-center gap-1 rounded bg-line/40 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                      <Check className="size-3" aria-hidden="true" />
                      Done
                    </span>
                  ) : isEditing ? (
                    <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-wider text-accent font-medium">
                      Editing
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <Clock className="size-3 text-faint" aria-hidden="true" />
                    {formatDuration(task.durationMinutes)}
                  </span>

                  <span className="text-line">•</span>

                  <span
                    className={
                      task.priority === "high"
                        ? "text-accent font-medium uppercase tracking-wider font-mono"
                        : "uppercase tracking-wider font-mono text-muted"
                    }
                  >
                    {task.priority} priority
                  </span>

                  <span className="text-line">•</span>

                  <EnergyPill level={task.energy} />

                  {task.deadlineMinute !== undefined ? (
                    <>
                      <span className="text-line">•</span>
                      <span className="text-muted">
                        Due {formatMinute(task.deadlineMinute)}
                      </span>
                    </>
                  ) : null}

                  {task.preferredWindow ? (
                    <>
                      <span className="text-line">•</span>
                      <span className="text-muted">
                        Prefers {formatMinuteRange(task.preferredWindow.startMinute, task.preferredWindow.endMinute)}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="icon-btn text-muted hover:text-ink"
                  onClick={() => onEdit(task)}
                  aria-label={`Edit ${task.title}`}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  type="button"
                  className="icon-btn text-faint hover:text-red-400"
                  onClick={() => onRemove(task.id)}
                  aria-label={`Delete ${task.title}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EnergyPill({ level }: { level: EnergyLevel }) {
  const filled = ENERGY_BARS[level];

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`${capitalize(level)} energy requirement`}
    >
      <span className="inline-flex items-end gap-[2px] h-3" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`w-[2.5px] rounded-[0.5px] ${
              bar <= filled ? "bg-accent" : "bg-line"
            }`}
            style={{ height: `${bar * 3.5}px` }}
          />
        ))}
      </span>
      <span className="capitalize">{level} energy</span>
    </span>
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
