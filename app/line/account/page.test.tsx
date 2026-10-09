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
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/modules/line/services/line-account-service", () => ({ getLineAccountSummary: mocks.summary }));
vi.mock("@/modules/line/services/line-disconnection-configuration", () => ({ requireLineDisconnectionReadiness: mocks.requireReadiness }));
vi.mock("@/modules/line/services/line-disconnection-service", () => ({
  getLineDisconnectionStatus: mocks.status,
  hasLineLifecycleHistoryForCurrentOwner: mocks.history,
}));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({ scheduleCurrentLineAccountReconciliation: mocks.reconcile }));
vi.mock("@/lib/env/server", () => ({ getLineLiffId: mocks.liffId, getLineLoginEnv: mocks.loginEnv }));
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
const readyConfiguration = { inventory: { revision: "synthetic" } };
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
    | { state: "STAGED" }
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
    mocks.requireReadiness.mockResolvedValue(null);
    mocks.status.mockResolvedValue(confirmedStatus);
    mocks.history.mockResolvedValue(false);
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.liffId.mockReturnValue("1234567890-test");
    mocks.loginEnv.mockReturnValue({ DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org" });
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

  it("keeps historical eligibility unknown and disables ordinary Relink when configuration is staged", async () => {
    mocks.summary.mockResolvedValue(unlinkedSummary);
    mocks.requireReadiness.mockResolvedValue(null);
    mocks.history.mockResolvedValue(true);

    const props = await clientProps();

    expect(props.initial).toEqual(unlinkedSummary);
    expect(props.disconnection).toBeUndefined();
    expect(props.lifecycleReadiness).toEqual({ state: "DEGRADED", history: "PRESENT" });
  });

  it("marks the disabled rollout staged only after confirming no recorded termination history", async () => {
    mocks.summary.mockResolvedValue(unlinkedSummary);
    mocks.requireReadiness.mockResolvedValue(null);
    mocks.history.mockResolvedValue(false);

    const props = await clientProps();

    expect(props.lifecycleReadiness).toEqual({ state: "STAGED" });
  });

  it("restores server-derived eligibility and keeps provider-confirmed lifecycle status", async () => {
    mocks.requireReadiness.mockResolvedValue(readyConfiguration);
    mocks.status.mockResolvedValue(confirmedStatus);

    const props = await clientProps();

    expect(props.lifecycleReadiness).toEqual({ state: "READY" });
    expect(props.disconnection).toEqual(confirmedStatus);
  });

  it("does not treat a Recovery release as remote confirmation after readiness returns", async () => {
    mocks.requireReadiness.mockResolvedValue(readyConfiguration);
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
    mocks.requireReadiness.mockResolvedValue(null);
    mocks.history.mockRejectedValue(new Error("lifecycle migration unavailable"));

    const props = await clientProps();

    expect(props.lifecycleReadiness).toEqual({ state: "DEGRADED", history: "UNKNOWN" });
  });
});
