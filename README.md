# Afterhours

Afterhours is a planner for the rest of one local day. You give it tasks and fixed commitments. It builds a timeline that respects deadlines, commitments, breaks, and an end-of-day buffer, shows how the time adds up, and says plainly which tasks did not fit and why.

## The problem

Most to-do lists ignore the clock. A list of tasks says nothing about whether they fit around dinner, whether a 90-minute task has a 90-minute gap, or whether you have energy for it at 9 PM. Afterhours treats the day as a set of real time slots and checks every task against them.

## Features

- Add, edit, and delete flexible tasks: title, duration, priority, optional deadline, optional preferred window, and an energy requirement (Low, Medium, High).
- Add, edit, and delete fixed commitments with a start and an end.
- Set the planning window, break frequency, break duration, and end-of-day buffer.
- Pick your **current energy** (Low, Medium, High) to shift which hours suit demanding tasks.
- Generate a timeline of tasks, commitments, breaks, the buffer, and open time.
- See deferred tasks with an honest reason for each.
- See time accounting for the window and a written explanation of the plan.
- Mark tasks complete from the task list or the timeline. Completed tasks are left out of the plan, and the plan regenerates.
- A plan that no longer matches the inputs is flagged as out of date.
- Everything is saved in your browser's LocalStorage and restored on reload.
- A sample day can be loaded to try the app. Nothing is scheduled until you press generate.

### Screenshots

Add screenshots here before publishing, for example under `docs/screenshots/`:

<!--
![Planner with a generated plan](docs/screenshots/plan-desktop.png)
![Narrow-screen layout](docs/screenshots/plan-mobile.png)
-->

## Tech stack

React 19, Vite, TypeScript, Tailwind CSS 4, Lucide React, date-fns, and Vitest. There is no backend, database, or authentication. Page fonts (Newsreader and Outfit) load from Google Fonts, so they need a network connection to display as designed.

## Setup

Requires Node.js 20.19 or newer (a Vite 7 requirement).

```bash
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Type-check with `tsc -b`, then build into `dist/` |
| `npm run preview` | Serve the production build locally |

## How scheduling works

The scheduler in `src/engine` is deterministic: the same inputs give the same plan. All times are whole minutes from local midnight, within a single day. A task at minute 540 for 30 minutes occupies `[540, 570)`.

1. **Validate.** Input is rejected with a message if the window is overnight or empty, a duration is not a positive whole number, commitments overlap each other, a commitment overlaps the reserved buffer, or the buffer is not shorter than the window.
2. **Reserve time.** Fixed commitments and the end-of-day buffer are removed from the window first. What remains is a set of free gaps. Completed tasks are skipped.
3. **Place deadline tasks** in order of earliest deadline. For each one, every feasible start minute is considered. The task keeps its best slot unless a different legal slot lets more of the remaining tasks still find a contiguous gap. Ties go to the higher placement score, then the earlier start.
4. **Place flexible tasks.** Repeatedly, the scheduler scores every feasible (task, start minute) pair and takes the best one, then removes that time from the gaps. Ties go to the earlier start, then longer duration, then task id.
5. **Replay.** The scheduler tries swapping adjacent tasks in the placement order and moving a deferred task earlier. It keeps a change only if it meets more deadlines, then scores higher, then schedules more tasks. This runs for at most 12 rounds.

### Placement score

Each feasible start minute is scored from three parts:

| Part | Value |
|---|---|
| Priority | low 0, medium 5, high 10 |
| Preferred window | 0, 2, or 4 (outside, partial overlap, fully inside) |
| Energy match | 0, 1, or 2 (opposite, adjacent, same level) |

A preferred window and an energy match together add at most 6 points. That can outweigh one priority step (5) but never two (10). Preferred windows and energy are soft: they change where a task goes, never whether it is allowed.

### Energy

The default curve is high before noon, medium from noon to 5 PM, and low after 5 PM. Your current energy shifts the whole curve by the gap between it and the curve at the start of the window, limited to Low through High. If it matches the curve, nothing shifts. Energy never overrides a deadline, commitment, break, buffer, or duration.

### Deadlines

A deadline is the latest finish time. A task must end at or before it, and this is a hard rule. If no gap lets a task finish in time, it is deferred as `deadline_unmet`. If a required break is the only thing in the way, it is deferred as `break_blocks_deadline`.

### Fixed commitments

Commitments are never moved. Tasks are placed only in the gaps between them. A commitment that only partly overlaps the planning window is clipped to the window. One entirely outside the window is ignored. A commitment that overlaps the buffer is rejected.

### Breaks

A break is inserted when adding a task would push cumulative work since the last break past the break frequency. The break is placed before that task and resets the count. Fixed commitments do not reset the count. A break duration of 0 turns breaks off. A task longer than the break frequency still stays in one block. A task that cannot fit together with its required break is deferred as `break_does_not_fit`.

### Buffer

The last minutes of the window (the end-of-day buffer) are kept free of tasks, commitments, and breaks. They appear in the timeline as a buffer row.

### Time accounting

Window length equals scheduled work, plus breaks, plus commitments, plus buffer, plus unused time. This identity is checked by the engine's tests.

## Known limitations

- **Not globally optimal.** The scheduler is a greedy heuristic with a short local replay. It does not search every possible packing, so a better schedule can exist. When counting whether other tasks still have a gap, it can overestimate, because those tasks may all need the same interval.
- One day only. Overnight windows are rejected.
- Tasks stay whole and are never split across gaps.
- No drag-and-drop, recurring tasks, calendar import, accounts, or sync across devices. Data lives only in one browser profile.
- Current energy is not recalculated when you change the start time, and it carries over to the next day with the other settings.
- Marking a task complete removes it from the plan immediately.
- Saved data written by a newer version of the app is left untouched, and the session will not overwrite it.

## Testing

`npm test` runs unit tests for the scheduling engine, validation, scoring, time formatting, form parsing, the timeline builder, plan explanations, the sample day, and LocalStorage persistence. There are no automated browser or component tests. Interface behaviour (forms, editing, layout on narrow screens) has to be checked by hand.

## Deploying to Vercel

The app is a static single-page build.

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, choose **Add New, Project** and import the repository.
3. Confirm the settings. Vercel normally detects them:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. No environment variables are needed.
5. Deploy.

Or use the CLI from the project folder:

```bash
npx vercel          # preview deployment
npx vercel --prod   # production deployment
```

`vercel.json` rewrites every path to `index.html`, so reloading any URL works. Assets are served from absolute `/assets/` paths, which is correct when the app is hosted at the root of a domain. If you host it under a sub-path, set `base` in `vite.config.ts`.
