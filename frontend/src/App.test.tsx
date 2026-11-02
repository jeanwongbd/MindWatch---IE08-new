import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { record } from "./test/fixtures";

const config = {
  profile_id: "p05",
  default_date: record.date,
  replay_dates: [record.date],
  scenarios: [{ id: "aligned_low", label: "Aligned low" }],
  limitation: "Test limitation text.",
};

function stubBackend() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const body = path.startsWith("/demo/config")
        ? config
        : path.startsWith("/trends")
          ? { records: [record] }
          : record;
      return new Response(JSON.stringify(body));
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("demo door", () => {
  it("demo_opens_from_welcome", async () => {
    stubBackend();
    const { default: App } = await import("./App");
    render(<App />);
    expect(screen.queryByLabelText("Replay date")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View demo" }));
    expect(await screen.findByLabelText("Replay date")).toBeTruthy();
    expect(await screen.findByText(record.limitation)).toBeTruthy();
  });

  it("sync_hidden", async () => {
    stubBackend();
    const { default: App } = await import("./App");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "View demo" }));
    await screen.findByText(record.limitation);
    expect(screen.queryByText(/Sync Live Watch/)).toBeNull();
  });

  it("synthetic_hidden_by_default", async () => {
    stubBackend();
    const { default: App } = await import("./App");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "View demo" }));
    await screen.findByLabelText("Replay date");
    expect(screen.queryByLabelText("Mode")).toBeNull();
  });

  it("synthetic_shown_in_dev_mode", async () => {
    vi.stubEnv("VITE_DEV_MODE", "true");
    stubBackend();
    const { default: App } = await import("./App");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "View demo" }));
    expect(await screen.findByLabelText("Mode")).toBeTruthy();
  });
});
