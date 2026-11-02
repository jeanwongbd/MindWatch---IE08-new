import type { AuthUser } from "../api";
import AuthFrame, { primaryButtonClass } from "./AuthFrame";

interface Props {
  user: AuthUser;
  onCheckIn: () => void;
  onSignOut: () => void;
}

/** Placeholder for the signed-in Home. The real Home replaces it in a later task. */
export default function HomeScreen({ user, onCheckIn, onSignOut }: Props) {
  return (
    <AuthFrame title="Home">
      <p className="text-sm text-muted text-center">
        Signed in as <span className="text-ink">{user.email}</span>
      </p>
      <p className="text-xs text-dim text-center">Your personal Home is coming soon.</p>
      <button onClick={onCheckIn} className={primaryButtonClass} style={{ fontWeight: 500 }}>
        Check in today
      </button>
      <button
        onClick={onSignOut}
        className="w-full py-3.5 border border-border text-ink rounded-2xl hover:opacity-90"
        style={{ fontWeight: 500 }}
      >
        Sign out
      </button>
    </AuthFrame>
  );
}
