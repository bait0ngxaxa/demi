import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  schedule: vi.fn(),
  scheduleReactive: vi.fn(),
}));

vi.mock("@/modules/line/services/line-webhook-service", () => ({
  processLineWebhookRequest: mocks.process,
}));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({
  scheduleLineBindingReconciliation: mocks.schedule,
}));
vi.mock("@/modules/line/transport/line-reactive-scheduler", () => ({
  scheduleLineReactiveWork: mocks.scheduleReactive,
}));

import { POST } from "./route";

describe("POST /api/line/webhook response boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("acknowledges durable processing and schedules only the returned binding IDs", async () => {
    mocks.process.mockResolvedValue({
      accepted: 2,
      duplicates: 0,
      ignored: 1,
      bindingIds: ["binding-one", "binding-two"],
      reactiveWorkItems: [{ intent: "PATIENT_NEXT_APPOINTMENT", replyToken: "secret" }],
    });

    const response = await POST(new Request("https://demi.example.org/api/line/webhook", { method: "POST" }));

    expect(response.status).toBe(200);
    const publicResult = await response.json();
    expect(publicResult).toEqual({ accepted: 2, duplicates: 0, ignored: 1 });
    expect(mocks.process.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
    expect(mocks.schedule).toHaveBeenCalledWith(["binding-one", "binding-two"]);
    expect(mocks.scheduleReactive).toHaveBeenCalledWith([
      { intent: "PATIENT_NEXT_APPOINTMENT", replyToken: "secret" },
    ]);
    expect(JSON.stringify(publicResult)).not.toContain("secret");
  });

  it.each([
    ["empty request", { accepted: 0, duplicates: 0, ignored: 0, bindingIds: [], reactiveWorkItems: [] }],
    ["duplicate-only request", { accepted: 0, duplicates: 1, ignored: 0, bindingIds: [], reactiveWorkItems: [] }],
  ])("returns 2xx without scheduling for a %s", async (_label, result) => {
    mocks.process.mockResolvedValue(result);

    const response = await POST(new Request("https://demi.example.org/api/line/webhook", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.scheduleReactive).not.toHaveBeenCalled();
  });

  it("isolates menu reconciliation and reactive scheduler registration failures", async () => {
    mocks.process.mockResolvedValue({
      accepted: 1,
      duplicates: 0,
      ignored: 0,
      bindingIds: ["binding-id"],
      reactiveWorkItems: [{ intent: "PATIENT_NEXT_APPOINTMENT" }],
    });
    mocks.schedule.mockImplementation(() => {
      throw new Error("menu scheduling unavailable");
    });
    mocks.scheduleReactive.mockImplementation(() => {
      throw new Error("reactive scheduling unavailable");
    });

    const response = await POST(new Request("https://demi.example.org/api/line/webhook", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(mocks.scheduleReactive).toHaveBeenCalledOnce();
  });

  it("returns 503 for durable acceptance failure and schedules no work", async () => {
    mocks.process.mockRejectedValue(new Error("private database failure"));

    const response = await POST(new Request("https://demi.example.org/api/line/webhook", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.scheduleReactive).not.toHaveBeenCalled();
  });

  it("does not await transient worker completion before returning HTTP 200", async () => {
    let releaseWorker: () => void = () => undefined;
    const worker = new Promise<void>((resolve) => {
      releaseWorker = resolve;
    });
    mocks.process.mockResolvedValue({
      accepted: 1,
      duplicates: 0,
      ignored: 0,
      bindingIds: [],
      reactiveWorkItems: [{ intent: "PATIENT_NEXT_APPOINTMENT" }],
    });
    mocks.scheduleReactive.mockImplementation(() => worker);

    const responsePromise = POST(new Request("https://demi.example.org/api/line/webhook", { method: "POST" }));
    const response = await responsePromise;
    expect(response.status).toBe(200);
    releaseWorker();
    await worker;
  });
});
