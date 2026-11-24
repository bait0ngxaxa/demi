import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The repository uses Node/SSR tests, not a DOM renderer. Drive the component's
// effect boundary explicitly; this does not simulate browser navigation/scanning.
const harness = vi.hoisted(() => ({
  result: null as unknown,
  effect: undefined as (() => (() => void)) | undefined,
  setResult: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: () => [harness.result, harness.setResult],
  useEffect: (effect: () => (() => void)) => { harness.effect = effect; },
}));
vi.mock("@/lib/qr/branded-qr", () => ({ createBrandedQrSvgDataUrl: harness.generate }));

import { FamilyInvitationQr } from "./family-invitation-qr";

const link = `https://demi.example/app/family/invitations#${"a".repeat(43)}`;
function render(invitationLink = link): string {
  return renderToStaticMarkup(<FamilyInvitationQr invitationLink={invitationLink} />);
}
// The QR is generated one microtask after the effect starts; let every pending callback settle.
function flush(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}
function startEffect(): () => void {
  if (!harness.effect) throw new Error("QR effect was not registered");
  return harness.effect();
}

describe("Family invitation QR transient presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.result = null;
    harness.setResult.mockImplementation((value: unknown) => { harness.result = value; });
  });
  afterEach(() => { harness.effect = undefined; });

  it("loads, encodes the exact link with approved settings and renders a safe alt", async () => {
    harness.generate.mockReturnValue("data:image/svg+xml;base64,current");
    expect(render()).toContain("กำลังสร้างคิวอาร์โค้ดคำเชิญ");
    const cleanup = startEffect();
    await flush();
    expect(harness.generate).toHaveBeenCalledWith(link, { margin: 4, size: 240 });
    const markup = render();
    expect(markup).toContain('alt="คิวอาร์โค้ดคำเชิญผู้ดูแล DEMI"');
    expect(markup).toContain('src="data:image/svg+xml;base64,current"');
    expect(markup).not.toContain(link);
    expect(markup).not.toContain("a".repeat(43));
    cleanup();
  });

  it("sanitizes generation failure without exposing the error or URL", async () => {
    harness.generate.mockImplementation(() => { throw new Error(link); });
    render();
    const cleanup = startEffect();
    await flush();
    expect(render()).toContain("ไม่สามารถสร้างคิวอาร์โค้ดได้ กรุณาใช้ลิงก์คำเชิญแทน");
    expect(render()).not.toContain(link);
    cleanup();
  });

  it("hides the previous QR immediately and ignores stale resolution after a new URL", async () => {
    let resolveOld: (value: string) => void = () => undefined;
    harness.generate.mockReturnValueOnce(new Promise<string>((resolve) => { resolveOld = resolve; }));
    render();
    const cleanupOld = startEffect();
    cleanupOld();
    const next = link.replace(/a{43}$/u, "b".repeat(43));
    harness.result = { invitationLink: link, status: "READY", dataUrl: "old-image" };
    expect(render(next)).not.toContain("old-image");
    harness.generate.mockResolvedValueOnce("new-image");
    const cleanupNew = startEffect();
    await flush();
    resolveOld("stale-image");
    await flush();
    expect(render(next)).toContain('src="new-image"');
    expect(render(next)).not.toContain("stale-image");
    expect(harness.generate).toHaveBeenLastCalledWith(next, expect.objectContaining({ margin: 4 }));
    cleanupNew();
  });

  it.each(["resolve", "reject"])("discards %s after unmount", async (outcome) => {
    let resolve: (value: string) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    harness.generate.mockReturnValue(new Promise<string>((success, failure) => { resolve = success; reject = failure; }));
    render();
    startEffect()();
    if (outcome === "resolve") resolve("discarded-image");
    else reject(new Error("discarded-error"));
    await flush();
    expect(harness.setResult).not.toHaveBeenCalled();
  });
});
