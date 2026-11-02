import { useState, type FormEvent } from "react";
import { api, type AuthSession } from "../api";
import type { Answers } from "../calibrationQuestions";
import { CONSENT_VERSION } from "../consentText";
import AuthFrame, { friendlyError, inputClass, linkButtonClass, primaryButtonClass } from "./AuthFrame";

const MIN_PASSWORD = 10;

interface Props {
  /** The starting-point answers and the consent given earlier. They are sent only now. */
  answers: Answers;
  onSuccess: (session: AuthSession) => void;
  onBack: () => void;
  onSignIn: () => void;
}

export default function CreateAccountScreen({ answers, onSuccess, onBack, onSignIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const session = await api<AuthSession>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          invite_code: inviteCode,
          consent: { version: CONSENT_VERSION, agreed: true, adult_confirmed: true },
          calibration: answers,
        }),
      });
      onSuccess(session);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Create account">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="signup-email" className="block text-xs text-muted mb-1">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-xs text-muted mb-1">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <p className="text-[11px] text-dim mt-1">At least {MIN_PASSWORD} characters.</p>
        </div>
        <div>
          <label htmlFor="signup-invite" className="block text-xs text-muted mb-1">
            Invite code
          </label>
          <input
            id="signup-invite"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-xs text-accent-stress">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButtonClass} style={{ fontWeight: 500 }}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <div className="flex justify-between">
        <button type="button" onClick={onSignIn} className={linkButtonClass}>
          I already have an account
        </button>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
