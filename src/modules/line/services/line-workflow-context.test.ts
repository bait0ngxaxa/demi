import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import {
  LINE_WORKFLOW_CONTEXT_COOKIE_NAME,
  lineWorkflowContextCookieOptions,
  lineWorkflowContextSessionMatches,
  openLineWorkflowContext,
  parseLineWorkflowContextKeyring,
  sealLineWorkflowContext,
  type LineWorkflowContextKeyring,
} from "./line-workflow-context";

const key = (): string => randomBytes(32).toString("base64url");
const ring = (currentKid: string, keys: Array<{ kid: string; encryptionKey: string; sessionKey: string }>): LineWorkflowContextKeyring =>
  parseLineWorkflowContextKeyring(JSON.stringify({ currentKid, keys }));
const k1 = { kid: "k1", encryptionKey: key(), sessionKey: key() };
const k2 = { kid: "k2", encryptionKey: key(), sessionKey: key() };
const tuple = {
  origin: "https://demi.example.org",
  environment: "DEVELOPING" as const,
  channelId: "2000000001",
  liffId: "2000000001-MiniDev",
  deploymentReference: "deploy:dev-1",
};
const NOW = new Date("2026-10-18T03:00:00.000Z");
const subject = {
  bindingId: "11111111-1111-4111-8111-111111111111",
  bindingVersion: 3,
  userId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  proofExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
};

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(LineWorkflowFailure);
    return (error as LineWorkflowFailure).code;
  }
  throw new Error("Expected failure");
}

function flip(value: string, part: number): string {
  const parts = value.split(".");
  const bytes = Buffer.from(parts[part], "base64url");
  bytes[0] ^= 0x01;
  parts[part] = bytes.toString("base64url");
  return parts.join(".");
}

describe("scoped workflow context keyring", () => {
  it.each([
    ["missing", undefined],
    ["not JSON", "k1"],
    ["unknown current key", JSON.stringify({ currentKid: "k9", keys: [k1] })],
    ["short key", JSON.stringify({ currentKid: "k1", keys: [{ ...k1, encryptionKey: "short" }] })],
    ["same encryption and session key", JSON.stringify({ currentKid: "k1", keys: [{ ...k1, sessionKey: k1.encryptionKey }] })],
    ["duplicate kid", JSON.stringify({ currentKid: "k1", keys: [k1, { ...k2, kid: "k1" }] })],
    ["reused key material", JSON.stringify({ currentKid: "k1", keys: [k1, { ...k2, encryptionKey: k1.encryptionKey }] })],
    ["extra field", JSON.stringify({ currentKid: "k1", keys: [{ ...k1, algorithm: "none" }] })],
    ["too many keys", JSON.stringify({ currentKid: "k1", keys: [k1, k2, { kid: "k3", encryptionKey: key(), sessionKey: key() }, { kid: "k4", encryptionKey: key(), sessionKey: key() }] })],
  ])("fails closed for a %s keyring", (_label, raw) => {
    expect(codeOf(() => parseLineWorkflowContextKeyring(raw))).toBe("MINI_CONFIGURATION_UNAVAILABLE");
  });
});

describe("AES-256-GCM scoped workflow context", () => {
  const keyring = ring("k1", [k1]);

  it("round-trips bounded claims with the absolute 15-minute cap and no raw session ID", () => {
    const sealed = sealLineWorkflowContext(subject, { keyring, tuple, now: NOW });
    expect(sealed.value.length).toBeLessThanOrEqual(3 * 1024);
    expect(sealed.value).toMatch(/^v1\.k1\./u);
    expect(sealed.value).not.toContain(subject.sessionId);
    expect(sealed.value).not.toContain(subject.userId);
    expect(sealed.expiresAt.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
    const opened = openLineWorkflowContext(sealed.value, { keyring, tuple, now: NOW });
    expect(opened).toMatchObject({
      kid: "k1", intent: "OPEN_PATIENT_APPOINTMENTS", bindingId: subject.bindingId, bindingVersion: 3,
      userId: subject.userId, issuedAt: NOW.getTime() / 1000, expiresAt: NOW.getTime() / 1000 + 900,
    });
    expect(lineWorkflowContextSessionMatches(opened, subject.sessionId, keyring)).toBe(true);
    expect(lineWorkflowContextSessionMatches(opened, "44444444-4444-4444-8444-444444444444", keyring)).toBe(false);
  });

  it("caps lifetime at the verified LINE proof expiry and refuses an already-expired proof", () => {
    const proofExpiresAt = new Date(NOW.getTime() + 120 * 1000);
    expect(sealLineWorkflowContext({ ...subject, proofExpiresAt }, { keyring, tuple, now: NOW }).expiresAt).toEqual(proofExpiresAt);
    expect(codeOf(() => sealLineWorkflowContext({ ...subject, proofExpiresAt: NOW }, { keyring, tuple, now: NOW }))).toBe("LINE_IDENTITY_INVALID");
  });

  it("uses a fresh nonce for every issuance", () => {
    const first = sealLineWorkflowContext(subject, { keyring, tuple, now: NOW }).value.split(".")[2];
    const second = sealLineWorkflowContext(subject, { keyring, tuple, now: NOW }).value.split(".")[2];
    expect(first).not.toBe(second);
  });

  it("expires strictly at the absolute deadline without sliding or grace", () => {
    const { value } = sealLineWorkflowContext(subject, { keyring, tuple, now: NOW });
    expect(openLineWorkflowContext(value, { keyring, tuple, now: new Date(NOW.getTime() + 899_999) }).bindingId).toBe(subject.bindingId);
    expect(codeOf(() => openLineWorkflowContext(value, { keyring, tuple, now: new Date(NOW.getTime() + 900_000) }))).toBe("SCOPE_EXPIRED");
  });

  it("rejects a context issued in the future", () => {
    const { value } = sealLineWorkflowContext(subject, { keyring, tuple, now: new Date(NOW.getTime() + 60_000) });
    expect(codeOf(() => openLineWorkflowContext(value, { keyring, tuple, now: NOW }))).toBe("SCOPE_INVALID");
  });

  it.each([[2, "nonce"], [3, "ciphertext"], [4, "tag"]])("rejects a tampered %s (part %s)", (part) => {
    const { value } = sealLineWorkflowContext(subject, { keyring, tuple, now: NOW });
    expect(codeOf(() => openLineWorkflowContext(flip(value, part as number), { keyring, tuple, now: NOW }))).toBe("SCOPE_INVALID");
  });

  it.each([
    "", "v2.k1.a.b.c", "v1.k1", `v1.k1.${"A".repeat(16)}.${"A".repeat(10)}.${"A".repeat(22)}.extra`,
    "x".repeat(3 * 1024 + 1),
  ])("rejects a malformed or oversized envelope %#", (value) => {
    expect(codeOf(() => openLineWorkflowContext(value, { keyring, tuple, now: NOW }))).toBe("SCOPE_INVALID");
  });

  it.each([
    ["environment", { environment: "PUBLISHED" as const }],
    ["channel", { channelId: "2000000002" }],
    ["LIFF ID", { liffId: "2000000002-MiniRev" }],
    ["origin", { origin: "https://other.example.org" }],
    ["deployment", { deploymentReference: "deploy:review-1" }],
  ])("rejects a context presented to another %s even with shared keys", (_label, changes) => {
    const { value } = sealLineWorkflowContext(subject, { keyring, tuple, now: NOW });
    expect(codeOf(() => openLineWorkflowContext(value, { keyring, tuple: { ...tuple, ...changes }, now: NOW }))).toBe("SCOPE_INVALID");
  });

  it("rejects a key ID relabelled onto another configured key", () => {
    const both = ring("k1", [k1, k2]);
    const { value } = sealLineWorkflowContext(subject, { keyring: both, tuple, now: NOW });
    expect(codeOf(() => openLineWorkflowContext(value.replace(/^v1\.k1\./u, "v1.k2."), { keyring: both, tuple, now: NOW }))).toBe("SCOPE_INVALID");
  });
});

describe("controlled key rotation", () => {
  it("issues with the new current key, still opens decrypt-only prior contexts, then rejects them after retirement", () => {
    const before = ring("k1", [k1]);
    const old = sealLineWorkflowContext(subject, { keyring: before, tuple, now: NOW }).value;

    const rotating = ring("k2", [k2, k1]);
    const fresh = sealLineWorkflowContext(subject, { keyring: rotating, tuple, now: NOW }).value;
    expect(fresh).toMatch(/^v1\.k2\./u);
    const reopened = openLineWorkflowContext(old, { keyring: rotating, tuple, now: NOW });
    expect(lineWorkflowContextSessionMatches(reopened, subject.sessionId, rotating)).toBe(true);

    const retired = ring("k2", [k2]);
    expect(codeOf(() => openLineWorkflowContext(old, { keyring: retired, tuple, now: NOW }))).toBe("SCOPE_INVALID");
    expect(openLineWorkflowContext(fresh, { keyring: retired, tuple, now: NOW }).kid).toBe("k2");
  });

  it("rejects contexts from an unrelated keyring with the same key ID", () => {
    const other = ring("k1", [{ kid: "k1", encryptionKey: key(), sessionKey: key() }]);
    const { value } = sealLineWorkflowContext(subject, { keyring: ring("k1", [k1]), tuple, now: NOW });
    expect(codeOf(() => openLineWorkflowContext(value, { keyring: other, tuple, now: NOW }))).toBe("SCOPE_INVALID");
  });
});

describe("selected cookie contract", () => {
  it("is a host-only __Secure- cookie scoped to the workflow path, not __Host-", () => {
    expect(LINE_WORKFLOW_CONTEXT_COOKIE_NAME).toBe("__Secure-DEMI_LINE_WORKFLOW");
    const options = lineWorkflowContextCookieOptions(new Date(NOW.getTime() + 900_000), NOW);
    expect(options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/line/workflow", maxAge: 900 });
    expect(options).not.toHaveProperty("domain");
  });
});
