import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ meal: vi.fn(), exercise: vi.fn() }));
vi.mock("@/modules/meals/transport/server-actions", () => ({ listPersonalMealsAction: mock.meal }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ listPersonalExercisesAction: mock.exercise }));
import { readDailyWellnessAction } from "./daily-wellness-action";
beforeEach(() => { vi.resetAllMocks(); });
describe("Daily Wellness read boundary", () => {
  it("returns no private sibling payload when either domain denies", async () => {
    const form = new FormData(); form.set("occurredOn", "2026-10-29");
    for (const denied of ["meal", "exercise"] as const) {
      mock.meal.mockResolvedValue({ status: "SUCCESS", page: { items: ["private meal"] } });
      mock.exercise.mockResolvedValue({ status: "SUCCESS", page: { items: ["private exercise"] } });
      mock[denied].mockResolvedValue({ status: "DENIED" });
      const result = await readDailyWellnessAction(form);
      expect(result.status).toBe("DENIED"); expect(JSON.stringify(result)).not.toContain("private");
    }
  });
  it("forwards the bounded form to both domain boundaries; never claims partial success", async () => {
    const form = new FormData(); form.set("occurredOn", "2026-10-29");
    mock.meal.mockResolvedValue({ status: "SUCCESS", page: { items: [], nextCursor: null } });
    mock.exercise.mockResolvedValue({ status: "ERROR" });
    expect((await readDailyWellnessAction(form)).status).toBe("ERROR");
    expect(mock.meal).toHaveBeenCalledWith(form); expect(mock.exercise).toHaveBeenCalledWith(form);
  });
  it("prioritizes a private denial even when the sibling read rejects", async () => {
    mock.meal.mockResolvedValue({ status: "DENIED" }); mock.exercise.mockRejectedValue(new Error("synthetic failure"));
    expect((await readDailyWellnessAction(new FormData())).status).toBe("DENIED");
  });
});
