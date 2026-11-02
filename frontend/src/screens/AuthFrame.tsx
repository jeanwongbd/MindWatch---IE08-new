import type { ReactNode } from "react";
import { ApiError } from "../api";

/** Page and card shared by the Welcome, sign-in and create-account screens. */
export default function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{ fontFamily: "var(--font-body)" }}
      className="min-h-screen bg-page flex items-center justify-center p-3"
    >
      <div className="w-full max-w-[420px] bg-background rounded-[36px] border border-border p-8 space-y-5">
        <h1 className="text-2xl font-semibold text-ink text-center">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export const inputClass =
  "w-full bg-input text-ink border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent-pulse";
export const primaryButtonClass =
  "w-full py-3.5 bg-ink text-background rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50";
export const linkButtonClass = "text-xs text-accent-calm hover:underline";

/** Turns a failed request into a sentence the user can act on. */
export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      const minutes = error.retryAfter ? Math.max(1, Math.ceil(error.retryAfter / 60)) : null;
      return minutes
        ? `Too many failed attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
        : "Too many failed attempts. Try again later.";
    }
    return error.detail ?? error.message;
  }
  return "Something went wrong. Please try again.";
}
