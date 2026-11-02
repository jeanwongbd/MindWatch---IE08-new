import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DemoApp from "./DemoApp";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DemoApp while the server wakes up", () => {
  it("shows_waking_message", async () => {
    vi.useFakeTimers();
    // A request that never answers, like a sleeping server.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<DemoApp />);
    expect(screen.queryByText(/Waking up the server/)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(screen.getByText(/Waking up the server/)).toBeTruthy();
  });
});
