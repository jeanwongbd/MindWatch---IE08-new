/** Base URL of the FastAPI backend.
 *
 *  The Android emulator reaches the host machine at the 10.0.2.2 alias, but a
 *  desktop browser needs localhost — so resolve per platform instead of
 *  hardcoding either. Override with VITE_API_BASE for a real device or a
 *  deployed backend (a phone on the LAN needs the host's IP, not 10.0.2.2).
 */
function resolveApiBase(): string {
  const override = import.meta.env.VITE_API_BASE;
  if (override) return override.replace(/\/$/, "");

  const platform = (globalThis as any).Capacitor?.getPlatform?.();
  const host = platform === "android" ? "10.0.2.2" : "localhost";
  return `http://${host}:8000`;
}

export const API_BASE = resolveApiBase();

export const api = (path: string) => `${API_BASE}${path}`;
