import type { AuthUser } from "../api";
import AuthFrame, { primaryButtonClass } from "./AuthFrame";

interface Props {
  user: AuthUser;
  onSignOut: () => void;
}

/** Placeholder for the signed-in Home. The real Home replaces it in a later task. */
export default function HomeScreen({ user, onSignOut }: Props) {
  return (
    <AuthFrame title="Home">
      <p className="text-sm text-muted text-center">
        Signed in as <span className="text-ink">{user.email}</span>
      </p>
      <p className="text-xs text-dim text-center">Your personal Home is coming soon.</p>
      <button onClick={onSignOut} className={primaryButtonClass} style={{ fontWeight: 500 }}>
        Sign out
      </button>
    </AuthFrame>
  );
}
