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

describe("api and the session", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  async function freshApi() {
    vi.resetModules();
    const apiModule = await import("./api");
    const session = await import("./session");
    return { ...apiModule, ...session };
  }

  it("sends the saved token", async () => {
    const { api, setToken } = await freshApi();
    setToken("abc");
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    await api("/auth/me");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("sends no Authorization header when signed out", async () => {
    const { api } = await freshApi();
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    await api("/today");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.headers as Record<string, string>).not.toHaveProperty("Authorization");
  });

  it("keeps the server's message and Retry-After on errors", async () => {
    const { api, ApiError } = await freshApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Too many failed attempts." }), {
          status: 429,
          headers: { "Retry-After": "90" },
        }),
      ),
    );
    const error = (await api("/auth/login", { method: "POST", body: "{}" }).catch((e) => e)) as InstanceType<typeof ApiError>;
    expect(error.status).toBe(429);
    expect(error.detail).toBe("Too many failed attempts.");
    expect(error.retryAfter).toBe(90);
    expect(error.message).toBe("Request failed (429). Please retry.");
  });

  it("handles an empty 204 reply", async () => {
    const { api } = await freshApi();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("a 401 on a signed-in request clears the token and says the session expired", async () => {
    const { api, setToken, getToken, onSessionExpired } = await freshApi();
    setToken("abc");
    const expired = vi.fn();
    onSessionExpired(expired);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(api("/auth/me")).rejects.toThrow();
    expect(getToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("a 401 from login or logout is not treated as an expired session", async () => {
    const { api, setToken, getToken, onSessionExpired } = await freshApi();
    setToken("abc");
    const expired = vi.fn();
    onSessionExpired(expired);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(api("/auth/login", { method: "POST", body: "{}" })).rejects.toThrow();
    await expect(api("/auth/logout", { method: "POST" })).rejects.toThrow();
    expect(getToken()).toBe("abc");
    expect(expired).not.toHaveBeenCalled();
  });
});
