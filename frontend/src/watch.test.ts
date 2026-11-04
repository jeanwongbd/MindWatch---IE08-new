import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWatchService, daysFromReplies, readingsByDay } from "./watch";

// The shape the plugin really returned on a phone and on the emulator: one block per day, "values" empty on a
// day with nothing, and the dates as plain numbers.
const block = (date: [number, number, number], values: unknown[]) => {
  const start = new Date(date[0], date[1] - 1, date[2]).getTime() / 1000; // the phone's own midnight
  return { additionalData: "", block: 0, endDate: start + 86400, recordMetadataList: [], startDate: start, values };
};
const reply = (...blocks: ReturnType<typeof block>[]) => JSON.stringify({ resultDataPoints: [], results: blocks });

describe("reading the plugin's replies", () => {
  it("a week with nothing recorded gives no days, even though every block has dates", () => {
    const empty = reply(block([2026, 11, 1], []), block([2026, 11, 2], []), block([2026, 11, 3], []));
    expect(daysFromReplies({ steps: empty, sleep: empty, heart: empty })).toEqual([]);
  });

  it("puts each reading on the phone's own date", () => {
    const steps = reply(block([2026, 10, 31], [8]), block([2026, 11, 1], [357]), block([2026, 11, 2], []));
    expect([...readingsByDay(steps)]).toEqual([
      ["2026-10-31", 8],
      ["2026-11-01", 357],
    ]);
  });

  it("builds one day from steps, sleep and heart rate, with whole numbers and one decimal for heart rate", () => {
    const days = daysFromReplies({
      steps: reply(block([2026, 11, 3], [8356.6])),
      sleep: reply(block([2026, 11, 3], [435])),
      heart: reply(block([2026, 11, 3], [68.46])),
    });
    expect(days).toEqual([{ date: "2026-11-03", steps: 8357, sleep_minutes: 435, heart_rate_avg: 68.5 }]);
  });

  it("anything missing stays empty (null), never zero", () => {
    const days = daysFromReplies({
      steps: reply(block([2026, 11, 3], [300]), block([2026, 11, 2], [0])), // zero steps is "not recorded"
      sleep: reply(block([2026, 11, 3], [])),
      heart: undefined,
    });
    expect(days).toEqual([{ date: "2026-11-03", steps: 300, sleep_minutes: null, heart_rate_avg: null }]);
  });

  it("lists the days oldest first, and a day only needs one of the three", () => {
    const days = daysFromReplies({
      steps: reply(block([2026, 11, 3], [10])),
      sleep: reply(block([2026, 11, 1], [400])),
      heart: reply(block([2026, 11, 2], [70])),
    });
    expect(days.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("copes with replies it does not understand", () => {
    for (const bad of [undefined, "", "not json", "{}", '{"results":"oops"}', "[1,2,3]", '{"results":[null,{"startDate":"x"}]}']) {
      expect(daysFromReplies({ steps: bad, sleep: bad, heart: bad })).toEqual([]);
    }
  });
});

// --- the service, with a stand-in for the plugin ------------------------------------------------------------

const plugin = {
  requestHealthPermissions: vi.fn(),
  getData: vi.fn(),
};

const answer = (variable: string) => {
  if (variable === "STEPS") return reply(block([2026, 11, 3], [8357]));
  if (variable === "SLEEP") return reply(block([2026, 11, 3], [435]));
  return reply(block([2026, 11, 3], [68]));
};

beforeEach(() => {
  localStorage.clear();
  (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
  plugin.requestHealthPermissions.mockResolvedValue(undefined);
  plugin.getData.mockImplementation(async ({ parameters }: { parameters: string }) => ({
    results: answer(JSON.parse(parameters).Variable),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe("the watch service", () => {
  it("asks for permission before reading anything, and for steps, sleep and heart rate only", async () => {
    const order: string[] = [];
    plugin.requestHealthPermissions.mockImplementation(async () => void order.push("permission"));
    plugin.getData.mockImplementation(async ({ parameters }: { parameters: string }) => {
      order.push(JSON.parse(parameters).Variable);
      return { results: answer(JSON.parse(parameters).Variable) };
    });
    await createWatchService(plugin as never).read();
    expect(order[0]).toBe("permission");
    expect(order.slice(1).sort()).toEqual(["HEART_RATE", "SLEEP", "STEPS"]);
    const asked = JSON.parse(plugin.requestHealthPermissions.mock.calls[0][0].customPermissions);
    expect(asked).toEqual([
      { Variable: "STEPS", AccessType: "READ" },
      { Variable: "SLEEP", AccessType: "READ" },
      { Variable: "HEART_RATE", AccessType: "READ" },
    ]);
  });

  it("sums steps and sleep per day and averages heart rate, over the last week", async () => {
    const now = new Date(2026, 10, 4, 15, 30);
    await createWatchService(plugin as never).read(now);
    const queries = Object.fromEntries(
      plugin.getData.mock.calls.map((call) => {
        const p = JSON.parse((call[0] as { parameters: string }).parameters);
        return [p.Variable, p];
      }),
    );
    expect(queries.STEPS.OperationType).toBe("SUM");
    expect(queries.SLEEP.OperationType).toBe("SUM");
    expect(queries.HEART_RATE.OperationType).toBe("AVERAGE");
    for (const p of Object.values(queries) as { TimeUnit: string; StartDate: string; EndDate: string }[]) {
      expect(p.TimeUnit).toBe("DAY");
      expect(new Date(p.StartDate).getTime()).toBe(new Date(2026, 10, 4 - 7).getTime()); // midnight, 7 days back
      expect(new Date(p.EndDate).getTime()).toBe(new Date(2026, 10, 5).getTime()); // midnight tomorrow
      expect(p.StartDate).not.toMatch(/\.\d{3}Z$/); // no milliseconds
    }
  });

  it("returns the day it read", async () => {
    expect(await createWatchService(plugin as never).read()).toEqual([
      { date: "2026-11-03", steps: 8357, sleep_minutes: 435, heart_rate_avg: 68 },
    ]);
  });

  it("if any one read fails, nothing is returned, so a partial day can never replace a full one", async () => {
    plugin.getData.mockImplementation(async ({ parameters }: { parameters: string }) => {
      if (JSON.parse(parameters).Variable === "SLEEP") throw new Error("boom");
      return { results: answer(JSON.parse(parameters).Variable) };
    });
    await expect(createWatchService(plugin as never).read()).rejects.toThrow("boom");
  });

  it("a refused permission stops everything", async () => {
    plugin.requestHealthPermissions.mockRejectedValue(new Error("denied"));
    await expect(createWatchService(plugin as never).read()).rejects.toThrow("denied");
    expect(plugin.getData).not.toHaveBeenCalled();
  });

  it("gives up if Health Connect never answers", async () => {
    vi.useFakeTimers();
    plugin.getData.mockImplementation(() => new Promise(() => {}));
    const result = createWatchService(plugin as never).read();
    const settled = expect(result).rejects.toThrow("did not answer");
    await vi.advanceTimersByTimeAsync(31_000);
    await settled;
  });

  it("does nothing outside the Android app", async () => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
    await expect(createWatchService(plugin as never).read()).rejects.toThrow("Android app");
    expect(plugin.requestHealthPermissions).not.toHaveBeenCalled();
  });
});
