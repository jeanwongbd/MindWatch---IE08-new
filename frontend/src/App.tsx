import { useCallback, useEffect, useState } from "react";
import DemoApp from "./DemoApp";
import WelcomeScreen from "./screens/WelcomeScreen";
import SignInScreen from "./screens/SignInScreen";
import CreateAccountScreen from "./screens/CreateAccountScreen";
import HomeScreen from "./screens/HomeScreen";
import AuthFrame, { friendlyError, linkButtonClass, primaryButtonClass } from "./screens/AuthFrame";
import { ACCOUNTS_ENABLED } from "./config";
import { api, ApiError, type AuthSession, type AuthUser } from "./api";
import { clearToken, getToken, onSessionExpired, setToken } from "./session";
import { useServerWaking } from "./useServerWaking";

type View = "welcome" | "signin" | "signup" | "demo" | "home";

const EXPIRED = "Your session expired. Please sign in again.";

export default function App() {
  const [view, setView] = useState<View>("welcome");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState("");
  // On startup, a saved token has to be checked with the server before we know who is signed in.
  const [checking, setChecking] = useState(() => ACCOUNTS_ENABLED && getToken() !== null);
  const [checkError, setCheckError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const waking = useServerWaking();

  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setNotice(EXPIRED);
        setView("signin");
        setChecking(false);
      }),
    [],
  );

  useEffect(() => {
    if (!ACCOUNTS_ENABLED || getToken() === null) return;
    let live = true;
    setChecking(true);
    setCheckError("");
    api<AuthUser>("/auth/me")
      .then((me) => {
        if (!live) return;
        setUser(me);
        setView("home");
        setChecking(false);
      })
      .catch((e) => {
        if (!live) return;
        // A 401 already cleared the token and sent us to sign-in. Anything else (a sleeping
        // server, no network) keeps the token and lets the user retry.
        if (e instanceof ApiError && e.status === 401) return;
        setCheckError(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const signedIn = useCallback((session: AuthSession) => {
    setToken(session.token);
    setUser(session.user);
    setNotice("");
    setView("home");
  }, []);

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Even if the server cannot be reached, this device forgets the session.
    }
    clearToken();
    setUser(null);
    setNotice("");
    setView("welcome");
  }

  function signInAgain() {
    clearToken();
    setChecking(false);
    setCheckError("");
    setView("signin");
  }

  if (checking) {
    return (
      <AuthFrame title="MindWatch">
        {checkError ? (
          <>
            <p role="alert" className="text-xs text-accent-stress text-center">
              {checkError}
            </p>
            <button onClick={() => setAttempt((n) => n + 1)} className={primaryButtonClass}>
              Retry
            </button>
            <div className="text-center">
              <button onClick={signInAgain} className={linkButtonClass}>
                Sign in again
              </button>
            </div>
          </>
        ) : (
          <p role="status" className="text-sm text-muted text-center font-mono">
            {waking ? "Waking up the server… this can take about a minute." : "Signing you in…"}
          </p>
        )}
      </AuthFrame>
    );
  }

  if (view === "demo") return <DemoApp />;
  if (view === "signin")
    return (
      <SignInScreen
        notice={notice}
        onSuccess={signedIn}
        onBack={() => {
          setNotice("");
          setView("welcome");
        }}
        onCreateAccount={() => {
          setNotice("");
          setView("signup");
        }}
      />
    );
  if (view === "signup")
    return (
      <CreateAccountScreen
        onSuccess={signedIn}
        onBack={() => setView("welcome")}
        onSignIn={() => setView("signin")}
      />
    );
  if (view === "home" && user) return <HomeScreen user={user} onSignOut={signOut} />;

  return (
    <WelcomeScreen
      onViewDemo={() => setView("demo")}
      onSignIn={ACCOUNTS_ENABLED ? () => setView("signin") : undefined}
      onCreateAccount={ACCOUNTS_ENABLED ? () => setView("signup") : undefined}
    />
  );
}
