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
vi.mock("qrcode", () => ({ default: { toDataURL: harness.generate } }));

import { FamilyInvitationQr } from "./family-invitation-qr";

const link = `https://demi.example/app/family/invitations#${"a".repeat(43)}`;
function render(invitationLink = link): string {
  return renderToStaticMarkup(<FamilyInvitationQr invitationLink={invitationLink} />);
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
    harness.generate.mockResolvedValue("data:image/png;base64,current");
    expect(render()).toContain("กำลังสร้างคิวอาร์โค้ดคำเชิญ");
    const cleanup = startEffect();
    await Promise.resolve();
    expect(harness.generate).toHaveBeenCalledWith(link, {
      errorCorrectionLevel: "M", margin: 4, width: 240,
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
    const markup = render();
    expect(markup).toContain('alt="คิวอาร์โค้ดคำเชิญผู้ดูแล DEMI"');
    expect(markup).toContain('src="data:image/png;base64,current"');
    expect(markup).not.toContain(link);
    expect(markup).not.toContain("a".repeat(43));
    cleanup();
  });

  it("sanitizes generation failure without exposing the error or URL", async () => {
    harness.generate.mockRejectedValue(new Error(link));
    render();
    const cleanup = startEffect();
    await Promise.resolve();
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
    await Promise.resolve();
    resolveOld("stale-image");
    await Promise.resolve();
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
    await Promise.resolve();
    expect(harness.setResult).not.toHaveBeenCalled();
  });
});
