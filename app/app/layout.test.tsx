import React from "react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_QUICK_ACTION_RETURN_TO_HEADER } from "@/modules/line/domain/line-navigation-intents";
import { UnauthenticatedError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  getProtectedApplicationActor: vi.fn(),
  headers: vi.fn(),
  connection: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getProtectedApplicationActor,
}));

import ProtectedApplicationLayout from "./layout";

async function renderProtectedShell(): Promise<React.JSX.Element> {
  const layoutElement = ProtectedApplicationLayout({ children: React.createElement("main") }) as ReactElement<{
    children: ReactNode;
  }>;
  const protectedShell = layoutElement.props.children as ReactElement<{ children: ReactNode }>;
  if (typeof protectedShell.type !== "function") {
    throw new Error("Expected the protected application shell component");
  }

  const renderShell = protectedShell.type as unknown as (props: { children: ReactNode }) => Promise<React.JSX.Element>;
  return renderShell(protectedShell.props);
}

describe("protected application login redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.headers.mockResolvedValue(new Headers({
      [LINE_QUICK_ACTION_RETURN_TO_HEADER]: "/app/patients/assigned?task=screening",
    }));
    mocks.getProtectedApplicationActor.mockRejectedValue(new UnauthenticatedError());
  });

  it("preserves the exact screened-patient task through the parent layout guard", async () => {
    await expect(renderProtectedShell()).rejects.toThrow(
      "NEXT_REDIRECT:/login?returnTo=%2Fapp%2Fpatients%2Fassigned%3Ftask%3Dscreening",
    );
  });

  it("ignores an unapproved request header and keeps the plain login boundary", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      [LINE_QUICK_ACTION_RETURN_TO_HEADER]: "https://attacker.example/",
    }));

    await expect(renderProtectedShell()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
