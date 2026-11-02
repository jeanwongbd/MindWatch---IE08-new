import { afterEach, describe, expect, it, vi } from "vitest";
import { api, number } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("number", () => {
  it("formats values", () => {
    expect(number(null)).toBe("Unavailable");
    expect(number(4)).toBe("4");
    expect(number(4.26)).toBe("4.3");
  });
});

describe("api", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }))));
    await expect(api("/health")).resolves.toEqual({ ok: 1 });
  });

  it("reports the status on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    await expect(api("/health")).rejects.toThrow("Request failed (500)");
  });

  it("explains when the backend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api("/health")).rejects.toThrow("Cannot connect to MindWatch");
  });
});
