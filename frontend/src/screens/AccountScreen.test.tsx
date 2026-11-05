import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountScreen from "./AccountScreen";

afterEach(cleanup);

describe("AccountScreen privacy link", () => {
  it("links to /privacy.html in a new tab", () => {
    render(
      <AccountScreen
        user={{ id: "u1", email: "a@b.co" } as never}
        onBack={vi.fn()}
        onSupport={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Privacy" });
    expect(link.getAttribute("href")).toBe("/privacy.html");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });
});
