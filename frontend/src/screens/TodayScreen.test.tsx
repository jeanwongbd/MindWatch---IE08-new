import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TodayScreen from "./TodayScreen";
import { record } from "../test/fixtures";

afterEach(cleanup);

describe("TodayScreen", () => {
  it("shows the record it is given without calling the network", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<TodayScreen data={record} onCheckIn={() => {}} onWhy={() => {}} />);
    expect(screen.getByText(record.limitation)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
