import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ init: vi.fn(), database: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@line/liff", () => ({ default: { init: mocks.init } }));
// The shell must not reach persistence or Patient services.
vi.mock("@/lib/db/prisma", () => ({ getPrisma: mocks.database }));

import { LineWorkflowScreen, type LineWorkflowScreenState } from "./line-workflow-client";
import LineWorkflowPage from "./page";

const ORIGIN = "https://demi.example.org";

function enableMini(): void {
  for (const [name, value] of Object.entries({
    DEMI_LINE_MINI_APP_WORKFLOW_ENABLED: "true",
    DEMI_LINE_MINI_APP_ISSUANCE_ENABLED: "true",
    DEMI_LINE_PUBLIC_ORIGIN: ORIGIN,
    DEMI_LINE_MINI_APP_ENVIRONMENT: "DEVELOPING",
    DEMI_LINE_MINI_APP_CHANNEL_ID: "2000000001",
    DEMI_LINE_MINI_APP_LIFF_ID: "2000000001-MiniDev",
    DEMI_LINE_MINI_APP_ENDPOINT_URL: `${ORIGIN}/line/workflow`,
    DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE: "deploy:dev-1",
  })) vi.stubEnv(name, value);
}

async function render(query: Record<string, string | string[]> = {}): Promise<string> {
  return renderToStaticMarkup(await LineWorkflowPage({ searchParams: Promise.resolve(query) }));
}

describe("GET /line/workflow initialization shell", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("renders a loading shell for a supported entry without data access or SDK work during render", async () => {
    enableMini();
    const markup = await render({ intent: "OPEN_PATIENT_APPOINTMENTS" });
    expect(markup).toContain("กำลังเปิดนัดหมายผ่าน LINE");
    expect(markup).toContain('aria-busy="true"');
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.init).not.toHaveBeenCalled();
  });

  it("maps a bare MINI launch to the same supported intent", async () => {
    enableMini();
    expect(await render()).toContain("กำลังเปิดนัดหมายผ่าน LINE");
  });

  it.each([
    [{ intent: "OPEN_PATIENT_CARE" }],
    [{ intent: ["OPEN_PATIENT_APPOINTMENTS", "OPEN_PATIENT_APPOINTMENTS"] }],
    [{ intent: "OPEN_PATIENT_APPOINTMENTS", appointmentId: "11111111-1111-4111-8111-111111111111" }],
    [{ returnTo: "https://attacker.example" }],
  ])("renders a safe invalid-entry state for %j", async (query) => {
    enableMini();
    const markup = await render(query);
    expect(markup).toContain("ลิงก์นี้ไม่ถูกต้อง");
    expect(markup).toContain('href="/app"');
    expect(markup).not.toContain("กำลังเปิดนัดหมายผ่าน LINE");
  });

  it("rejects untrusted liff.state before LIFF could follow it", async () => {
    enableMini();
    const markup = await render({ "liff.state": "https://attacker.example/" });
    expect(markup).toContain("ลิงก์นี้ไม่ถูกต้อง");
    expect(markup).not.toContain("attacker.example");
  });

  it("renders an unavailable state when MINI configuration is missing", async () => {
    enableMini();
    vi.stubEnv("DEMI_LINE_MINI_APP_LIFF_ID", undefined);
    const markup = await render();
    expect(markup).toContain("ยังเปิดนัดหมายผ่าน LINE ไม่ได้");
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it("stays unavailable while the activation gate is disabled", async () => {
    enableMini();
    vi.stubEnv("DEMI_LINE_MINI_APP_WORKFLOW_ENABLED", undefined);
    expect(await render()).toContain("ยังเปิดนัดหมายผ่าน LINE ไม่ได้");
  });

  it("does not initialize LIFF while scope issuance has not been activated", async () => {
    enableMini();
    vi.stubEnv("DEMI_LINE_MINI_APP_ISSUANCE_ENABLED", undefined);
    const markup = await render();
    expect(markup).toContain("ยังเปิดนัดหมายผ่าน LINE ไม่ได้");
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });
});

describe("gateway screen states", () => {
  const loginHref = "/login?returnTo=%2Fline%2Fworkflow%3Fintent%3DOPEN_PATIENT_APPOINTMENTS";
  const states: LineWorkflowScreenState[] = [
    "INITIALIZING", "VERIFYING", "UNAVAILABLE", "NAVIGATION_INVALID", "PLATFORM_STATE_INVALID", "INIT_FAILED",
    "LINE_LOGIN_REQUIRED", "LINE_PROOF_UNAVAILABLE", "LOGIN_REQUIRED", "ACCOUNT_MISMATCH", "LINE_NOT_LINKED",
    "WORKFLOW_INELIGIBLE", "NOT_ACTIVATED", "RATE_LIMITED", "TEMPORARILY_UNAVAILABLE",
  ];

  it.each(states)("renders %s as Thai status copy with no Patient or appointment content", (state) => {
    const markup = renderToStaticMarkup(<LineWorkflowScreen state={state} loginHref={loginHref} />);
    expect(markup).toMatch(/[฀-๿]/u);
    expect(markup).toContain('role="status"');
    expect(markup).not.toMatch(/\/app\/personal\/appointments|\/line\/workflow\/appointments|HN|relationshipId/u);
  });

  it("offers explicit DEMI login only through the fixed bounded return", () => {
    const markup = renderToStaticMarkup(<LineWorkflowScreen state="LOGIN_REQUIRED" loginHref={loginHref} />);
    expect(markup).toContain(`href="${loginHref}"`);
    expect(markup).not.toContain("ลองอีกครั้ง");
  });

  it("explains cookie loss and offers explicit retry instead of looping after a repeated login", () => {
    const markup = renderToStaticMarkup(<LineWorkflowScreen state="LOGIN_REQUIRED" loginHref={loginHref} repeatedLogin />);
    expect(markup).toContain("เบราว์เซอร์นี้อาจไม่เก็บการเข้าสู่ระบบไว้");
    expect(markup).toContain("ลองอีกครั้ง");
  });

  it("gives a generic mismatch with account correction paths only", () => {
    const markup = renderToStaticMarkup(<LineWorkflowScreen state="ACCOUNT_MISMATCH" loginHref={loginHref} />);
    expect(markup).toContain("บัญชีไม่ตรงกัน");
    expect(markup).toContain('href="/line/account"');
    expect(markup).not.toContain(loginHref);
  });

  it("describes external-browser limitations honestly", () => {
    const markup = renderToStaticMarkup(<LineWorkflowScreen state="LINE_LOGIN_REQUIRED" loginHref={loginHref} externalBrowser />);
    expect(markup).toContain("คุณกำลังเปิดนอกแอป LINE");
    expect(markup).toContain("เข้าสู่ระบบด้วย LINE");
  });
});
