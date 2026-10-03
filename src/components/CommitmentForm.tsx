import { useEffect, useRef, useState, type FormEvent } from "react";
import { Clock, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  commitmentToDraft,
  emptyCommitmentDraft,
  parseCommitmentDraft,
  type CommitmentDraft,
} from "../planner/parsePlannerForm.ts";
import type { FixedCommitment } from "../types/planner.ts";
import { formatDuration, formatMinuteRange } from "../utils/time.ts";
import { IssueList } from "./TaskEntry.tsx";

export function CommitmentForm({
  commitments,
  onAdd,
  onUpdate,
  onRemove,
}: {
  commitments: readonly FixedCommitment[];
  onAdd: (value: { title: string; startMinute: number; endMinute: number }) => void;
  onUpdate: (id: string, value: { title: string; startMinute: number; endMinute: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState<CommitmentDraft>(emptyCommitmentDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && !commitments.some((commitment) => commitment.id === editingId)) {
      setDraft(emptyCommitmentDraft());
      setEditingId(null);
      setIsFormOpen(false);
      setIssues([]);
    }
  }, [commitments, editingId]);

  function startAdd() {
    setDraft(emptyCommitmentDraft());
    setEditingId(null);
    setIsFormOpen(true);
    setIssues([]);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      titleInputRef.current?.focus();
    }, 50);
  }

  function edit(commitment: FixedCommitment) {
    setDraft(commitmentToDraft(commitment));
    setEditingId(commitment.id);
    setIsFormOpen(true);
    setIssues([]);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      titleInputRef.current?.focus();
    }, 50);
  }

  function cancelEdit() {
    setDraft(emptyCommitmentDraft());
    setEditingId(null);
    setIsFormOpen(false);
    setIssues([]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCommitmentDraft(draft);

    if (!parsed.ok) {
      setIssues(parsed.issues);
      return;
    }

    if (editingId) {
      onUpdate(editingId, parsed.value);
    } else {
      onAdd(parsed.value);
    }

    setDraft(emptyCommitmentDraft());
    setEditingId(null);
    setIsFormOpen(false);
    setIssues([]);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-2xl text-ink">Fixed commitments</h2>
            <span className="rounded border border-line bg-night px-2.5 py-0.5 font-mono text-xs text-muted">
              {commitments.length} fixed
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Immovable blocks reserved before flexible tasks. The scheduler never splits or moves them.
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
              <Plus className="size-4 text-commitment" aria-hidden="true" />
              Add commitment
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
              {editingId ? "Edit fixed commitment" : "New fixed commitment"}
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
              placeholder="e.g. Team standup, Dinner"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              autoComplete="off"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Starts</span>
              <input
                className="field-input"
                type="time"
                value={draft.start}
                onChange={(event) => setDraft({ ...draft, start: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="field-label">Ends</span>
              <input
                className="field-input"
                type="time"
                value={draft.end}
                onChange={(event) => setDraft({ ...draft, end: event.target.value })}
              />
            </label>
          </div>

          {issues.length > 0 ? <IssueList issues={issues} /> : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className="btn btn-primary sm:w-auto">
              <Plus className="size-4" aria-hidden="true" />
              {editingId ? "Save commitment" : "Add commitment"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {commitments.length === 0 ? (
        <div className="empty-note text-center py-8">
          <p className="text-base text-ink">No fixed commitments yet.</p>
          <p className="mt-1 text-sm text-faint">
            Add meetings, dinners, or any other appointments that cannot move.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Fixed commitments list">
          {commitments.map((commitment) => {
            const isEditing = editingId === commitment.id;
            const duration = commitment.endMinute - commitment.startMinute;

            return (
              <li
                key={commitment.id}
                className={`group rounded-md border border-line border-l-4 border-l-commitment bg-panel p-3.5 transition-colors sm:p-4 hover:border-line/80 ${
                  isEditing ? "ring-1 ring-commitment" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h4 className="font-serif text-base font-medium leading-snug text-ink sm:text-lg">
                        {commitment.title}
                      </h4>
                      <span className="inline-flex items-center gap-1 rounded bg-commitment/15 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-wider text-commitment font-medium">
                        <Lock className="size-2.5" aria-hidden="true" />
                        Fixed · Immovable
                      </span>
                      {isEditing ? (
                        <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-wider text-accent font-medium">
                          Editing
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="font-mono text-ink">
                        {formatMinuteRange(commitment.startMinute, commitment.endMinute)}
                      </span>
                      <span className="text-line">•</span>
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Clock className="size-3 text-faint" aria-hidden="true" />
                        {formatDuration(duration)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      className="icon-btn text-muted hover:text-ink"
                      onClick={() => edit(commitment)}
                      aria-label={`Edit commitment "${commitment.title}"`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn text-faint hover:text-red-400"
                      onClick={() => onRemove(commitment.id)}
                      aria-label={`Delete commitment "${commitment.title}"`}
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
      )}
    </section>
  );
}
