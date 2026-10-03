import { format } from "date-fns";
import { toDateKey } from "../utils/dateKey.ts";

export function PlanningHeader({ now }: { now: Date }) {
  return (
    <header className="border-b border-line pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-serif text-2xl tracking-tight text-ink">Afterhours</p>
        <time dateTime={toDateKey(now)} className="kicker">
          {format(now, "EEEE, MMMM d")}
        </time>
      </div>
      <h1 className="mt-6 max-w-3xl font-serif text-3xl leading-tight font-medium tracking-tight text-ink sm:mt-8 sm:text-5xl">
        {planningPrompt(now)}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        One local day. Fixed commitments stay where they are. Flexible tasks fill the time that remains.
      </p>
    </header>
  );
}

function planningPrompt(now: Date): string {
  const hour = now.getHours();

  if (hour < 5) {
    return "The day is still quiet.";
  }

  if (hour < 12) {
    return "Good morning. The day is open.";
  }

  if (hour < 17) {
    return "Good afternoon. Shape what is left.";
  }

  return "Good evening. Plan the hours still ahead.";
}
