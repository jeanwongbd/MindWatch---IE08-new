interface Props {
  onViewDemo: () => void;
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

export default function WelcomeScreen({ onViewDemo, onSignIn, onCreateAccount, onSample, onSupport, notice }: Props) {
  return (
    <div
      style={{ fontFamily: "var(--font-body)" }}
      className="min-h-screen bg-page flex items-center justify-center p-3"
    >
      <div className="w-full max-w-[420px] bg-background rounded-[36px] border border-border p-8 space-y-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">MindWatch</h1>
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
            className="w-full py-3.5 bg-ink text-background rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
            style={{ fontWeight: 500 }}
          >
            Get started
          </button>
        )}
        {onSignIn && (
          <button
            onClick={onSignIn}
            className="w-full py-3.5 border border-border text-ink rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
            style={{ fontWeight: 500 }}
          >
            Sign in
          </button>
        )}
        <button
          onClick={onViewDemo}
          className={
            onSignIn || onCreateAccount
              ? "text-xs text-accent-calm hover:underline"
              : "w-full py-3.5 bg-ink text-background rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
          }
          style={{ fontWeight: 500 }}
        >
          View demo
        </button>
        {onSample && (
          <div>
            <button type="button" onClick={onSample} className="text-xs text-accent-calm hover:underline" style={{ fontWeight: 500 }}>
              Look at a sample account
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
