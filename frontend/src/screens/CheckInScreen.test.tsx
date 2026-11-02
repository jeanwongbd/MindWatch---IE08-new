import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckInScreen from "./CheckInScreen";
import { record } from "../test/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CheckInScreen", () => {
  it("checkin_payload_has_no_user_id, and the check-in still saves", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ saved: true })));
    vi.stubGlobal("fetch", fetchSpy);
    const onDone = vi.fn();
    render(<CheckInScreen data={record} onReturn={() => {}} onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/checkin")).toBe(true);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("user_id");
    expect(body.date).toBe(record.date);
    expect(typeof body.stress).toBe("number");
  });
});
