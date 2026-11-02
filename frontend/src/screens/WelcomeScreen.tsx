interface Props {
  onViewDemo: () => void;
  /** Shown only when accounts are switched on. */
  onSignIn?: () => void;
  onCreateAccount?: () => void;
}

export default function WelcomeScreen({ onViewDemo, onSignIn, onCreateAccount }: Props) {
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
        {onCreateAccount && (
          <button
            onClick={onCreateAccount}
            className="w-full py-3.5 bg-ink text-background rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
            style={{ fontWeight: 500 }}
          >
            Create account
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
      </div>
    </div>
  );
}
