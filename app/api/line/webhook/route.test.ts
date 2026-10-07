import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("@/modules/line/services/line-webhook-service", () => ({
  processLineWebhookRequest: mocks.process,
}));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({
  scheduleLineBindingReconciliation: mocks.schedule,
}));

import { POST } from "./route";

describe("POST /api/line/webhook response boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges durable processing and schedules only the returned binding IDs", async () => {
    mocks.process.mockResolvedValue({
      accepted: 2,
      duplicates: 0,
      ignored: 1,
      bindingIds: ["binding-one", "binding-two"],
    });

    const response = await POST(new Request("https://demi.example.org/api/line/webhook", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: 2, duplicates: 0, ignored: 1 });
    expect(mocks.process.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
    expect(mocks.schedule).toHaveBeenCalledWith(["binding-one", "binding-two"]);
  });

  it.each([
    ["empty request", { accepted: 0, duplicates: 0, ignored: 0, bindingIds: [] }],
    ["duplicate-only request", { accepted: 0, duplicates: 1, ignored: 0, bindingIds: [] }],
  ])("returns 2xx without scheduling for a %s", async (_label, result) => {
    mocks.process.mockResolvedValue(result);

    const response = await POST(new Request("https://demi.example.org/api/line/webhook", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
