import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  summary: vi.fn(),
  requireReadiness: vi.fn(),
  status: vi.fn(),
  history: vi.fn(),
  reconcile: vi.fn(),
  liffId: vi.fn(),
  loginEnv: vi.fn(),
  actor: vi.fn(),
  notificationPreference: vi.fn(),
  recoveryLineEnabled: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/modules/line/services/line-account-service", () => ({ getLineAccountSummary: mocks.summary }));
vi.mock("@/modules/line/services/line-disconnection-configuration", () => ({ requireLineDisconnectionReadiness: mocks.requireReadiness }));
vi.mock("@/modules/line/services/line-disconnection-service", () => ({
  getLineDisconnectionStatus: mocks.status,
  hasLineLifecycleHistoryForCurrentOwner: mocks.history,
}));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({ scheduleCurrentLineAccountReconciliation: mocks.reconcile }));
vi.mock("@/lib/env/server", () => ({
  getLineLiffId: mocks.liffId,
  getLineLoginEnv: mocks.loginEnv,
  isRecoveryLineEnabled: mocks.recoveryLineEnabled,
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("@/modules/appointments/services/appointment-line-notification-preference-service", () => ({
  getOwnAppointmentLineNotificationPreference: mocks.notificationPreference,
}));
vi.mock("./line-account-client", () => ({ LineAccountClient: () => null }));

import type { LineDisconnectionStatus } from "@/modules/line/services/line-disconnection-service";
import { UnauthenticatedError } from "@/shared/errors/application-error";
import LineAccountPage from "./page";

const linkedSummary = {
  status: "LINKED" as const,
  canUnlink: true,
  reachability: "FRIEND" as const,
  menuState: "APPLIED" as const,
  cleanupState: null,
};
const unlinkedSummary = {
  status: "UNLINKED" as const,
  canUnlink: false,
  reachability: null,
  menuState: null,
  cleanupState: "PENDING" as const,
};
const ineligibleSummary = {
  status: "INELIGIBLE" as const,
  canUnlink: false,
  reachability: null,
  menuState: null,
  cleanupState: null,
};
const readyInventory = { channels: [{ kind: "ACCOUNT", channelId: "1234567890", environment: "ACCOUNT" }] };
const confirmedStatus: LineDisconnectionStatus = {
  state: "REMOTE_CONFIRMED",
  canRelink: true,
  obligations: [],
};

type ClientProps = {
  initial: typeof linkedSummary | typeof unlinkedSummary | typeof ineligibleSummary | { status: "UNAUTHENTICATED" | "UNAVAILABLE"; canUnlink: false; reachability: null; menuState: null; cleanupState: null };
  disconnection?: LineDisconnectionStatus;
  lifecycleReadiness:
    | { state: "READY" }
    | { state: "DEGRADED"; history: "PRESENT" | "NONE" | "UNKNOWN" }
    | { state: "NOT_CHECKED" };
};

async function clientProps(): Promise<ClientProps> {
  const element = await LineAccountPage();
  return element.props as ClientProps;
}

describe("Account page readiness composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.summary.mockResolvedValue(linkedSummary);
    mocks.requireReadiness.mockResolvedValue(readyInventory);
    mocks.status.mockResolvedValue(confirmedStatus);
    mocks.history.mockResolvedValue(false);
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.liffId.mockReturnValue("1234567890-test");
    mocks.loginEnv.mockReturnValue({ DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org" });
    mocks.recoveryLineEnabled.mockReturnValue(false);
    mocks.actor.mockRejectedValue(new Error("no Patient session"));
    mocks.notificationPreference.mockResolvedValue(null);
  });

  it("preserves an authorized binding and local unlink when readiness and reconciliation fail", async () => {
    mocks.requireReadiness.mockRejectedValue(new Error("configuration or migration unavailable"));
    mocks.reconcile.mockRejectedValue(new Error("reconciliation unavailable"));

    const props = await clientProps();

    expect(props.initial).toEqual(linkedSummary);
    expect(props.initial.canUnlink).toBe(true);
    expect(props.disconnection).toBeUndefined();
    expect(props.lifecycleReadiness).toEqual({ state: "DEGRADED", history: "NONE" });
  });

  it("keeps historical eligibility unknown and disables ordinary Relink when configuration is unavailable", async () => {
    mocks.summary.mockResolvedValue(unlinkedSummary);
    mocks.requireReadiness.mockRejectedValue(new Error("partial MINI configuration"));
    mocks.history.mockResolvedValue(true);

    const props = await clientProps();

    expect(props.initial).toEqual(unlinkedSummary);
    expect(props.disconnection).toBeUndefined();
    expect(props.lifecycleReadiness).toEqual({ state: "DEGRADED", history: "PRESENT" });
  });

  it("never presents unavailable configuration as an unrestricted Relink, even without history", async () => {
    mocks.summary.mockResolvedValue(unlinkedSummary);
    mocks.requireReadiness.mockRejectedValue(new Error("migration unavailable"));
    mocks.history.mockResolvedValue(false);

    const props = await clientProps();

    expect(props.lifecycleReadiness).toEqual({ state: "DEGRADED", history: "NONE" });
  });

  it("restores server-derived eligibility and keeps provider-confirmed lifecycle status", async () => {
    mocks.status.mockResolvedValue(confirmedStatus);

    const props = await clientProps();

    expect(props.lifecycleReadiness).toEqual({ state: "READY" });
    expect(props.disconnection).toEqual(confirmedStatus);
    expect(mocks.status).toHaveBeenCalledWith({ inventory: readyInventory });
  });

  it("does not treat a Recovery release as remote confirmation after readiness returns", async () => {
    const recoveryReleased: LineDisconnectionStatus = {
      state: "RECOVERY_RELEASED_UNVERIFIED",
      canRelink: true,
      obligations: [{ id: "00000000-0000-4000-8000-000000000000", appName: "DEMI ทดสอบ", status: "RECOVERY_RELEASED_UNVERIFIED" }],
    };
    mocks.status.mockResolvedValue(recoveryReleased);

    const props = await clientProps();

    expect(props.disconnection?.state).toBe("RECOVERY_RELEASED_UNVERIFIED");
    expect(props.disconnection?.obligations[0]?.status).toBe("RECOVERY_RELEASED_UNVERIFIED");
  });

  it("keeps Account Summary independently unavailable and private on authentication or database failure", async () => {
    mocks.summary.mockRejectedValue(new Error("database unavailable"));

    const unavailable = await clientProps();
    expect(unavailable.initial).toMatchObject({ status: "UNAVAILABLE", canUnlink: false, reachability: null });
    expect(unavailable.lifecycleReadiness).toEqual({ state: "NOT_CHECKED" });
    expect(mocks.requireReadiness).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();

    mocks.summary.mockRejectedValue(new UnauthenticatedError());
    const unauthenticated = await clientProps();
    expect(unauthenticated.initial).toMatchObject({ status: "UNAUTHENTICATED", canUnlink: false, reachability: null });
    expect(unauthenticated.lifecycleReadiness).toEqual({ state: "NOT_CHECKED" });
  });

  it("does not read lifecycle history or schedule presentation for an ineligible owner without an unlinkable binding", async () => {
    mocks.summary.mockResolvedValue(ineligibleSummary);

    const props = await clientProps();

    expect(props.initial).toEqual(ineligibleSummary);
    expect(props.lifecycleReadiness).toEqual({ state: "NOT_CHECKED" });
    expect(mocks.requireReadiness).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("marks lifecycle state unknown when the history probe cannot verify the lifecycle table", async () => {
    mocks.summary.mockResolvedValue(unlinkedSummary);
    mocks.requireReadiness.mockRejectedValue(new Error("lifecycle migration unavailable"));
    mocks.history.mockRejectedValue(new Error("lifecycle migration unavailable"));

    const props = await clientProps();

    expect(props.lifecycleReadiness).toEqual({ state: "DEGRADED", history: "UNKNOWN" });
  });

  it("passes the current Patient SELF preference into the existing Account screen", async () => {
    const preference = { enabled: true, canEnable: true };
    mocks.actor.mockResolvedValue({ userId: "synthetic-user", roles: ["PATIENT"] });
    mocks.notificationPreference.mockResolvedValue(preference);

    const element = await LineAccountPage();

    expect(element.props.notificationPreference).toEqual(preference);
  });
});
