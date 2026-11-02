import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_KEY,
  SESSION,
  TAPPED_ANSWERS,
  USER,
  agreeToConsent,
  answerQuestions,
  callsTo,
  fill,
  loadApp,
  reachAccountForm,
  stubBackend,
  tap,
} from "./test/accountsHelpers";

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("the starting-point questions", () => {
  it("starts from the Welcome screen and says 'starting point', not 'calibration'", async () => {
    stubBackend({});
    await loadApp();
    tap("Get started");
    expect(screen.getByRole("heading", { name: "Set your starting point" })).toBeTruthy();
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/calibrat/i);
  });

  it("cannot go on until a question is answered", async () => {
    stubBackend({});
    await loadApp();
    tap("Get started");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    tap("4");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
  });

  it("answers_survive_going_back", async () => {
    stubBackend({});
    await loadApp();
    tap("Get started");
    answerQuestions(2); // answers questions 1 and 2, now on question 3
    expect(screen.getByText("Question 3 of 6")).toBeTruthy();

    tap("Back");
    expect(screen.getByText("Question 2 of 6")).toBeTruthy();
    expect(pressed("6 to 7")).toBe("true");
    tap("Back");
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect(pressed("4")).toBe("true");
  });

  it("answers_survive_going_back from the consent screen too", async () => {
    stubBackend({});
    await loadApp();
    tap("Get started");
    answerQuestions();
    expect(screen.getByRole("heading", { name: "Before you start" })).toBeTruthy();
    tap("Back");
    expect(screen.getByText("Question 6 of 6")).toBeTruthy();
    expect(pressed("Evening")).toBe("true");
  });

  it("answers survive closing and reopening the app, and pick up where they stopped", async () => {
    stubBackend({});
    const first = await loadApp();
    tap("Get started");
    answerQuestions(2);
    first.unmount();
    vi.resetModules();

    await loadApp();
    tap("Get started");
    expect(screen.getByText("Question 3 of 6")).toBeTruthy();
    tap("Back");
    expect(pressed("6 to 7")).toBe("true");
  });

  it("ignores damaged or unexpected saved answers", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ usual_stress: 99, sleep_hours: "twelve", sleep_quality: "good", surprise: "x" }),
    );
    stubBackend({});
    await loadApp();
    tap("Get started");
    // Only the valid saved answer (sleep quality "Good") counts; the rest are unanswered.
    expect(screen.getByText("Question 1 of 6")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    tap("4");
    tap("Next");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    tap("6 to 7");
    tap("Next");
    expect(pressed("Good")).toBe("true");
  });
});

describe("consent", () => {
  async function toConsent() {
    stubBackend({});
    await loadApp();
    tap("Get started");
    answerQuestions();
  }

  it("cannot_finish_without_consent", async () => {
    await toConsent();
    const next = () => screen.getByRole("button", { name: "Continue" });
    expect(next().hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByLabelText("I am 18 or over."));
    expect(next().hasAttribute("disabled")).toBe(true); // only one box ticked

    fireEvent.click(screen.getByLabelText("I am 18 or over."));
    fireEvent.click(screen.getByLabelText("I have read this and agree."));
    expect(next().hasAttribute("disabled")).toBe(true); // the other box only

    fireEvent.click(screen.getByLabelText("I am 18 or over."));
    expect(next().hasAttribute("disabled")).toBe(false);

    expect(screen.queryByLabelText("Invite code")).toBeNull(); // the account form is not reachable yet
  });

  it("states what is stored and that it is not medical advice", async () => {
    await toConsent();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/not medical advice/);
    expect(text).toMatch(/your answers to the starting-point questions/);
    expect(text).toMatch(/delete your account/);
  });
});

describe("nothing leaves the phone before the account is created", () => {
  it("no_server_call_before_account", async () => {
    const spy = stubBackend({ "POST /auth/signup": { status: 201, body: SESSION } });
    await loadApp();
    reachAccountForm();
    expect(screen.getByLabelText("Invite code")).toBeTruthy(); // we are on the account form
    expect(spy).not.toHaveBeenCalled();

    fill("Email", USER.email);
    fill("Password", "a long password 1");
    fill("Invite code", "local-code");
    expect(spy).not.toHaveBeenCalled(); // typing is not sending

    tap("Create account");
    await screen.findByText(USER.email);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = callsTo(spy, "POST /auth/signup")[0];
    expect(String(url)).not.toMatch(/sleep|stress|activity|wears|=/); // no answers in the address
  });

  it("answers_saved_with_account: they go with the signup, and the device copy is cleared", async () => {
    const spy = stubBackend({ "POST /auth/signup": { status: 201, body: SESSION } });
    await loadApp();
    reachAccountForm();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}")).toEqual(TAPPED_ANSWERS);

    fill("Email", USER.email);
    fill("Password", "a long password 1");
    fill("Invite code", "local-code");
    tap("Create account");
    await screen.findByText(USER.email);

    const body = JSON.parse(callsTo(spy, "POST /auth/signup")[0][1]!.body as string);
    expect(body.calibration).toEqual(TAPPED_ANSWERS);
    expect(body.consent).toEqual({ version: "v0-draft", agreed: true, adult_confirmed: true });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("a failed signup keeps the answers so nothing has to be retyped", async () => {
    stubBackend({ "POST /auth/signup": { status: 403, body: { detail: "Invalid invite code." } } });
    await loadApp();
    reachAccountForm();
    fill("Email", USER.email);
    fill("Password", "a long password 1");
    fill("Invite code", "wrong");
    tap("Create account");
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid invite code.");
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}")).toEqual(TAPPED_ANSWERS);

    tap("Back"); // to consent
    expect(screen.getByRole("heading", { name: "Before you start" })).toBeTruthy();
    tap("Back"); // to the last question
    expect(pressed("Evening")).toBe("true");
  });

  it("going back from the account form asks for the two ticks again", async () => {
    stubBackend({});
    await loadApp();
    reachAccountForm();
    tap("Back");
    expect(screen.getByRole("heading", { name: "Before you start" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    agreeToConsent();
    expect(screen.getByLabelText("Invite code")).toBeTruthy();
  });
});

describe("other ways in", () => {
  it("the Sign in screen's 'Create an account' starts the questions", async () => {
    stubBackend({});
    await loadApp();
    tap("Sign in");
    tap("Create an account");
    expect(screen.getByRole("heading", { name: "Set your starting point" })).toBeTruthy();
  });
});
