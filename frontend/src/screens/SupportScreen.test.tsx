import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SupportScreen from "./SupportScreen";

afterEach(cleanup);

// The numbers, written out a second time on purpose. They are copied from the table in APP_PLAN.md
// (2 November 2026). If anyone changes a number in supportContacts.ts by accident, this fails.
const EXPECTED = {
  NTU: [
    { name: "Student counselling", phones: [["+65 6790 4462", "tel:+6567904462"]], email: "ucc-students@ntu.edu.sg" },
    { name: "After-hours Psychological Emergency Line", phones: [["+65 6790 4462", "tel:+6567904462"]], email: null },
    {
      name: "Staff counselling (Employee Assistance Programme)",
      phones: [["+65 6904 1101", "tel:+6569041101"]],
      email: "ucc-employees@ntu.edu.sg",
    },
    {
      name: "University Wellbeing Office, critical support",
      phones: [["+65 6514 1911", "tel:+6565141911"]],
      email: "UWO-incidentsupport@ntu.edu.sg",
    },
    { name: "NTU Campus Security", phones: [["+65 6790 5200", "tel:+6567905200"]], email: null },
  ],
  "Anywhere in Singapore": [
    {
      name: "Emergency: Police and Ambulance",
      phones: [
        ["999 (Police)", "tel:999"],
        ["995 (Ambulance)", "tel:995"],
      ],
      email: null,
    },
    { name: "National Mindline", phones: [["1771", "tel:1771"]], email: null },
    { name: "Samaritans of Singapore", phones: [["1767", "tel:1767"]], email: null },
    { name: "Institute of Mental Health helpline", phones: [["+65 6389 2222", "tel:+6563892222"]], email: null },
  ],
};

function rendered() {
  const out: Record<string, unknown[]> = {};
  for (const section of document.querySelectorAll("section")) {
    out[section.getAttribute("aria-label")!] = [...section.querySelectorAll("li")].map((li) => ({
      name: li.querySelector("p")!.textContent,
      phones: [...li.querySelectorAll('a[href^="tel:"]')].map((a) => [a.textContent, a.getAttribute("href")]),
      email: li.querySelector('a[href^="mailto:"]')?.textContent ?? null,
    }));
  }
  return out;
}

describe("the Support page", () => {
  it("support_numbers_match_list: every contact and number is exactly as in the plan", () => {
    render(<SupportScreen onBack={() => {}} />);
    expect(rendered()).toEqual(EXPECTED);
  });

  it("each number dials, and each email address opens a message", () => {
    render(<SupportScreen onBack={() => {}} />);
    const emails = [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute("href"));
    expect(emails).toEqual([
      "mailto:ucc-students@ntu.edu.sg",
      "mailto:ucc-employees@ntu.edu.sg",
      "mailto:UWO-incidentsupport@ntu.edu.sg",
    ]);
    for (const a of document.querySelectorAll('a[href^="tel:"]')) {
      expect(a.getAttribute("href")).toMatch(/^tel:(\+65\d{8}|\d{3,4})$/);
    }
  });

  it("says what to do in immediate danger, and that this is not medical advice", () => {
    render(<SupportScreen onBack={() => {}} />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/immediate danger, call 999 \(Police\) or 995 \(Ambulance\)/);
    expect(text).toMatch(/not medical advice and can't diagnose anything/);
  });

  it("the hours are shown where they matter", () => {
    render(<SupportScreen onBack={() => {}} />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Office hours, 9 am to 5 pm/);
    expect(text).toMatch(/24 hours, every day/);
  });

  it("has a Back button", () => {
    const onBack = vi.fn();
    render(<SupportScreen onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("has a Privacy link that opens /privacy.html in a new tab", () => {
    render(<SupportScreen onBack={() => {}} />);
    const link = screen.getByRole("link", { name: "Privacy" });
    expect(link.getAttribute("href")).toBe("/privacy.html");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });
});
