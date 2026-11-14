import React from "react";
import type { ReactElement, ReactNode } from "react";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_QUICK_ACTION_RETURN_TO_HEADER } from "@/modules/line/domain/line-navigation-intents";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { initialLoginActionState } from "./action-state";

const mocks = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn(),
  getProtectedApplicationActor: vi.fn(),
  headers: vi.fn(),
  connection: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  authenticateWithPassword: vi.fn(),
  revalidatePath: vi.fn(),
  pendingActions: vi.fn(),
}));

vi.mock("@/lib/auth/supabase-proxy", () => ({
  PUBLIC_CAREGIVER_INVITATION_PAGE_HEADER: "x-demi-public-caregiver-invitation",
  updateSupabaseSession: mocks.updateSupabaseSession,
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getProtectedApplicationActor,
}));
vi.mock("@/modules/auth/services/authentication-service", () => ({
  authenticateWithPassword: mocks.authenticateWithPassword,
  signOutCurrentSession: vi.fn(),
}));
vi.mock("@/modules/auth/services/actor-context-service", () => ({
  resolveCurrentActorContext: vi.fn(),
  resolveCurrentActorAccess: vi.fn(),
}));
vi.mock("@/modules/pending-actions/services/pending-action-service", () => ({
  getPendingActions: mocks.pendingActions,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: mocks.connection };
});
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import ProtectedApplicationLayout from "../../../../app/app/layout";
import { WorkspaceLiffHistory } from "../../../../app/workspace-liff-history";
import { proxy } from "../../../../proxy";
import { loginAction } from "./server-actions";

async function renderProtectedShell(): Promise<React.JSX.Element> {
  const layoutElement = ProtectedApplicationLayout({
    children: React.createElement("main"),
  }) as ReactElement<{ children: ReactNode }>;
  // History observation shares the boundary; invoke the protected server shell, not the observer.
  const suspense = React.Children.toArray(layoutElement.props.children)
    .find((child): child is ReactElement<{ children: ReactNode }> => React.isValidElement(child) && child.type === React.Suspense);
  if (!suspense) throw new Error("Expected the protected Suspense boundary");
  const protectedShell = React.Children.toArray(suspense.props.children)
    .find((child): child is ReactElement<{ children: ReactNode }> => React.isValidElement(child) &&
      typeof child.type === "function" && child.type !== WorkspaceLiffHistory);
  if (!protectedShell) {
    throw new Error("Expected the protected application shell component");
  }

  const renderShell = protectedShell.type as unknown as (props: { children: ReactNode }) => Promise<React.JSX.Element>;
  return renderShell(protectedShell.props);
}

function getRedirectDestination(error: unknown): string {
  if (!(error instanceof Error) || !error.message.startsWith("NEXT_REDIRECT:")) {
    throw error;
  }
  return error.message.slice("NEXT_REDIRECT:".length);
}

describe("unauthenticated LINE quick-action login flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.pendingActions.mockResolvedValue({ status: "READY", checkedAt: 0, indicators: [] });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getProtectedApplicationActor.mockRejectedValue(new UnauthenticatedError());
    mocks.authenticateWithPassword.mockResolvedValue({
      status: "AUTHORIZED",
      actor: {
        userId: "test-user",
        personId: "test-person",
        roles: [],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
    });
    mocks.updateSupabaseSession.mockResolvedValue(NextResponse.next());
  });

  it("carries the exact screening task from Proxy through the parent layout and successful login", async () => {
    const request = new NextRequest(
      "https://demi.example.org/app/patients/assigned?task=screening",
    );
    await proxy(request);
    const [, proxyValidatedReturnTo] = mocks.updateSupabaseSession.mock.calls[0] as [
      NextRequest,
      string | null,
    ];
    if (!proxyValidatedReturnTo) {
      throw new Error("Proxy did not supply a validated quick-action return path");
    }
    expect(proxyValidatedReturnTo).toBe("/app/patients/assigned?task=screening");

    mocks.headers.mockResolvedValue(new Headers({
      [LINE_QUICK_ACTION_RETURN_TO_HEADER]: proxyValidatedReturnTo,
    }));
    let loginLocation = "";
    try {
      await renderProtectedShell();
    } catch (error: unknown) {
      loginLocation = getRedirectDestination(error);
    }
    expect(loginLocation).toBe(
      "/login?returnTo=%2Fapp%2Fpatients%2Fassigned%3Ftask%3Dscreening",
    );
    expect(mocks.pendingActions).not.toHaveBeenCalled();

    const loginForm = new FormData();
    loginForm.set("nationalId", "DEMI-ADMIN-ROOT");
    loginForm.set("password", "test-password");
    loginForm.set("returnTo", new URL(loginLocation, "https://demi.example.org").searchParams.get("returnTo") ?? "");

    await expect(loginAction(initialLoginActionState, loginForm)).rejects.toThrow(
      "NEXT_REDIRECT:/app/patients/assigned?task=screening",
    );
    expect(mocks.authenticateWithPassword).toHaveBeenCalledOnce();
  });

  async function loginThroughLiffEntry(url: string): Promise<{ loginLocation: string; finalDestination: string }> {
    await proxy(new NextRequest(url));
    const [, proxyValidatedReturnTo] = mocks.updateSupabaseSession.mock.calls.at(-1) as [NextRequest, string | null];
    mocks.headers.mockResolvedValue(new Headers(proxyValidatedReturnTo ? { [LINE_QUICK_ACTION_RETURN_TO_HEADER]: proxyValidatedReturnTo } : {}));
    let loginLocation = "";
    try {
      await renderProtectedShell();
    } catch (error: unknown) {
      loginLocation = getRedirectDestination(error);
    }
    const loginForm = new FormData();
    loginForm.set("nationalId", "DEMI-ADMIN-ROOT");
    loginForm.set("password", "test-password");
    const returnTo = new URL(loginLocation, "https://demi.example.org").searchParams.get("returnTo");
    if (returnTo !== null) loginForm.set("returnTo", returnTo);
    let finalDestination = "";
    try {
      await loginAction(initialLoginActionState, loginForm);
    } catch (error: unknown) {
      finalDestination = getRedirectDestination(error);
    }
    return { loginLocation, finalDestination };
  }

  it.each([
    ["Patient wellness", "https://demi.example.org/app/personal/wellness", "/app/personal/wellness"],
    ["Patient medication after an in-LINE login added liff.hback", "https://demi.example.org/app/personal/medications?liff.hback=2", "/app/personal/medications"],
    ["OSM screening on Android", "https://demi.example.org/app/patients/assigned?task=screening&lineAppVersion=14.19.1&liff.hback=2", "/app/patients/assigned?task=screening"],
  ])("returns %s to its approved destination across LIFF redirects", async (_label, url, expected) => {
    const { loginLocation, finalDestination } = await loginThroughLiffEntry(url);
    expect(loginLocation).toBe(`/login?returnTo=${encodeURIComponent(expected)}`);
    expect(finalDestination).toBe(expected);
  });

  it.each([
    ["Hospital work dashboard", "https://demi.example.org/app?liff.hback=2"],
    ["an injected external return", "https://demi.example.org/app/personal?liff.hback=2&returnTo=https%3A%2F%2Fevil.example"],
    ["an unauthorized resource", "https://demi.example.org/app/hospitals/11111111-1111-4111-8111-111111111111?liff.hback=2"],
    ["a conflicting task", "https://demi.example.org/app/patients/assigned?task=screening&task=followup&liff.hback=2"],
    ["a MINI gateway return", "https://demi.example.org/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS&liff.hback=2"],
  ])("sends %s through plain DEMI login without a quick-action return", async (_label, url) => {
    const { loginLocation, finalDestination } = await loginThroughLiffEntry(url);
    expect(loginLocation).toBe("/login");
    expect(finalDestination).not.toContain("evil.example");
    expect(finalDestination).not.toContain("liff.");
    expect(finalDestination).not.toContain("hospitals/");
  });

  it("keeps an authenticated session on the requested page without any login redirect", async () => {
    mocks.getProtectedApplicationActor.mockResolvedValue({ userId: "u", personId: "p", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] });
    await proxy(new NextRequest("https://demi.example.org/app/personal/medications?liff.hback=2"));
    mocks.headers.mockResolvedValue(new Headers({ [LINE_QUICK_ACTION_RETURN_TO_HEADER]: "/app/personal/medications" }));
    await expect(renderProtectedShell()).resolves.toBeDefined();
    expect(mocks.pendingActions).toHaveBeenCalledExactlyOnceWith("u");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([new ForbiddenError(), new UnauthenticatedError()])("routes an indicator access denial through protected login handling (%s)", async (error) => {
    mocks.getProtectedApplicationActor.mockResolvedValue({ userId: "u", personId: "p", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] });
    mocks.headers.mockResolvedValue(new Headers({ [LINE_QUICK_ACTION_RETURN_TO_HEADER]: "/app/personal/medications" }));
    mocks.pendingActions.mockRejectedValue(error);
    await expect(renderProtectedShell()).rejects.toThrow("NEXT_REDIRECT:/login?returnTo=%2Fapp%2Fpersonal%2Fmedications");
  });

  it("keeps the authorized shell available when indicators are UNAVAILABLE", async () => {
    mocks.getProtectedApplicationActor.mockResolvedValue({ userId: "u", personId: "p", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] });
    mocks.pendingActions.mockResolvedValue({ status: "UNAVAILABLE", checkedAt: 0 });
    const shell = await renderProtectedShell() as ReactElement<{ children: ReactElement<{ pendingActionsStatus: string }> }>;
    expect(shell.props.children.props.pendingActionsStatus).toBe("UNAVAILABLE");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not convert an unexpected failure outside the isolated contract into an empty queue", async () => {
    const error = new Error("unexpected indicator defect");
    mocks.getProtectedApplicationActor.mockResolvedValue({ userId: "u", personId: "p", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] });
    mocks.pendingActions.mockRejectedValue(error);
    await expect(renderProtectedShell()).rejects.toBe(error);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
