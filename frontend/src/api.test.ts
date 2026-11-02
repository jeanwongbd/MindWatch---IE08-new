import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, number } from "./api";

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

describe("api errors and retries", () => {
  it("error_keeps_status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const error = (await api("/x").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe("Request failed (401). Please retry.");
  });

  it("has no status when the backend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = (await api("/x").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBeUndefined();
  });

  it("failed_post_not_resent", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(api("/checkin", { method: "POST", body: "{}" })).rejects.toThrow("Cannot connect");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a failed read once", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 })));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(api("/x")).resolves.toEqual({ ok: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
