export function EmptyPlan({ taskCount, commitmentCount }: { taskCount: number; commitmentCount: number }) {
  const hasInputs = taskCount > 0 || commitmentCount > 0;

  return (
    <section className="panel px-5 py-8 sm:px-10 sm:py-10">
      <p className="kicker">Today</p>
      {hasInputs ? (
        <>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-ink sm:text-4xl">Ready to place the day.</h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            The desk has {countLabel(taskCount, "flexible task")} and {countLabel(commitmentCount, "fixed commitment")}.
            Generate a plan when you want them placed.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-ink sm:text-4xl">Nothing is on the day yet.</h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            Set the hours you can use, add what must happen, then add what could happen. The plan appears here after you generate it.
          </p>
          <ol className="mt-8 space-y-4 text-sm leading-relaxed text-muted">
            <li>
              <span className="mr-3 font-serif text-accent">01</span>
              Choose the window, breaks, and the quiet buffer at the end.
            </li>
            <li>
              <span className="mr-3 font-serif text-accent">02</span>
              Add fixed commitments separately from flexible tasks.
            </li>
            <li>
              <span className="mr-3 font-serif text-accent">03</span>
              Generate a plan, or load the sample evening to see a worked day.
            </li>
          </ol>
        </>
      )}
    </section>
  );
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
