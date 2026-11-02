/** The signed-in session token, kept on this device. Falls back to memory if storage is blocked. */
const KEY = "mindwatch.session";
let memoryToken: string | null = null;
const expiredListeners = new Set<() => void>();

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memoryToken;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Storage is blocked; the token lives in memory until the page closes.
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to clear.
  }
}

/** Called when the server rejects a token we sent. Returns an unsubscribe function. */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

export function notifySessionExpired(): void {
  expiredListeners.forEach((listener) => listener());
}
