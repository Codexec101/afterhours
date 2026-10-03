import { describe, expect, it } from "vitest";
import { toDateKey } from "../utils/dateKey.ts";
import { DESK_STORAGE_KEY, DESK_VERSION, readDesk, writeDesk, type DeskSnapshot } from "./deskStorage.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  const failure = () => {
    throw new Error("storage blocked");
  };

  return {
    get length() {
      return 0;
    },
    clear: failure,
    getItem: failure,
    key: failure,
    removeItem: failure,
    setItem: failure,
  };
}

const october3 = new Date(2026, 9, 3, 18, 0);
const october2 = new Date(2026, 9, 2, 18, 0);

const desk: DeskSnapshot = {
  settings: {
    planningStart: "17:00",
    planningEnd: "22:00",
    endAtMidnight: false,
    breakFrequencyMinutes: "60",
    breakDurationMinutes: "10",
    endOfDayBufferMinutes: "20",
    currentEnergy: "high",
  },
  tasks: [
    {
      id: "note",
      title: "Draft the note",
      durationMinutes: 50,
      priority: "high",
      energy: "high",
      completed: true,
    },
  ],
  commitments: [{ id: "dinner", title: "Dinner", startMinute: 19 * 60, endMinute: 19 * 60 + 40 }],
  planInputs: null,
};

describe("desk storage", () => {
  it("fills current energy from the clock for days saved before the field existed", () => {
    const storage = memoryStorage();
    const { currentEnergy: _omitted, ...oldSettings } = desk.settings;

    storage.setItem(
      DESK_STORAGE_KEY,
      JSON.stringify({
        version: DESK_VERSION,
        days: { "2026-10-03": { dateKey: "2026-10-03", ...desk, settings: oldSettings } },
      }),
    );

    expect(readDesk(storage, october3)).toMatchObject({
      status: "ready",
      desk: { settings: { planningStart: "17:00", currentEnergy: "low" } },
    });
  });

  it("round-trips one local day under the date key", () => {
    const storage = memoryStorage();

    expect(writeDesk(storage, october3, desk)).toBe("saved");

    const saved = JSON.parse(storage.getItem(DESK_STORAGE_KEY) ?? "");
    expect(saved.version).toBe(DESK_VERSION);
    expect(saved.days[toDateKey(october3)].dateKey).toBe("2026-10-03");
    expect(readDesk(storage, october3)).toEqual({
      status: "ready",
      carriedSettings: false,
      desk,
    });
  });

  it("keeps other days when a new day is saved", () => {
    const storage = memoryStorage();
    const earlier: DeskSnapshot = {
      ...desk,
      tasks: [{ ...desk.tasks[0], id: "yesterday", completed: false }],
    };

    writeDesk(storage, october2, earlier);
    writeDesk(storage, october3, desk);

    expect(readDesk(storage, october2)).toMatchObject({ status: "ready", desk: earlier });
    expect(readDesk(storage, october3)).toMatchObject({ status: "ready", desk });
  });

  it("carries settings onto a new day and leaves that day's tasks empty", () => {
    const storage = memoryStorage();
    writeDesk(storage, october2, desk);

    expect(readDesk(storage, october3)).toEqual({
      status: "ready",
      carriedSettings: true,
      desk: {
        settings: desk.settings,
        tasks: [],
        commitments: [],
        planInputs: null,
      },
    });
  });

  it("restores an unversioned desk for the requested day", () => {
    const storage = memoryStorage();
    storage.setItem(DESK_STORAGE_KEY, JSON.stringify(desk));

    expect(readDesk(storage, october3)).toEqual({
      status: "ready",
      carriedSettings: false,
      desk,
    });
  });

  it("drops a malformed task and keeps the rest of the day", () => {
    const storage = memoryStorage();
    writeDesk(storage, october3, desk);
    const saved = JSON.parse(storage.getItem(DESK_STORAGE_KEY) ?? "");
    saved.days["2026-10-03"].tasks.push({ id: "broken" });
    storage.setItem(DESK_STORAGE_KEY, JSON.stringify(saved));

    expect(readDesk(storage, october3)).toMatchObject({
      status: "ready",
      desk: { tasks: desk.tasks },
    });
  });

  it("reports missing, malformed, and newer documents without throwing", () => {
    const empty = memoryStorage();
    expect(readDesk(empty, october3)).toEqual({ status: "empty" });

    const corrupt = memoryStorage();
    corrupt.setItem(DESK_STORAGE_KEY, "{");
    expect(readDesk(corrupt, october3)).toEqual({ status: "malformed" });

    const newer = memoryStorage();
    newer.setItem(DESK_STORAGE_KEY, JSON.stringify({ version: DESK_VERSION + 1, secret: "keep" }));
    expect(readDesk(newer, october3)).toEqual({ status: "newer" });
  });

  it("does not replace a newer document or a store that cannot be read", () => {
    const newer = memoryStorage();
    const original = JSON.stringify({ version: 4, days: { "2026-10-03": { keep: true } } });
    newer.setItem(DESK_STORAGE_KEY, original);

    expect(writeDesk(newer, october3, desk)).toBe("newer");
    expect(newer.getItem(DESK_STORAGE_KEY)).toBe(original);

    const blocked = throwingStorage();
    expect(readDesk(blocked, october3)).toEqual({ status: "unavailable" });
    expect(writeDesk(blocked, october3, desk)).toBe("failed");
  });

  it("leaves unrecognized day keys in place", () => {
    const storage = memoryStorage();
    storage.setItem(
      DESK_STORAGE_KEY,
      JSON.stringify({
        version: DESK_VERSION,
        days: {
          "10/02/2026": { note: "not a date key" },
          "2026-10-03": {
            dateKey: "2026-10-03",
            ...desk,
          },
        },
      }),
    );

    writeDesk(storage, october3, {
      ...desk,
      tasks: [],
    });

    const saved = JSON.parse(storage.getItem(DESK_STORAGE_KEY) ?? "");
    expect(saved.days["10/02/2026"]).toEqual({ note: "not a date key" });
    expect(saved.days["2026-10-03"].tasks).toEqual([]);
  });
});
