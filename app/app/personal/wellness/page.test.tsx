import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
const mock = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), exercises: vi.fn(), connection: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/server", () => ({ connection: mock.connection }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mock.actor }));
vi.mock("@/modules/meals/services/personal-meal-query-service", () => ({ listOwnPersonalMeals: mock.list }));
vi.mock("@/modules/exercises/services/personal-exercise-query-service", () => ({ listOwnPersonalExercises: mock.exercises }));
vi.mock("./personal-wellness-workspace", () => ({ PersonalWellnessWorkspace: () => <p>ข้อมูลที่คุณบันทึก</p> }));
import Page from "./page";
describe("private Wellness page", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.actor.mockResolvedValue({ userId: "own", personId: "person" }); mock.list.mockResolvedValue({ items: [], nextCursor: null }); mock.exercises.mockResolvedValue({ items: [], nextCursor: null }); });
  it("uses request-time rendering then authenticated own service with no browser owner/filter", async () => {
    expect(renderToStaticMarkup(await Page())).toContain("ข้อมูลที่คุณบันทึก"); expect(mock.connection).toHaveBeenCalledOnce(); expect(mock.exercises).toHaveBeenCalledWith({ userId: "own", personId: "person" }, {}); expect(mock.list).toHaveBeenCalledWith({ userId: "own", personId: "person" }, {});
  });
  it("uses opaque actor remount key and independent fresh create nonces", async () => {
    const first = await Page(); mock.actor.mockResolvedValue({ userId: "second", personId: "other" }); const second = await Page();
    expect(first.key).not.toBe(second.key); expect(first.key).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.props.mealNonce).not.toBe(first.props.exerciseNonce);
    expect(second.props.mealNonce).not.toBe(first.props.mealNonce);
    expect(JSON.stringify(first.props)).not.toMatch(/userId|personId|patientProfileId/u);
  });
  it.each(["list", "exercises"] as const)("renders neither private section when %s denies", async (service) => {
    mock[service].mockRejectedValue(new ForbiddenError()); await expect(Page()).rejects.toThrow("redirect:/app");
  });
  it.each([{ error: new UnauthenticatedError(), path: "/login" }, { error: new ForbiddenError(), path: "/app" }])("denies safely via $path", async ({ error, path }) => {
    mock.actor.mockRejectedValue(error); await expect(Page()).rejects.toThrow(`redirect:${path}`); expect(mock.list).not.toHaveBeenCalled(); expect(mock.exercises).not.toHaveBeenCalled();
  });
});
