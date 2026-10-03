import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, X } from "lucide-react";
import {
  commitmentToDraft,
  emptyCommitmentDraft,
  parseCommitmentDraft,
  type CommitmentDraft,
} from "../planner/parsePlannerForm.ts";
import type { FixedCommitment } from "../types/planner.ts";
import { formatMinuteRange } from "../utils/time.ts";
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
  const [issues, setIssues] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (editingId && !commitments.some((commitment) => commitment.id === editingId)) {
      setDraft(emptyCommitmentDraft());
      setEditingId(null);
      setIssues([]);
    }
  }, [commitments, editingId]);

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
    setIssues([]);
  }

  function edit(commitment: FixedCommitment) {
    setDraft(commitmentToDraft(commitment));
    setEditingId(commitment.id);
    setIssues([]);
    formRef.current?.scrollIntoView({ block: "nearest" });
  }

  function cancelEdit() {
    setDraft(emptyCommitmentDraft());
    setEditingId(null);
    setIssues([]);
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl text-ink">Fixed commitments</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Meetings and other immovable blocks. They are reserved before tasks and are not split.
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
        {editingId ? <p className="kicker text-accent">Editing this commitment</p> : null}
        {issues.length > 0 ? <IssueList issues={issues} /> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-line">
            <Plus className="size-4" aria-hidden="true" />
            {editingId ? "Save commitment" : "Add commitment"}
          </button>
          {editingId ? (
            <button type="button" className="btn btn-quiet" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {commitments.length === 0 ? (
        <p className="empty-note">No fixed commitments yet. Add a meeting or anything else that cannot move.</p>
      ) : (
        <ul className="space-y-3">
          {commitments.map((commitment) => (
            <li key={commitment.id} className="border-t border-line pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-pretty text-ink">{commitment.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatMinuteRange(commitment.startMinute, commitment.endMinute)}
                  </p>
                  {editingId === commitment.id ? <p className="mt-1 kicker text-accent">Editing</p> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="icon-btn" onClick={() => edit(commitment)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit
                  </button>
                  <button type="button" className="icon-btn" onClick={() => onRemove(commitment.id)}>
                    <X className="size-4" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
