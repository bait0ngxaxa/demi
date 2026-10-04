import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";
import type { PersonalWeightGoalActionState } from "@/modules/weight-goals/transport/action-state";

const simulation = vi.hoisted(() => ({
  state: { status: "IDLE" } as PersonalWeightGoalActionState,
  pending: false,
  handler: undefined as ((previous: PersonalWeightGoalActionState, formData: FormData) => Promise<PersonalWeightGoalActionState>) | undefined,
}));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useActionState: (handler: (previous: PersonalWeightGoalActionState, formData: FormData) => Promise<PersonalWeightGoalActionState>) => {
      simulation.handler = handler;
      return [simulation.state, () => undefined, simulation.pending];
    },
  };
});
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({
  createPersonalWeightGoalAction: vi.fn(), updatePersonalWeightGoalAction: vi.fn(), removePersonalWeightGoalAction: vi.fn(), readPersonalWeightGoalAction: vi.fn(),
}));
import { createPersonalWeightGoalAction } from "@/modules/weight-goals/transport/server-actions";
import { PersonalWeightGoalEditor, PersonalWeightGoalRemoveConfirmation } from "./personal-weight-goal-controls";
import { PersonalWeightGoalReadback, PersonalWeightGoalWorkspace } from "./personal-weight-goal-workspace";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";

const goal: PersonalWeightGoalDto = {
  id: "22222222-2222-4222-8222-222222222222",
  targetWeightKg: "72.555",
  targetDate: "2026-10-01",
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

function coordination(overrides: Partial<Parameters<typeof PersonalWeightGoalEditor>[0]["coordination"]> = {}): Parameters<typeof PersonalWeightGoalEditor>[0]["coordination"] {
  const authority = createWellnessPrivateAuthority(vi.fn());
  return {
    authority,
    isActive: () => authority.isActive(),
    blocked: false,
    onResult: vi.fn(),
    onPending: vi.fn(),
    ...overrides,
  };
}

describe("Personal Weight Goal UI", () => {
  beforeEach(() => {
    simulation.state = { status: "IDLE" };
    simulation.pending = false;
    simulation.handler = undefined;
    vi.mocked(createPersonalWeightGoalAction).mockReset();
  });

  it("renders a neutral empty state and waits for explicit create action", () => {
    const html = renderToStaticMarkup(<PersonalWeightGoalWorkspace initialGoal={null} initialNonce="11111111-1111-4111-8111-111111111111" authority={createWellnessPrivateAuthority(vi.fn())} />);
    expect(html).toContain("ยังไม่ได้ตั้งเป้าหมายน้ำหนักส่วนตัว");
    expect(html).toContain("ตั้งเป้าหมายน้ำหนัก");
    expect(html).not.toContain('name="targetWeightKg"');
    expect(html).not.toContain('name="submissionNonce"');
  });

  it("uses exact decimal text input and leaves date bounds to the server", () => {
    const create = renderToStaticMarkup(<PersonalWeightGoalEditor nonce="11111111-1111-4111-8111-111111111111" coordination={coordination()} />);
    expect(create).toContain('name="submissionNonce" value="11111111-1111-4111-8111-111111111111"');
    expect(create).toMatch(/<input(?=[^>]*name="targetWeightKg")(?=[^>]*type="text")(?=[^>]*inputMode="decimal")(?=[^>]*maxLength="11")[^>]*>/u);
    expect(create).toContain("ทศนิยมได้ไม่เกิน 3 ตำแหน่ง");
    expect(create).toContain("วันที่เป้าหมาย (ไม่บังคับ)");
    expect(create).toMatch(/<input(?=[^>]*name="targetDate")(?=[^>]*type="date")[^>]*>/u);
    expect(create).not.toMatch(/type="date"[^>]*\smin=/u);
    expect(create).not.toMatch(/type="number"/u);
  });

  it("retains a naturally passed date in edit and renders only neutral target fields", () => {
    const html = renderToStaticMarkup(<>
      <PersonalWeightGoalReadback goal={goal} />
      <PersonalWeightGoalEditor goal={goal} nonce="11111111-1111-4111-8111-111111111111" coordination={coordination()} />
    </>);
    expect(html).toContain("72.555 กก.");
    expect(html).toContain('dateTime="2026-10-01"');
    expect(html).toContain('value="2026-10-01"');
    expect(html).toContain('name="expectedUpdatedAt"');
    expect(html).not.toMatch(/type="date"[^>]*\smin=/u);
    for (const forbidden of ["BMI", "เหลืออีก", "ล่าช้า", "เกินกำหนด", "สำเร็จแล้ว", "น้ำหนักปัจจุบัน", "progress"]) expect(html).not.toContain(forbidden);
  });

  it("keeps the same nonce and submitted value frozen for an explicit unconfirmed retry", async () => {
    simulation.state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้" };
    const html = renderToStaticMarkup(<PersonalWeightGoalEditor nonce="11111111-1111-4111-8111-111111111111" coordination={coordination()} />);
    expect(html).toContain('name="submissionNonce" value="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('name="targetWeightKg" value=""');
    expect(html).toContain('name="targetDate" value=""');
    expect(html).toContain("ลองคำขอเดิมอีกครั้ง");
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?!(?:[^>]*\sdisabled=""))[^>]*>/u);
  });

  it("blocks the consumed nonce and requires explicit refresh/review", () => {
    simulation.state = { status: "CREATE_CONSUMED", message: "คำขอตั้งเป้าหมายนี้ถูกดำเนินการแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนดำเนินการต่อ" };
    const html = renderToStaticMarkup(<PersonalWeightGoalEditor nonce="11111111-1111-4111-8111-111111111111" coordination={coordination()} />);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*\sdisabled="")[^>]*>/u);
  });

  it("requires an explicit remove confirmation and offers a cancel action", () => {
    const html = renderToStaticMarkup(<PersonalWeightGoalRemoveConfirmation goal={goal} coordination={coordination()} onCancel={vi.fn()} />);
    expect(html).toContain("ลบเป้าหมายน้ำหนักปัจจุบันออกจากข้อมูลที่บันทึกไว้?");
    expect(html).toContain("ยืนยันลบเป้าหมาย");
    expect(html).toContain("ยกเลิก");
    expect(html).toContain(`name="goalId" value="${goal.id}"`);
    expect(html).toContain(`name="expectedUpdatedAt" value="${goal.updatedAt}"`);
  });

  it("drops a delayed mutation response after another Wellness domain invalidates the shared authority", async () => {
    let resolveAction: (state: PersonalWeightGoalActionState) => void = () => undefined;
    const result = new Promise<PersonalWeightGoalActionState>((resolve) => { resolveAction = resolve; });
    vi.mocked(createPersonalWeightGoalAction).mockReturnValue(result);
    const authority = createWellnessPrivateAuthority(vi.fn());
    const onResult = vi.fn();
    const coordinationValue = coordination({ authority, onResult });
    renderToStaticMarkup(<PersonalWeightGoalEditor nonce="11111111-1111-4111-8111-111111111111" coordination={coordinationValue} />);
    if (!simulation.handler) throw new Error("Expected action handler");
    const pending = simulation.handler({ status: "IDLE" }, new FormData());
    authority.invalidate();
    resolveAction({ status: "SUCCESS", result: { outcome: "CREATED", goal } });
    await expect(pending).resolves.toEqual({ status: "IDLE" });
    expect(onResult).not.toHaveBeenCalled();
  });

  it("Weight DENIED synchronously invalidates the same Wellness authority", async () => {
    const authority = createWellnessPrivateAuthority(vi.fn());
    const generation = authority.captureGeneration();
    vi.mocked(createPersonalWeightGoalAction).mockResolvedValue({ status: "DENIED", message: "บัญชีนี้ไม่สามารถเข้าถึงเป้าหมายได้" });
    const onResult = vi.fn((state: PersonalWeightGoalActionState) => { if (state.status === "DENIED") authority.invalidate(); });
    renderToStaticMarkup(<PersonalWeightGoalEditor nonce="11111111-1111-4111-8111-111111111111" coordination={coordination({ authority, onResult })} />);
    if (!simulation.handler) throw new Error("Expected action handler");
    await simulation.handler({ status: "IDLE" }, new FormData());
    expect(authority.isCurrent(generation)).toBe(false);
    expect(authority.isActive()).toBe(false);
  });
});
