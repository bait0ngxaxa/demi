import { HospitalContentCategory, HospitalContentStatus, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { hospitalContentPublicationTimes, nextHospitalContentVersion } from "./hospital-content";
import { decideHospitalContentMutation, type HospitalContentMutationCurrent } from "./hospital-content-mutation";
import { hospitalContentServiceInternals } from "../services/hospital-content-service";

const updatedAt = new Date("2026-10-05T12:00:00.000Z");
const expectedUpdatedAt = updatedAt.toISOString();
const current: HospitalContentMutationCurrent = {
  title: "หัวข้อ",
  body: "เนื้อหา",
  category: HospitalContentCategory.OTHER,
  sourceText: null,
  status: HospitalContentStatus.DRAFT,
  updatedAt,
};
const desired = { ...current, updatedAt: undefined };

describe("Hospital Content lifecycle decisions", () => {
  it("supports changed DRAFT edit, NOOP, publish, withdraw and archive", () => {
    expect(decideHospitalContentMutation({ command: "EDIT", current, expectedUpdatedAt, desired: { ...desired, title: "หัวข้อใหม่" } })).toBe("UPDATED");
    expect(decideHospitalContentMutation({ command: "EDIT", current, expectedUpdatedAt, desired })).toBe("NOOP");
    expect(decideHospitalContentMutation({ command: "PUBLISH", current, expectedUpdatedAt })).toBe("PUBLISHED");
    expect(decideHospitalContentMutation({ command: "WITHDRAW", current: { ...current, status: HospitalContentStatus.PUBLISHED }, expectedUpdatedAt })).toBe("WITHDRAWN");
    expect(decideHospitalContentMutation({ command: "ARCHIVE", current, expectedUpdatedAt })).toBe("ARCHIVED");
    expect(decideHospitalContentMutation({ command: "ARCHIVE", current: { ...current, status: HospitalContentStatus.PUBLISHED }, expectedUpdatedAt })).toBe("ARCHIVED");
  });

  it("checks the version before equality or lifecycle and keeps archived state terminal", () => {
    expect(decideHospitalContentMutation({ command: "EDIT", current, expectedUpdatedAt: "2026-10-05T12:00:00.001Z", desired })).toBe("CONFLICT");
    expect(decideHospitalContentMutation({ command: "EDIT", current: { ...current, status: HospitalContentStatus.PUBLISHED }, expectedUpdatedAt, desired })).toBe("CONFLICT");
    expect(decideHospitalContentMutation({ command: "PUBLISH", current: { ...current, status: HospitalContentStatus.PUBLISHED }, expectedUpdatedAt })).toBe("CONFLICT");
    expect(decideHospitalContentMutation({ command: "WITHDRAW", current, expectedUpdatedAt })).toBe("CONFLICT");
    for (const command of ["EDIT", "PUBLISH", "WITHDRAW", "ARCHIVE"] as const) {
      expect(decideHospitalContentMutation({ command, current: { ...current, status: HospitalContentStatus.ARCHIVED }, expectedUpdatedAt, desired })).toBe("CONFLICT");
    }
  });
});

describe("Hospital Content version and publication time", () => {
  it("advances updatedAt for same-millisecond and backward server clocks", () => {
    expect(nextHospitalContentVersion(updatedAt, updatedAt).toISOString()).toBe("2026-10-05T12:00:00.001Z");
    expect(nextHospitalContentVersion(new Date("2026-10-05T11:59:00.000Z"), updatedAt).toISOString()).toBe("2026-10-05T12:00:00.001Z");
  });

  it("sets first publication to the real event instant and permits same-ms republication", () => {
    const firstEvent = new Date("2026-10-05T12:00:00.000Z");
    const first = hospitalContentPublicationTimes(null, null, firstEvent);
    expect(first.firstPublishedAt.toISOString()).toBe(firstEvent.toISOString());
    expect(first.latestPublishedAt.toISOString()).toBe(firstEvent.toISOString());

    const republished = hospitalContentPublicationTimes(first.firstPublishedAt, first.latestPublishedAt, firstEvent);
    expect(republished.firstPublishedAt.toISOString()).toBe(first.firstPublishedAt.toISOString());
    expect(republished.latestPublishedAt.toISOString()).toBe(first.latestPublishedAt.toISOString());
    expect(nextHospitalContentVersion(firstEvent, firstEvent).toISOString()).toBe("2026-10-05T12:00:00.001Z");
  });

  it("uses the later real event instant and rejects a backward clock or one-null pair", () => {
    const first = new Date("2026-10-05T12:00:00.000Z");
    const later = new Date("2026-10-05T12:00:01.000Z");
    expect(hospitalContentPublicationTimes(first, first, later).latestPublishedAt.toISOString()).toBe(later.toISOString());
    expect(() => hospitalContentPublicationTimes(first, first, new Date(first.getTime() - 1))).toThrow();
    expect(() => hospitalContentPublicationTimes(first, null, later)).toThrow();
  });
});

describe("Hospital Content transaction retry classification", () => {
  it("retries only PostgreSQL deadlocks and confirmed Prisma transaction conflicts", () => {
    const prismaConflict = new Prisma.PrismaClientKnownRequestError("serialization conflict", {
      code: "P2034",
      clientVersion: "test",
    });
    expect(hospitalContentServiceInternals.isRetryableTransactionFailure(prismaConflict)).toBe(true);
    expect(hospitalContentServiceInternals.isRetryableTransactionFailure({ code: "40P01" })).toBe(true);
    expect(hospitalContentServiceInternals.isRetryableTransactionFailure({ cause: { meta: { sqlState: "40P01" } } })).toBe(true);
    expect(hospitalContentServiceInternals.isRetryableTransactionFailure({ code: "P2002" })).toBe(false);
    expect(hospitalContentServiceInternals.isRetryableTransactionFailure(new Error("network timeout"))).toBe(false);
    expect(hospitalContentServiceInternals.MAX_TRANSACTION_ATTEMPTS).toBe(3);
    expect(hospitalContentServiceInternals.RETRY_DELAYS_MS).toEqual([25, 50]);
  });
});
