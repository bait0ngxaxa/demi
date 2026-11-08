// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LIFF_BROWSER_CONTEXT_KEY, type LiffBrowserContext } from "@/modules/line/domain/line-liff-browser";

const liffMocks = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  init: vi.fn(),
  isLoggedIn: vi.fn(() => true),
  isInClient: vi.fn(() => true),
  getContext: vi.fn(() => ({ viewType: "full" })),
}));
vi.mock("@line/liff", () => ({ default: liffMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

import { LineAccountClient, LineAccountScreen } from "./line-account-client";

/** Account LIFF -> Workspace LIFF navigation across Account screen states (mocked SDK; real transitions need device UAT). */
const WORKSPACE_LIFF_URL = "https://liff.line.me/1234567890-Workspace/app";
const emptyStatus = { reachability: null, menuState: null, cleanupState: null };

type ScreenProps = Parameters<typeof LineAccountScreen>[0];

let container: HTMLDivElement;
let root: Root;

function workspaceHref(
  initial: ScreenProps["initial"],
  state: Partial<Omit<ScreenProps, "initial" | "confirmationRef">> = {},
): string | null {
  act(() => root.render(
      <LineAccountScreen
        workspaceLiffUrl={state.workspaceLiffUrl ?? null}
        initial={initial}
        lifecycleReadiness={state.lifecycleReadiness ?? { state: "READY" }}
        notificationPreference={state.notificationPreference}
        preferenceUiGeneration={state.preferenceUiGeneration ?? 0}
        menuCheckPending={state.menuCheckPending}
        menuCheckComplete={state.menuCheckComplete}
        relinkEligibility={state.relinkEligibility ?? "ELIGIBLE"}
        currentPassword={state.currentPassword ?? ""}
        currentPasswordError={state.currentPasswordError ?? ""}
        accountStatus={state.accountStatus ?? initial.status}
        canUnlink={state.canUnlink ?? initial.canUnlink}
        linePasswordRecoveryAvailable={state.linePasswordRecoveryAvailable ?? false}
        liffState={state.liffState ?? "READY"}
        isInClient={state.isInClient ?? true}
        friendshipSupported={state.friendshipSupported ?? false}
        canRefreshReachability={state.canRefreshReachability ?? false}
        reachabilityBusy={state.reachabilityBusy ?? false}
        friendshipBusy={state.friendshipBusy ?? false}
        friendshipWarning={state.friendshipWarning ?? false}
        view={state.view ?? "READY"}
        successAction={state.successAction ?? null}
        message={state.message ?? ""}
        providerWarning={state.providerWarning ?? false}
        confirmationRef={createRef<HTMLButtonElement>()}
        onStartLineLogin={() => undefined}
        onBeginLink={() => undefined}
        onBeginUnlink={() => undefined}
        unlinkDisconnection={state.unlinkDisconnection}
        signOut={state.signOut}
        onRetrySignOut={() => undefined}
        onConfirmLink={() => undefined}
        onCurrentPasswordChange={() => undefined}
        onConfirmUnlink={() => undefined}
        onRequestFriendship={() => undefined}
        onRefreshReachability={() => undefined}
        onReturnToLine={() => undefined}
        onCancel={() => undefined}
        onRestart={() => undefined}
        onReload={() => undefined}
      />
  ));
  const link = [...container.querySelectorAll("a")].find((node) => node.textContent === "ใช้งาน DEMI ผ่านเว็บ");
  return link?.getAttribute("href") ?? null;
}

function setContext(value: LiffBrowserContext | null): void {
  if (value) window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify(value));
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Account LIFF -> Workspace LIFF navigation", () => {
  const linked = { ...emptyStatus, status: "LINKED" as const, canUnlink: true, reachability: "FRIEND" as const, menuState: "APPLIED" as const };
  const unlinked = { ...emptyStatus, status: "UNLINKED" as const, canUnlink: false };

  it.each([
    ["a linked account", linked, {}],
    ["a successful account link", linked, { view: "SUCCESS" as const, successAction: "LINK" as const }],
    ["an unlinked account", unlinked, {}],
    ["a failure", unlinked, { view: "FAILURE" as const, message: "ลองใหม่" }],
  ])("opens the Workspace LIFF URL from the Account LIFF after %s", (_label, initial, state) => {
    setContext({ current: "ACCOUNT", mini: false, workspace: null });
    expect(workspaceHref(initial, { ...state, workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe(WORKSPACE_LIFF_URL);
  });

  it("keeps /app in an ordinary browser, a MINI session and without Workspace configuration", () => {
    expect(workspaceHref(linked, { workspaceLiffUrl: WORKSPACE_LIFF_URL, isInClient: false })).toBe("/app");
    setContext({ current: "ACCOUNT", mini: true, workspace: null });
    expect(workspaceHref(linked, { workspaceLiffUrl: WORKSPACE_LIFF_URL })).toBe("/app");
    window.sessionStorage.clear();
    setContext({ current: "ACCOUNT", mini: false, workspace: null });
    expect(workspaceHref(linked, { workspaceLiffUrl: null })).toBe("/app");
  });

  describe("Account LIFF entry recording", () => {
    const client = (disconnection?: { state: "NONE" | "RECOVERY_REQUIRED"; canRelink: boolean; obligations: [] }): React.JSX.Element => (
      <LineAccountClient
        initial={{ ...emptyStatus, status: "UNLINKED", canUnlink: false }}
        liffId="1234567890-Account"
        publicOrigin="https://demi.example.org"
        linePasswordRecoveryAvailable={false}
        lifecycleReadiness={{ state: "READY" }}
        disconnection={disconnection}
        workspaceLiffUrl={WORKSPACE_LIFF_URL}
      />
    );

    beforeEach(() => {
      liffMocks.init.mockReset().mockResolvedValue(undefined);
      liffMocks.isInClient.mockReset().mockReturnValue(true);
    });

    it("initializes the Account LIFF ID and records the Account LIFF only in the LIFF browser", async () => {
      await act(async () => root.render(client()));
      await act(async () => { await Promise.resolve(); });
      expect(liffMocks.init).toHaveBeenCalledWith({ liffId: "1234567890-Account" });
      expect(JSON.parse(window.sessionStorage.getItem(LIFF_BROWSER_CONTEXT_KEY) ?? "null")).toEqual({ current: "ACCOUNT", mini: false, workspace: null });
      const link = [...container.querySelectorAll("a")].find((node) => node.textContent === "ใช้งาน DEMI ผ่านเว็บ");
      expect(link?.getAttribute("href")).toBe(WORKSPACE_LIFF_URL);
    });

    it("records nothing in an external browser", async () => {
      liffMocks.isInClient.mockReturnValue(false);
      await act(async () => root.render(client()));
      await act(async () => { await Promise.resolve(); });
      expect(window.sessionStorage.getItem(LIFF_BROWSER_CONTEXT_KEY)).toBeNull();
    });

    it("keeps Full Disconnection recovery gating: no Account LIFF init or entry while relink is blocked", async () => {
      await act(async () => root.render(client({ state: "RECOVERY_REQUIRED", canRelink: false, obligations: [] })));
      await act(async () => { await Promise.resolve(); });
      expect(liffMocks.init).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(LIFF_BROWSER_CONTEXT_KEY)).toBeNull();
    });
  });
});
