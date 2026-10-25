import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ value: { contact: {}, patient: null, canChangePassword: false } as Record<string, unknown> }));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { ...props, href }, children),
}));
vi.mock("@/modules/account-settings/transport/settings-page-context", () => ({
  getSettingsPageContext: () => Promise.resolve(context.value),
}));
vi.mock("./contact-settings-form", () => ({ ContactSettingsForm: () => createElement("form", null, "contact") }));

import SettingsPage from "./page";

describe("settings page password entry (UI-4: moved out of navigation)", () => {
  it.each([
    [true, true],
    [false, false],
  ])("links to the password change page when canChangePassword is %s", async (canChangePassword, shown) => {
    context.value = { contact: {}, patient: null, canChangePassword };
    const html = renderToStaticMarkup(await SettingsPage());

    expect(html.includes('href="/app/personal/password"')).toBe(shown);
    expect(html.includes('href="/app/line/account"')).toBe(shown);
    expect(html.includes("เปลี่ยนรหัสผ่าน")).toBe(shown);
    expect(html).toContain("<form>contact</form>");
  });
});
