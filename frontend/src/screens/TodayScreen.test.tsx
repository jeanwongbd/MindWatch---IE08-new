import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TodayScreen from "./TodayScreen";
import { record } from "../test/fixtures";
import type { DemoRecord } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function withEstimate(value: number | null, extra: Partial<DemoRecord> = {}): DemoRecord {
  return { ...record, wearable_estimate: { ...record.wearable_estimate, value }, ...extra };
}

function show(data: DemoRecord) {
  render(<TodayScreen data={data} onCheckIn={() => {}} onWhy={() => {}} />);
}

describe("TodayScreen", () => {
  it("shows the record it is given without calling the network", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    show(record);
    expect(screen.getByText(record.limitation)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("says Below 50 for a low estimate", () => {
    show(withEstimate(42.5));
    expect(screen.getByText("Below 50")).toBeTruthy();
    expect(screen.queryByText("At or above 50")).toBeNull();
    expect(screen.getByText("Ridge V2 Personal model")).toBeTruthy();
  });

  it("says At or above 50 for a high estimate", () => {
    show(withEstimate(50));
    expect(screen.getByText("At or above 50")).toBeTruthy();
    expect(screen.queryByText("Below 50")).toBeNull();
  });

  it("says No estimate when there is none", () => {
    show(withEstimate(null));
    expect(screen.getByText("No estimate")).toBeTruthy();
    expect(screen.queryByText("Ridge V2 Personal model")).toBeNull();
  });

  it("warns when inputs were filled in", () => {
    show(withEstimate(42.5, { imputed_features: ["avg_rmssd", "daily_steps"] }));
    expect(screen.getByText(/filled-in values for 2 of 4 inputs/)).toBeTruthy();
  });

  it("does not warn when nothing was filled in", () => {
    show(withEstimate(42.5, { imputed_features: [] }));
    expect(screen.queryByText(/filled-in values/)).toBeNull();
  });

  it("does not warn when there is no estimate", () => {
    show(withEstimate(null, { imputed_features: ["avg_rmssd"] }));
    expect(screen.queryByText(/filled-in values/)).toBeNull();
  });

  it("no_p01_fallback: a failed /today never asks for a profile route", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<TodayScreen onCheckIn={() => {}} onWhy={() => {}} />);
    await screen.findByText(/Could not connect|Request failed/);
    const urls = fetchSpy.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(urls.some((u) => u.includes("/profiles/"))).toBe(false);
    expect(urls.every((u) => u.endsWith("/today"))).toBe(true);
  });
});
