import { useCallback, useEffect, useState } from "react";
import DemoApp from "./DemoApp";
import WelcomeScreen from "./screens/WelcomeScreen";
import SignInScreen from "./screens/SignInScreen";
import CalibrationScreen from "./screens/CalibrationScreen";
import ConsentScreen from "./screens/ConsentScreen";
import CreateAccountScreen from "./screens/CreateAccountScreen";
import HomeScreen from "./screens/HomeScreen";
import DailyCheckInScreen from "./screens/DailyCheckInScreen";
import AuthFrame, { friendlyError, linkButtonClass, primaryButtonClass } from "./screens/AuthFrame";
import { ACCOUNTS_ENABLED } from "./config";
import { api, ApiError, type AuthSession, type AuthUser } from "./api";
import { QUESTIONS, firstUnanswered, type Answers } from "./calibrationQuestions";
import { clearAnswers, loadAnswers, saveAnswers } from "./onboarding";
import { clearToken, getToken, onSessionExpired, setToken } from "./session";
import { useServerWaking } from "./useServerWaking";

type View = "welcome" | "signin" | "calibration" | "consent" | "signup" | "demo" | "home" | "checkin";

const EXPIRED = "Your session expired. Please sign in again.";

export default function App() {
  const [view, setView] = useState<View>("welcome");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState("");
  // Starting-point answers and consent are held here, on this device, until the account is created.
  const [answers, setAnswers] = useState<Answers>(() => loadAnswers());
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [consented, setConsented] = useState(false);
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

  function startOnboarding() {
    setNotice("");
    setCalibrationStep(firstUnanswered(answers));
    setView("calibration");
  }

  function changeAnswers(next: Answers) {
    setAnswers(next);
    saveAnswers(next);
  }

  function accountCreated(session: AuthSession) {
    // The answers now live on the server, so the copy on this device goes.
    clearAnswers();
    setAnswers({});
    setConsented(false);
    signedIn(session);
  }

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
        onCreateAccount={startOnboarding}
      />
    );
  if (view === "calibration")
    return (
      <CalibrationScreen
        key={calibrationStep}
        answers={answers}
        initialStep={calibrationStep}
        onChange={changeAnswers}
        onDone={() => setView("consent")}
        onBack={() => setView("welcome")}
      />
    );
  if (view === "consent")
    return (
      <ConsentScreen
        onAgree={() => {
          setConsented(true);
          setView("signup");
        }}
        onBack={() => {
          setCalibrationStep(QUESTIONS.length - 1);
          setView("calibration");
        }}
      />
    );
  // The account form is only reachable after every question is answered and consent is given.
  if (view === "signup" && consented)
    return (
      <CreateAccountScreen
        answers={answers}
        onSuccess={accountCreated}
        onBack={() => setView("consent")}
        onSignIn={() => setView("signin")}
      />
    );
  if (view === "home" && user)
    return <HomeScreen user={user} onCheckIn={() => setView("checkin")} onSignOut={signOut} />;
  if (view === "checkin" && user) return <DailyCheckInScreen onBack={() => setView("home")} />;

  return (
    <WelcomeScreen
      onViewDemo={() => setView("demo")}
      onSignIn={ACCOUNTS_ENABLED ? () => setView("signin") : undefined}
      onCreateAccount={ACCOUNTS_ENABLED ? startOnboarding : undefined}
    />
  );
}
