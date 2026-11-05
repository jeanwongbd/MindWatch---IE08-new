import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("welcome screen", () => {
  it("does_not_offer_the_old_demo_with_accounts_on", async () => {
    vi.stubEnv("VITE_ACCOUNTS_ENABLED", "true");
    const { default: App } = await import("./App");
    render(<App />);
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View demo" })).toBeNull();
  });

  it("does_not_offer_the_old_demo_with_accounts_off", async () => {
    vi.stubEnv("VITE_ACCOUNTS_ENABLED", "false");
    const { default: App } = await import("./App");
    render(<App />);
    expect(screen.queryByRole("button", { name: "View demo" })).toBeNull();
  });
});
