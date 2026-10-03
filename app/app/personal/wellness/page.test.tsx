import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
const mock = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), connection: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/server", () => ({ connection: mock.connection }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mock.actor }));
vi.mock("@/modules/meals/services/personal-meal-query-service", () => ({ listOwnPersonalMeals: mock.list }));
vi.mock("./personal-meal-workspace", () => ({ PersonalMealWorkspace: () => <p>ข้อมูลที่คุณบันทึก</p> }));
import Page from "./page";
describe("private Meal page", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.actor.mockResolvedValue({ userId: "own", personId: "person" }); mock.list.mockResolvedValue({ items: [], nextCursor: null }); });
  it("uses request-time rendering then authenticated own service with no browser owner/filter", async () => {
    expect(renderToStaticMarkup(await Page())).toContain("ข้อมูลที่คุณบันทึก"); expect(mock.connection).toHaveBeenCalledOnce(); expect(mock.list).toHaveBeenCalledWith({ userId: "own", personId: "person" }, {});
  });
  it.each([{ error: new UnauthenticatedError(), path: "/login" }, { error: new ForbiddenError(), path: "/app" }])("denies safely via $path", async ({ error, path }) => {
    mock.actor.mockRejectedValue(error); await expect(Page()).rejects.toThrow(`redirect:${path}`); expect(mock.list).not.toHaveBeenCalled();
  });
});
