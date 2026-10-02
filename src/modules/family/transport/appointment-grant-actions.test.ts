import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), propose: vi.fn(), accept: vi.fn(), revoke: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/appointment-grant-service", () => ({ proposeAppointmentGrant: mocks.propose, acceptAppointmentGrant: mocks.accept, revokeAppointmentGrant: mocks.revoke }));
import { acceptAppointmentGrantAction, proposeAppointmentGrantAction, revokeAppointmentGrantAction } from "./appointment-grant-actions";
const actor = { userId: "current-account" };
beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue(actor); });
describe("Family grant server actions", () => {
  it("derives actor and forwards only exact proposal locators", async () => {
    const form = new FormData(); form.set("caregiverRelationshipId", "parent"); form.set("patientHospitalRelationshipId", "phr"); form.set("contractVersion", "untrusted"); form.set("patientProfileId", "foreign");
    expect(await proposeAppointmentGrantAction({ status: "IDLE" }, form)).toMatchObject({ status: "SUCCESS" });
    expect(mocks.propose).toHaveBeenCalledWith(actor, { caregiverRelationshipId: "parent", patientHospitalRelationshipId: "phr" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/family/grants/[grantId]/appointments/[appointmentId]", "page");
  });
  it.each(["accept", "revoke"] as const)("%s targets exact grant and safe errors reveal no policy/data", async (kind) => {
    const action = kind === "accept" ? acceptAppointmentGrantAction : revokeAppointmentGrantAction;
    const service = mocks[kind]; const form = new FormData(); form.set("grantId", "grant");
    expect(await action({ status: "IDLE" }, form)).toMatchObject({ status: "SUCCESS" });
    expect(service).toHaveBeenCalledWith(actor, "grant");
    mocks.revalidate.mockClear(); service.mockRejectedValue(new Error("SECRET Patient SQL"));
    const result = await action({ status: "IDLE" }, form);
    expect(result.status).toBe("ERROR"); expect(JSON.stringify(result)).not.toContain("SECRET"); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not mutate if authenticated actor resolution fails", async () => {
    mocks.actor.mockRejectedValue(new Error("unauthenticated"));
    expect((await proposeAppointmentGrantAction({ status: "IDLE" }, new FormData())).status).toBe("ERROR");
    expect(mocks.propose).not.toHaveBeenCalled();
  });
});
