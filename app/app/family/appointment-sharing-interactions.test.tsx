// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  revokeAppointment: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  acceptAppointment: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  proposeAppointment: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  revokeResource: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  acceptResource: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  proposeResource: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
}));

vi.mock("@/modules/family/transport/appointment-grant-actions", () => ({
  revokeAppointmentGrantAction: actions.revokeAppointment,
  acceptAppointmentGrantAction: actions.acceptAppointment,
  proposeAppointmentGrantAction: actions.proposeAppointment,
  revokeResourceGrantAction: actions.revokeResource,
  acceptResourceGrantAction: actions.acceptResource,
  proposeResourceGrantAction: actions.proposeResource,
}));

import { FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS } from "@/modules/family/domain/appointment-grant-contract";
import type { AppointmentGrantManagement, AppointmentGrantManagementItem } from "@/modules/family/services/appointment-grant-management-query-service";
import type { ResourceGrantManagement, ResourceGrantManagementItem } from "@/modules/family/services/caregiver-resource-grant-service";
import { findButton, installDialogSupport, restoreDialogSupport, settle, submitForm } from "../workforce/[kind]/[relationshipId]/controls-test-support";
import { AppointmentSharingWorkspace } from "./appointment-sharing-workspace";

const participant = { givenName: "สมชาย", familyName: "ใจดี" };
const now = new Date("2026-10-02T00:00:00.000Z");
const patientGrant: AppointmentGrantManagementItem = {
    grantId: "appointment-grant-selected",
    participant,
    hospitalName: "หน่วยบริการทดสอบ",
    status: "ACTIVE",
    proposedAt: now,
    acceptedAt: now,
    revokedAt: null,
    contractVersion: "family-appointment-read-v3",
  };
const caregiverGrant: AppointmentGrantManagement["caregiver"]["grants"][number] = {
  ...patientGrant,
  grantId: "appointment-grant-pending",
  status: "PENDING",
  acceptedAt: null,
};
const management: AppointmentGrantManagement = {
  patient: { grants: [patientGrant], nextCursor: null, hospitals: [], nextHospitalsCursor: null },
  caregiver: { grants: [caregiverGrant], nextCursor: null },
};
const resourceGrant: ResourceGrantManagementItem = {
  grantId: "resource-grant-selected",
  caregiverRelationshipId: "caregiver-relationship-selected",
  resource: "PROFILE_SUMMARY",
  status: "ACTIVE",
  proposedAt: now,
  acceptedAt: now,
  participant,
};
const resources: ResourceGrantManagement = {
  patient: [resourceGrant],
  caregiver: [],
  availableResources: ["PROFILE_SUMMARY"],
};

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installDialogSupport();
});

afterAll(() => restoreDialogSupport());

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset().mockResolvedValue({ status: "SUCCESS", message: "บันทึกแล้ว" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function dialogButton(text: string): HTMLButtonElement {
  const dialog = container.querySelector<HTMLDialogElement>("dialog[open]");
  const button = Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`Missing dialog button: ${text}`);
  return button;
}

describe("appointment and resource grant interactions", () => {
  it("confirms the selected appointment revocation while caregiver consent remains explicit and inline", async () => {
    act(() => root.render(createElement(AppointmentSharingWorkspace, { management, relationships: [] })));
    expect(container.textContent).toContain(FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS[caregiverGrant.contractVersion]);

    const revoke = findButton(container, "ยกเลิกสิทธิ์ดูนัดหมาย");
    await act(async () => revoke.click());
    expect(actions.revokeAppointment).not.toHaveBeenCalled();
    expect(container.querySelector("dialog[open]")?.textContent).toContain("สมชาย ใจดี");
    expect(container.querySelector("dialog[open]")?.textContent).toContain("หน่วยบริการทดสอบ");
    expect(container.querySelector("dialog[open]")?.textContent).toContain("เสนอสิทธิ์ใหม่และให้ผู้ดูแลยอมรับ");
    await act(async () => dialogButton("ยกเลิก").click());
    expect(actions.revokeAppointment).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(revoke);

    await act(async () => revoke.click());
    await act(async () => dialogButton("ยกเลิกสิทธิ์ดูนัดหมาย").click());
    await settle();
    expect(actions.revokeAppointment).toHaveBeenCalledOnce();
    expect(actions.revokeAppointment.mock.calls[0]?.[1].get("grantId")).toBe("appointment-grant-selected");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(container.querySelector('button[aria-label^="ยกเลิกสิทธิ์ดูนัดหมาย:"]')).toBeNull();

    submitForm(container, "ยอมรับสิทธิ์ดูนัดหมาย");
    await settle();
    expect(actions.acceptAppointment).toHaveBeenCalledOnce();
    expect(actions.acceptAppointment.mock.calls[0]?.[1].get("grantId")).toBe("appointment-grant-pending");
    expect(container.querySelector("dialog[open]")).toBeNull();
  });

  it("identifies the resource and selected caregiver before revoking its grant", async () => {
    act(() => root.render(createElement(AppointmentSharingWorkspace, { management, relationships: [], resources })));
    const resourceRow = Array.from(container.querySelectorAll("li")).find((item) => item.textContent?.includes("ข้อมูลทั่วไป"));
    if (!resourceRow) throw new Error("Missing resource grant row");
    const revoke = findButton(resourceRow, "ยกเลิกสิทธิ์");
    await act(async () => revoke.click());
    expect(actions.revokeResource).not.toHaveBeenCalled();
    expect(container.querySelector("dialog[open]")?.textContent).toContain("ข้อมูลทั่วไป");
    expect(container.querySelector("dialog[open]")?.textContent).toContain("สมชาย ใจดี");
    await act(async () => dialogButton("ยกเลิก").click());
    expect(actions.revokeResource).not.toHaveBeenCalled();

    await act(async () => revoke.click());
    await act(async () => dialogButton("ยกเลิกสิทธิ์").click());
    await settle();
    expect(actions.revokeResource).toHaveBeenCalledOnce();
    expect(actions.revokeResource.mock.calls[0]?.[1].get("grantId")).toBe("resource-grant-selected");
    expect(revoke.isConnected).toBe(false);
  });
});
