import { describe, expect, it } from "vitest";
import { addBusinessDays, addCalendarDays, daysRemaining } from "./dates";

describe("date helpers", () => {
  it("adds calendar days", () => {
    expect(addCalendarDays("2026-10-09", 15)).toBe("2026-10-24");
  });

  it("skips weekends for business days", () => {
    // Friday + 1 business day = Monday
    expect(addBusinessDays("2026-10-09", 1)).toBe("2026-10-12");
  });

  it("skips configured holidays", () => {
    expect(addBusinessDays("2026-10-09", 1, ["2026-10-12"])).toBe("2026-10-13");
  });

  it("calculates remaining days by calendar date", () => {
    expect(daysRemaining("2026-10-12", new Date("2026-10-10T14:00:00"))).toBe(2);
  });
});
