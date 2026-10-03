import { format } from "date-fns";
import { SlidersHorizontal } from "lucide-react";
import { toDateKey } from "../utils/dateKey.ts";

/** Compact sticky bar. Every link is an in-page anchor to a real section. */
export function TopNav({ now }: { now: Date }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-night/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-5 sm:gap-8">
          <a href="#overview" className="flex items-center gap-2 font-serif text-xl tracking-tight text-ink">
            <span className="size-2 rounded-[1px] bg-accent" aria-hidden="true" />
            Afterhours
          </a>
          <nav aria-label="Sections" className="flex items-center gap-1 text-sm">
            <a href="#overview" className="nav-link">
              Overview
            </a>
            <a href="#planner" className="nav-link">
              Planner
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <time dateTime={toDateKey(now)} className="kicker whitespace-nowrap">
            <span className="sm:hidden">{format(now, "EEE, MMM d")}</span>
            <span className="hidden sm:inline">{format(now, "EEEE, MMMM d")}</span>
          </time>
          <a href="#settings" className="nav-action" aria-label="Planning settings">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Planning settings</span>
          </a>
        </div>
      </div>
    </header>
  );
}
