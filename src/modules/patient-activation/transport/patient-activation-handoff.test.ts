import { UserStatus } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PatientActivationCandidateState } from "./action-state";

import { PatientActivationHandoff } from "../../../../app/app/patients/activation/patient-activation-handoff";

const mockedUseActionState = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: mockedUseActionState,
    useSyncExternalStore: () => "https://demi.test",
  };
});

vi.mock("@/modules/patient-activation/transport/server-actions", () => ({
  issuePatientActivationAction: vi.fn(),
}));

const baseCandidate: PatientActivationCandidateState = {
  userId: "11111111-1111-4111-8111-111111111111",
  patientProfileId: "22222222-2222-4222-8222-222222222222",
  hospitalId: "33333333-3333-4333-8333-333333333333",
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  accountStatus: UserStatus.PROVISIONED,
  activationStatus: "NOT_ISSUED",
  activationExpiresAt: null,
  activationMayBeIssued: true,
};

function render(candidate: PatientActivationCandidateState): string {
  return renderToStaticMarkup(
    createElement(PatientActivationHandoff, { candidate }),
  );
}

describe("Patient activation handoff presentation", () => {
  beforeEach(() => {
    mockedUseActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);
  });

  it("shows one explicit issue form for a Patient without an activation", () => {
    const markup = render(baseCandidate);

    expect(markup).toContain("ออกลิงก์เปิดใช้งาน");
    expect((markup.match(/<form\b/gu) ?? []).length).toBe(1);
  });

  it("shows reissue instead of exposing a previous raw link", () => {
    const markup = render({
      ...baseCandidate,
      activationStatus: "ISSUED",
      activationExpiresAt: "2026-08-16T12:00:00.000Z",
    });

    expect(markup).toContain("ลิงก์เดิมไม่สามารถเปิดดูซ้ำได้");
    expect(markup).toContain("ออกลิงก์ใหม่");
    expect(markup).not.toContain("patient-activation-token");
    expect((markup.match(/<form\b/gu) ?? []).length).toBe(1);
  });

  it("shows no issue form for an already active account", () => {
    const markup = render({
      ...baseCandidate,
      accountStatus: UserStatus.ACTIVE,
      activationStatus: "ACTIVE",
    });

    expect(markup).toContain("บัญชีผู้ป่วยเปิดใช้งานอยู่แล้ว");
    expect(markup).not.toContain("ออกลิงก์เปิดใช้งาน");
    expect(markup).not.toContain("<form");
  });

  it("prioritizes reconciliation when an ACTIVE account has an invalid provider mapping", () => {
    const markup = render({
      ...baseCandidate,
      accountStatus: UserStatus.ACTIVE,
      activationStatus: "RECONCILIATION_REQUIRED",
    });

    expect(markup).toContain("บัญชีนี้ต้องได้รับการตรวจสอบก่อนออกลิงก์ใหม่");
    expect(markup).not.toContain("บัญชีผู้ป่วยเปิดใช้งานอยู่แล้ว");
    expect(markup).not.toContain("ออกลิงก์เปิดใช้งาน");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<form");
  });

  it("uses the newly issued token for the fragment link presentation", () => {
    mockedUseActionState.mockReturnValue([
      {
        status: "SUCCESS",
        result: {
          outcome: "ISSUED",
          userId: baseCandidate.userId,
          patientProfileId: baseCandidate.patientProfileId,
          hospitalId: baseCandidate.hospitalId,
          activationToken: "raw-token-is-ephemeral",
          activationExpiresAt: "2026-08-16T12:00:00.000Z",
        },
      },
      vi.fn(),
      false,
    ]);

    const markup = render(baseCandidate);

    expect(markup).toContain("https://demi.test/activate/patient#raw-token-is-ephemeral");
    expect(markup).not.toContain("/activate/patient/raw-token-is-ephemeral");
    expect((markup.match(/<form\b/gu) ?? []).length).toBe(1);
  });
});
