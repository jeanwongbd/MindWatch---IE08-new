interface Props {
  /** Shown only when accounts are switched on. */
  onSignIn?: () => void;
  onCreateAccount?: () => void;
  /** Shown only when accounts are switched on. Opens the read-only sample account. */
  onSample?: () => void;
  /** Shown only when accounts are switched on. */
  onSupport?: () => void;
  /** A short message, for example after an account has been deleted. */
  notice?: string;
}

export default function WelcomeScreen({ onSignIn, onCreateAccount, onSample, onSupport, notice }: Props) {
  return (
    <div
      style={{ fontFamily: "var(--font-body)" }}
      className="min-h-screen bg-page flex items-center justify-center p-2 sm:p-4"
    >
      <div className="w-full max-w-[420px] bg-background rounded-[40px] border border-border px-6 py-10 sm:px-8 space-y-6 text-center">
        <h1 className="text-5xl font-semibold text-ink tracking-tight">MindWatch</h1>
        <p className="text-lg text-ink">A calmer way to notice how your days feel.</p>
        <p className="text-sm text-muted">
          Compare how stressed you say you feel with what a wearable measures. This is not medical
          advice and cannot diagnose anything.
        </p>
        {notice && (
          <p role="status" className="text-xs text-accent-calm font-mono bg-accent-calm/10 px-2 py-1 rounded">
            {notice}
          </p>
        )}
        {onCreateAccount && (
          <button
            onClick={onCreateAccount}
            className="w-full py-3.5 bg-inverse text-on-inverse rounded-full hover:opacity-90 active:opacity-80 transition-opacity"
            style={{ fontWeight: 500 }}
          >
            Get started
          </button>
        )}
        {onSignIn && (
          <button
            onClick={onSignIn}
            className="w-full py-3.5 bg-surface border border-border text-ink rounded-full hover:opacity-90 active:opacity-80 transition-opacity"
            style={{ fontWeight: 500 }}
          >
            Sign in
          </button>
        )}
        {onSample && (
          <div>
            <button type="button" onClick={onSample} className="text-xs text-accent-calm hover:underline" style={{ fontWeight: 500 }}>
              Try a 30-day sample account
            </button>
          </div>
        )}
        {onSupport && (
          <div>
            <button type="button" onClick={onSupport} className="text-xs text-accent-calm hover:underline">
              Need support?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
