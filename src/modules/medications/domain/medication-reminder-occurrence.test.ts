import { afterEach, describe, expect, it, vi } from "vitest";
import { createReminderSourceKey as key, deriveReminderCandidates as derive, guardReminderTuple, isCanonicalReminderInstant, isReminderLocalDate, isReminderSourceKey, isReminderWindow, isSupportedReminderInstant, reminderBangkokToUtc as utc, reminderWindowDates, MAX_CANDIDATE_TUPLES } from "./medication-reminder-occurrence";

const id = "55555555-5555-4555-8555-555555555555";
const other = "66666666-6666-4666-8666-666666666666";
const date = "2026-10-04";
const window = { from: "2026-10-03T17:00:00.000Z", to: "2026-10-04T17:00:00.000Z", evaluationAsOf: "2026-10-03T16:59:59.999Z" };
describe("daily reminder identity and Bangkok semantics", () => {
  afterEach(() => vi.restoreAllMocks());
  it("has an exact secret-free canonical identity fixture", () => {
    expect(key(id, date)).toBe("medsrc_v1_pBxt5_uae0VE45U7yOd4Yhowhd8HzoXBXRmDMIWENSI");
    expect(key(id.toUpperCase(), date)).toBe(key(id, date));
    expect(key("abcdefab-cdef-4abc-8def-abcdefabcdef".toUpperCase(), date)).toBe(key("abcdefab-cdef-4abc-8def-abcdefabcdef", date));
    expect(key(id, date)).toHaveLength(53);
    expect(key(id, date)).not.toContain("=");
    expect(isReminderSourceKey(key(id, date))).toBe(true);
    expect(key(other, date)).not.toBe(key(id, date));
    expect(key(id, "2026-10-05")).not.toBe(key(id, date));
  });
  it.each(["", "invalid", id + "x"])("rejects invalid child UUID %s", (value) => expect(() => key(value, date)).toThrow());
  it("rejects malformed keys including noncanonical trailing bits", () => {
    const canonical = "medsrc_v1_" + "A".repeat(43);
    expect(isReminderSourceKey(canonical)).toBe(true);
    for (const value of [canonical.slice(0, -1) + "B", canonical + "=", canonical.replace("v1", "v2"), canonical.slice(0, -1) + "+", canonical.slice(1)]) expect(isReminderSourceKey(value)).toBe(false);
  });
  it("fails closed on collision and duplicate tuples independently of hashing", () => {
    const tuples = new Map<string, string>();
    guardReminderTuple(tuples, "synthetic", "first");
    expect(() => guardReminderTuple(tuples, "synthetic", "second")).toThrowError(expect.objectContaining({ code: "INFRASTRUCTURE" }));
    expect(() => guardReminderTuple(tuples, "synthetic", "first")).toThrow();
  });
  it.each(["1970-01-01", "9999-12-31", "2024-02-29", "2000-02-29", date])("accepts actual Gregorian date %s", (value) => expect(isReminderLocalDate(value)).toBe(true));
  it.each(["1969-12-31", "10000-01-01", "2026-02-29", "1900-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", " 2026-10-04", "๒๐๒๖-10-04"])("rejects local date %s", (value) => expect(isReminderLocalDate(value)).toBe(false));
  it.each([
    [date, "00:00", "2026-10-03T17:00:00.000Z"],
    [date, "08:00", "2026-10-04T01:00:00.000Z"],
    [date, "23:59", "2026-10-04T16:59:00.000Z"],
    ["2026-10-05", "00:00", "2026-10-04T17:00:00.000Z"],
    ["1970-01-01", "00:00", "1969-12-31T17:00:00.000Z"],
    ["9999-12-31", "23:59", "9999-12-31T16:59:00.000Z"],
    ["2024-03-01", "00:00", "2024-02-29T17:00:00.000Z"],
    ["2027-01-01", "00:00", "2026-12-31T17:00:00.000Z"],
  ])("converts %s %s independently of process TZ", (day, time, expected) => expect(utc(day, time)).toBe(expected));
  it("fails closed when IANA is unavailable or mismatches", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementationOnce(function () { throw new Error("private"); });
    expect(() => utc(date, "08:00")).toThrowError(expect.objectContaining({ code: "INFRASTRUCTURE" }));
    vi.restoreAllMocks();
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([]);
    expect(() => utc(date, "08:00")).toThrowError(expect.objectContaining({ code: "INFRASTRUCTURE" }));
  });
  it.each(["24:00", "08:00:00", "8:00", "08:60"])("rejects time %s", (time) => expect(() => utc(date, time)).toThrow());
  it.each(["2026-10-04T01:00:00Z", "2026-10-04T01:00:00.00Z", "2026-10-04T01:00:00.0000Z", "2026-10-04T01:00:00.000z", "2026-10-04T08:00:00.000+07:00", "2026-10-04T01:00:00.000", "2026-02-30T01:00:00.000Z", "2026-10-04T24:00:00.000Z", "2026-10-04T01:00:60.000Z", "0000-01-01T00:00:00.000Z", " 2026-10-04T01:00:00.000Z"])("rejects noncanonical UTC %s", (value) => expect(isCanonicalReminderInstant(value)).toBe(false));
  it("distinguishes version syntax from supported query range", () => {
    expect(isCanonicalReminderInstant("0001-01-01T00:00:00.000Z")).toBe(true);
    expect(isSupportedReminderInstant("1969-12-31T17:00:00.000Z")).toBe(false);
    expect(isSupportedReminderInstant("9999-12-31T17:00:00.000Z")).toBe(false);
    expect(isSupportedReminderInstant("9999-12-31T16:59:59.999Z")).toBe(true);
  });
  it("enforces exact elapsed duration and eight intersecting local dates", () => {
    expect(isReminderWindow(window.from, "2026-10-10T17:00:00.000Z")).toBe(true);
    expect(isReminderWindow(window.from, "2026-10-10T17:00:00.001Z")).toBe(false);
    expect(isReminderWindow(window.from, window.from)).toBe(false);
    expect(isReminderWindow(window.to, window.from)).toBe(false);
    expect(reminderWindowDates("2026-10-03T17:00:00.001Z", "2026-10-10T17:00:00.001Z")).toHaveLength(8);
  });
  it("filters inclusive from, exclusive to and strictly greater than asOf", () => {
    const schedules = [{ id, localTime: "00:00" }, { id: other, localTime: "08:00" }];
    const dates = reminderWindowDates(window.from, window.to);
    expect(derive(schedules, dates, window).map((item) => item.localTime)).toEqual(["00:00", "08:00"]);
    expect(derive(schedules, dates, { ...window, evaluationAsOf: window.from }).map((item) => item.localTime)).toEqual(["08:00"]);
    expect(derive(schedules, dates, { ...window, to: "2026-10-04T01:00:00.000Z" })).toHaveLength(1);
    expect(derive(schedules, dates, { ...window, evaluationAsOf: window.to })).toEqual([]);
  });
  it("bounds work, sorts numerically, and rejects impossible persisted states", () => {
    expect(derive([{ id, localTime: "23:59" }, { id: other, localTime: "00:00" }], [date]).map((item) => item.localTime)).toEqual(["00:00", "23:59"]);
    for (const schedules of [Array.from({ length: 1441 }, () => ({ id, localTime: "00:00" })), [{ id, localTime: "08:00" }, { id, localTime: "09:00" }], [{ id, localTime: "08:00" }, { id: other, localTime: "08:00" }], [{ id, localTime: "08:00:01" }], [{ id: "bad", localTime: "08:00" }]]) expect(() => derive(schedules, [date])).toThrowError(expect.objectContaining({ code: "INFRASTRUCTURE" }));
    expect(() => derive([], Array(9).fill(date))).toThrow();
    const schedules = Array.from({ length: 1440 }, (_, minute) => ({ id: `00000000-0000-4000-8000-${String(minute).padStart(12, "0")}`, localTime: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` }));
    expect(derive(schedules, reminderWindowDates("2026-10-03T17:00:00.001Z", "2026-10-10T17:00:00.001Z"))).toHaveLength(MAX_CANDIDATE_TUPLES);
  });
});
