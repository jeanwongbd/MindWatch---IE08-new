import { useState, type FormEvent } from "react";
import { api, type AuthSession } from "../api";
import AuthFrame, { friendlyError, inputClass, linkButtonClass, primaryButtonClass } from "./AuthFrame";

interface Props {
  notice?: string;
  onSuccess: (session: AuthSession) => void;
  onBack: () => void;
  onCreateAccount: () => void;
}

export default function SignInScreen({ notice, onSuccess, onBack, onCreateAccount }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api<AuthSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onSuccess(session);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Sign in">
      {notice && (
        <p role="status" className="text-[11px] text-accent-calm font-mono bg-accent-calm/10 px-2 py-1 rounded">
          {notice}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="signin-email" className="block text-xs text-muted mb-1">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="signin-password" className="block text-xs text-muted mb-1">
            Password
          </label>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-xs text-accent-stress">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButtonClass} style={{ fontWeight: 500 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="flex justify-between">
        <button type="button" onClick={onCreateAccount} className={linkButtonClass}>
          Create an account
        </button>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
