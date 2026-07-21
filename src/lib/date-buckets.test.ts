import { afterEach, describe, expect, it } from "vitest";
import { fillDatePeriods } from "./date-buckets";

describe("fillDatePeriods", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("buckets by UTC calendar day even when the process runs in a behind-UTC timezone", () => {
    // 2024-01-15T23:30 local (America/Los_Angeles, UTC-8 in January) is
    // 2024-01-16T07:30 in UTC. The old implementation used local-time
    // setHours/setDate to find "today", which would have anchored the
    // window on 2024-01-15 (the local calendar day) and silently dropped
    // the most recent UTC day from the chart. The fixed implementation must
    // anchor on the UTC calendar day, 2024-01-16.
    process.env.TZ = "America/Los_Angeles";
    const referenceTime = new Date("2024-01-16T07:30:00.000Z");

    const keys = fillDatePeriods(3, referenceTime);

    expect(keys).toEqual(["2024-01-14", "2024-01-15", "2024-01-16"]);
  });

  it("is unaffected by process timezone for a UTC-midday reference time", () => {
    const referenceTime = new Date("2024-03-10T12:00:00.000Z");

    process.env.TZ = "America/Los_Angeles";
    const behindUtc = fillDatePeriods(5, referenceTime);

    process.env.TZ = "Pacific/Kiritimati"; // UTC+14, ahead of UTC
    const aheadOfUtc = fillDatePeriods(5, referenceTime);

    expect(behindUtc).toEqual(aheadOfUtc);
  });

  it("returns exactly periodDays keys", () => {
    const referenceTime = new Date("2024-06-01T00:00:00.000Z");
    expect(fillDatePeriods(7, referenceTime)).toHaveLength(7);
    expect(fillDatePeriods(30, referenceTime)).toHaveLength(30);
  });

  it("computes the correct first and last key for a multi-day window", () => {
    const referenceTime = new Date("2024-03-10T12:00:00.000Z");
    const keys = fillDatePeriods(5, referenceTime);

    expect(keys[0]).toBe("2024-03-06");
    expect(keys[keys.length - 1]).toBe("2024-03-10");
    expect(keys).toEqual(["2024-03-06", "2024-03-07", "2024-03-08", "2024-03-09", "2024-03-10"]);
  });

  it("handles the periodDays=1 edge case: first key equals last key equals the reference UTC day", () => {
    const referenceTime = new Date("2024-03-10T18:45:12.000Z");
    const keys = fillDatePeriods(1, referenceTime);

    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("2024-03-10");
    expect(keys[0]).toBe(keys[keys.length - 1]);
  });
});
