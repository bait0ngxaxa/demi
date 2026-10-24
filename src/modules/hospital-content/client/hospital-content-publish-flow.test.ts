import { describe, expect, it, vi } from "vitest";

import {
  runHospitalContentPublishFlow,
  type HospitalContentPublishFlowDependencies,
  type HospitalContentPublishFlowState,
} from "./hospital-content-publish-flow";

const file = (name: string): File => new File([name], `${name}.jpg`, { type: "image/jpeg" });

function newState(count: number): HospitalContentPublishFlowState {
  return { images: Array.from({ length: count }, (_, index) => ({ nonce: `nonce-${index}`, file: file(`f${index}`) })) };
}

function dependencies(overrides: Partial<HospitalContentPublishFlowDependencies> = {}): HospitalContentPublishFlowDependencies {
  return {
    create: vi.fn(async () => ({ kind: "OK" as const, contentId: "content-1", expectedUpdatedAt: "2026-10-24T00:00:00.000Z" })),
    upload: vi.fn(async (_contentId, image) => ({ kind: "OK" as const, imageId: `id-${image.nonce}` })),
    publish: vi.fn(async () => ({ kind: "OK" as const })),
    readCurrent: vi.fn(async () => ({ kind: "OK" as const, status: "DRAFT" as const, expectedUpdatedAt: "2026-10-24T00:00:00.000Z" })),
    ...overrides,
  };
}

describe("hospital content publish flow", () => {
  it("creates, uploads every image in order, then publishes with the version returned by create", async () => {
    const deps = dependencies();
    const progress: string[] = [];
    const state = newState(3);

    const result = await runHospitalContentPublishFlow(state, { publish: true, onProgress: (p) => progress.push(`${p.step}:${p.imageNumber ?? "-"}/${p.imageTotal}`) }, deps);

    expect(result).toEqual({ status: "DONE", contentId: "content-1", published: true });
    expect(vi.mocked(deps.upload).mock.calls.map(([, image]) => image.nonce)).toEqual(["nonce-0", "nonce-1", "nonce-2"]);
    expect(deps.publish).toHaveBeenCalledWith("content-1", "2026-10-24T00:00:00.000Z");
    expect(progress).toEqual(["CREATE:-/3", "UPLOAD:1/3", "UPLOAD:2/3", "UPLOAD:3/3", "PUBLISH:-/3"]);
  });

  it("publishes a text-only content without uploading", async () => {
    const deps = dependencies();
    expect(await runHospitalContentPublishFlow(newState(0), { publish: true }, deps)).toMatchObject({ status: "DONE", published: true });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("saves a draft with its images without publishing", async () => {
    const deps = dependencies();
    expect(await runHospitalContentPublishFlow(newState(2), { publish: false }, deps)).toEqual({ status: "DONE", contentId: "content-1", published: false });
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("does not publish when image k fails, and resumes by uploading only the remaining images", async () => {
    const upload = vi.fn<HospitalContentPublishFlowDependencies["upload"]>(async (_c, image) => (
      image.nonce === "nonce-1" ? { kind: "UNKNOWN" } : { kind: "OK", imageId: `id-${image.nonce}` }
    ));
    const deps = dependencies({ upload });
    const state = newState(3);

    const first = await runHospitalContentPublishFlow(state, { publish: true }, deps);
    expect(first).toMatchObject({ status: "STOPPED", step: "UPLOAD", imageNumber: 2, reason: "UNKNOWN", resumable: true });
    expect(deps.publish).not.toHaveBeenCalled();

    upload.mockImplementation(async (_c, image) => ({ kind: "OK", imageId: `id-${image.nonce}` }));
    upload.mockClear();
    const second = await runHospitalContentPublishFlow(state, { publish: true }, deps);

    expect(second).toEqual({ status: "DONE", contentId: "content-1", published: true });
    expect(deps.create).toHaveBeenCalledTimes(1);
    // The unconfirmed image replays with its original nonce; the confirmed first image is not sent again.
    expect(upload.mock.calls.map(([, image]) => image.nonce)).toEqual(["nonce-1", "nonce-2"]);
  });

  it("stops a rejected image without offering a resume", async () => {
    const deps = dependencies({ upload: vi.fn(async () => ({ kind: "REJECTED" as const, message: "รูปไม่ผ่าน" })) });
    expect(await runHospitalContentPublishFlow(newState(1), { publish: true }, deps)).toEqual({
      status: "STOPPED", step: "UPLOAD", imageNumber: 1, reason: "REJECTED", message: "รูปไม่ผ่าน", resumable: false,
    });
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("keeps the create step resumable only for an unknown outcome", async () => {
    const create = vi.fn<HospitalContentPublishFlowDependencies["create"]>(async () => ({ kind: "UNKNOWN" }));
    const deps = dependencies({ create });
    const state = newState(1);

    expect(await runHospitalContentPublishFlow(state, { publish: true }, deps)).toMatchObject({ status: "STOPPED", step: "CREATE", reason: "UNKNOWN", resumable: true });
    expect(deps.upload).not.toHaveBeenCalled();

    create.mockResolvedValueOnce({ kind: "CONFLICT" });
    expect(await runHospitalContentPublishFlow(state, { publish: true }, deps)).toMatchObject({ reason: "CONFLICT", resumable: false });
  });

  it("reports a publish conflict as not resumable", async () => {
    const deps = dependencies({ publish: vi.fn(async () => ({ kind: "CONFLICT" as const })) });
    expect(await runHospitalContentPublishFlow(newState(1), { publish: true }, deps)).toEqual({
      status: "STOPPED", step: "PUBLISH", reason: "CONFLICT", resumable: false,
    });
  });

  it("reconciles an unknown publish by reading the content before publishing again", async () => {
    const publish = vi.fn<HospitalContentPublishFlowDependencies["publish"]>(async () => ({ kind: "UNKNOWN" }));
    const readCurrent = vi.fn<HospitalContentPublishFlowDependencies["readCurrent"]>();
    const deps = dependencies({ publish, readCurrent });
    const state = newState(1);

    expect(await runHospitalContentPublishFlow(state, { publish: true }, deps)).toMatchObject({ step: "PUBLISH", reason: "UNKNOWN", resumable: true });

    // It was in fact committed: the resume reports success without a second publish.
    readCurrent.mockResolvedValueOnce({ kind: "OK", status: "PUBLISHED", expectedUpdatedAt: "2026-10-24T00:00:01.000Z" });
    publish.mockClear();
    expect(await runHospitalContentPublishFlow(state, { publish: true }, deps)).toEqual({ status: "DONE", contentId: "content-1", published: true });
    expect(publish).not.toHaveBeenCalled();
  });

  it("retries an unconfirmed publish only while the draft still has the same version", async () => {
    const publish = vi.fn<HospitalContentPublishFlowDependencies["publish"]>(async () => ({ kind: "UNKNOWN" }));
    const readCurrent = vi.fn<HospitalContentPublishFlowDependencies["readCurrent"]>();
    const deps = dependencies({ publish, readCurrent });

    const same = newState(0);
    await runHospitalContentPublishFlow(same, { publish: true }, deps);
    readCurrent.mockResolvedValueOnce({ kind: "OK", status: "DRAFT", expectedUpdatedAt: "2026-10-24T00:00:00.000Z" });
    publish.mockResolvedValueOnce({ kind: "OK" });
    expect(await runHospitalContentPublishFlow(same, { publish: true }, deps)).toMatchObject({ status: "DONE", published: true });

    const changed = newState(0);
    await runHospitalContentPublishFlow(changed, { publish: true }, deps);
    readCurrent.mockResolvedValueOnce({ kind: "OK", status: "DRAFT", expectedUpdatedAt: "2026-10-24T00:05:00.000Z" });
    expect(await runHospitalContentPublishFlow(changed, { publish: true }, deps)).toMatchObject({ reason: "CONFLICT", resumable: false });

    const unreadable = newState(0);
    await runHospitalContentPublishFlow(unreadable, { publish: true }, deps);
    readCurrent.mockResolvedValueOnce({ kind: "UNKNOWN" });
    expect(await runHospitalContentPublishFlow(unreadable, { publish: true }, deps)).toMatchObject({ reason: "UNKNOWN", resumable: true });
  });
});
