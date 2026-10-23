import React from "react";
import type { ReactElement, ReactNode } from "react";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_QUICK_ACTION_RETURN_TO_HEADER } from "@/modules/line/domain/line-navigation-intents";
import { UnauthenticatedError } from "@/shared/errors/application-error";
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
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: mocks.connection };
});
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import ProtectedApplicationLayout from "../../../../app/app/layout";
import { proxy } from "../../../../proxy";
import { loginAction } from "./server-actions";

async function renderProtectedShell(): Promise<React.JSX.Element> {
  const layoutElement = ProtectedApplicationLayout({
    children: React.createElement("main"),
  }) as ReactElement<{ children: ReactNode }>;
  const protectedShell = layoutElement.props.children as ReactElement<{ children: ReactNode }>;
  if (typeof protectedShell.type !== "function") {
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

    const loginForm = new FormData();
    loginForm.set("nationalId", "DEMI-ADMIN-ROOT");
    loginForm.set("password", "test-password");
    loginForm.set("returnTo", new URL(loginLocation, "https://demi.example.org").searchParams.get("returnTo") ?? "");

    await expect(loginAction(initialLoginActionState, loginForm)).rejects.toThrow(
      "NEXT_REDIRECT:/app/patients/assigned?task=screening",
    );
    expect(mocks.authenticateWithPassword).toHaveBeenCalledOnce();
  });
});
