import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  pending: false,
  transitions: [] as Array<() => void | Promise<void>>,
  push: vi.fn(),
  effects: [] as Array<() => void>,
  focus: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();

  return {
    ...react,
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) {
        harness.slots[index] = typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
      }

      const setState = (next: unknown | ((previous: unknown) => unknown)) => {
        harness.slots[index] = typeof next === "function"
          ? (next as (previous: unknown) => unknown)(harness.slots[index])
          : next;
      };

      return [harness.slots[index], setState];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) {
        harness.slots[index] = { current: initial };
      }
      return harness.slots[index];
    },
    useEffect: (effect: () => void, dependencies: readonly unknown[]) => {
      const index = harness.cursor++;
      const previous = harness.slots[index] as readonly unknown[] | undefined;
      if (!previous || dependencies.some((value, dependency) => !Object.is(value, previous[dependency]))) {
        harness.effects.push(effect);
        harness.slots[index] = dependencies;
      }
    },
    useTransition: () => [harness.pending, (callback: () => void | Promise<void>) => {
      harness.pending = true;
      harness.transitions.push(callback);
    }],
  };
});

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: harness.push }) }));
vi.mock("@/modules/hospital-contact/transport/server-actions", () => ({
  readHospitalContactForOwnerAction: mocks.read,
  updateHospitalContactAction: mocks.update,
}));

import { Button } from "@/components/ui/button";
import type {
  HospitalContactEditorProjection,
  HospitalContactOwnerHospital,
} from "@/modules/hospital-contact/types/hospital-contact-projections";
import type { HospitalContactMutationActionState } from "@/modules/hospital-contact/transport/action-state";
import { HospitalContactWorkspace } from "./hospital-contact-workspace";

type InteractionProps = {
  children?: ReactNode;
  id?: string;
  value?: string;
  disabled?: boolean;
  ref?: { current: { disabled: boolean; focus: () => void } | null };
  onChange?: (event: { currentTarget: { value: string } }) => void;
  onClick?: () => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
};

const hospitalA: HospitalContactOwnerHospital = {
  id: "11111111-1111-4111-8111-111111111111",
  hospitalCode: "H-001",
  name: "โรงพยาบาล ก",
};
const hospitalB: HospitalContactOwnerHospital = {
  id: "22222222-2222-4222-8222-222222222222",
  hospitalCode: "H-002",
  name: "โรงพยาบาล ข",
};
const currentVersion = "2026-10-05T02:03:04.005Z";
const nextVersion = "2026-10-05T02:03:04.006Z";

function contact(overrides: Partial<HospitalContactEditorProjection> = {}): HospitalContactEditorProjection {
  return {
    hospital: hospitalA,
    addressText: null,
    phoneNumber: null,
    expectedUpdatedAt: null,
    ...overrides,
  };
}

function success(
  outcome: "CREATED" | "UPDATED" | "NOOP",
  value: HospitalContactEditorProjection,
): HospitalContactMutationActionState {
  return { status: "SUCCESS", result: { outcome, contact: value } };
}

function elements(node: ReactNode): ReactElement<InteractionProps>[] {
  if (Array.isArray(node)) {
    return node.flatMap(elements);
  }

  if (!isValidElement<InteractionProps>(node)) {
    return [];
  }

  return [node, ...elements(node.props.children)];
}

function renderWorkspace(
  initialContact: HospitalContactEditorProjection = contact(),
): React.JSX.Element {
  harness.cursor = 0;
  const tree = HospitalContactWorkspace({
    hospitals: [hospitalA, hospitalB],
    selectedHospitalId: hospitalA.id,
    contact: initialContact,
  });
  // Commit native control refs before flushing post-render effects.
  for (const element of elements(tree)) {
    if (element.props.ref && (element.type === "textarea" || element.type === "input")) {
      element.props.ref.current = {
        disabled: Boolean(element.props.disabled),
        focus: () => harness.focus(element.props.id),
      };
    }
  }
  for (const effect of harness.effects.splice(0)) {
    effect();
  }
  return tree;
}

function field(tree: ReactNode, id: string): ReactElement<InteractionProps> {
  const found = elements(tree).find((element) => element.props.id === id);
  if (!found) {
    throw new Error(`Missing field ${id}`);
  }

  return found;
}

function button(tree: ReactNode, label: string): ReactElement<InteractionProps> {
  const found = elements(tree).find(
    (element) => element.type === Button && element.props.children === label,
  );
  if (!found) {
    throw new Error(`Missing button ${label}`);
  }

  return found;
}

function submit(tree: ReactNode): ReturnType<typeof vi.fn> {
  const form = elements(tree).find((element) => element.type === "form");
  if (!form?.props.onSubmit) {
    throw new Error("Missing contact form");
  }

  const preventDefault = vi.fn();
  form.props.onSubmit({ preventDefault });
  return preventDefault;
}

async function finishTransition(): Promise<void> {
  const callback = harness.transitions.shift();
  if (!callback) {
    throw new Error("Missing queued transition");
  }

  try {
    await callback();
  } finally {
    harness.pending = false;
  }
}

function markup(initialContact?: HospitalContactEditorProjection): string {
  return renderToStaticMarkup(renderWorkspace(initialContact));
}

describe("Hospital Contact Owner form interactions", () => {
  beforeEach(() => {
    harness.slots = [];
    harness.cursor = 0;
    harness.pending = false;
    harness.transitions = [];
    harness.push.mockReset();
    harness.effects = [];
    harness.focus.mockReset();
    mocks.confirm.mockReset().mockReturnValue(false);
    mocks.read.mockReset().mockResolvedValue({ status: "SUCCESS", contact: contact() });
    mocks.update.mockReset().mockResolvedValue(success("NOOP", contact()));
    vi.stubGlobal("window", { confirm: mocks.confirm });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("requires dirty-form confirmation before switching and never puts contact values in the URL", () => {
    const address = field(renderWorkspace(), "hospital-contact-address");
    address.props.onChange?.({ currentTarget: { value: "แบบร่างในเครื่อง" } });

    const selector = field(renderWorkspace(), "hospital-contact-hospital");
    const selection = { value: hospitalB.id };
    selector.props.onChange?.({ currentTarget: selection });
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(selection.value).toBe(hospitalA.id);
    expect(harness.push).not.toHaveBeenCalled();

    mocks.confirm.mockReturnValue(true);
    selection.value = hospitalB.id;
    selector.props.onChange?.({ currentTarget: selection });
    expect(harness.push).toHaveBeenCalledExactlyOnceWith(
      `/app/hospitals/contact?hospitalId=${hospitalB.id}`,
    );
    expect(harness.push.mock.calls.join(" ")).not.toContain("แบบร่างในเครื่อง");
  });

  it.each([
    {
      outcome: "CREATED" as const,
      loaded: contact(),
      addressDraft: "ที่อยู่ใหม่",
      saved: contact({ addressText: "ที่อยู่ใหม่", expectedUpdatedAt: currentVersion }),
      message: "บันทึกข้อมูลติดต่อแล้ว",
    },
    {
      outcome: "UPDATED" as const,
      loaded: contact({ addressText: "ที่อยู่เดิม", expectedUpdatedAt: currentVersion }),
      addressDraft: "ที่อยู่เดิม",
      saved: contact({ addressText: "ที่อยู่เดิม", phoneNumber: "02-123-4567", expectedUpdatedAt: nextVersion }),
      message: "ปรับปรุงข้อมูลติดต่อแล้ว",
    },
    {
      outcome: "NOOP" as const,
      loaded: contact({ addressText: "ที่อยู่เดิม", expectedUpdatedAt: currentVersion }),
      addressDraft: "ที่อยู่เดิม ",
      saved: contact({ addressText: "ที่อยู่เดิม", expectedUpdatedAt: currentVersion }),
      message: "ข้อมูลติดต่อเป็นปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง",
    },
  ])("submits complete desired state and announces $outcome", async ({ outcome, loaded, addressDraft, saved, message }) => {
    mocks.update.mockResolvedValue(success(outcome, saved));
    field(renderWorkspace(loaded), "hospital-contact-address").props.onChange?.({
      currentTarget: { value: addressDraft },
    });
    const preventDefault = submit(renderWorkspace(loaded));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();

    await finishTransition();

    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      hospitalId: hospitalA.id,
      expectedUpdatedAt: loaded.expectedUpdatedAt,
      addressText: addressDraft,
      phoneNumber: null,
    });
    expect(markup(loaded)).toContain(message);
    expect(markup(loaded)).toContain('role="status"');
  });

  it.each([
    { fields: { addressText: "ตรวจสอบที่อยู่" }, focused: "hospital-contact-address" },
    { fields: { phoneNumber: "ตรวจสอบหมายเลขโทรศัพท์" }, focused: "hospital-contact-phone" },
    { fields: { addressText: "ตรวจสอบที่อยู่", phoneNumber: "ตรวจสอบหมายเลขโทรศัพท์" }, focused: "hospital-contact-address" },
  ])("focuses $focused after validation and preserves both exact draft values", async ({ fields, focused }) => {
    mocks.update.mockResolvedValue({
      status: "ERROR",
      code: "VALIDATION",
      message: "กรุณาตรวจสอบข้อมูลติดต่อที่กรอก",
      fieldErrors: fields,
    });
    const addressDraft = "  ร่างที่ยังเก็บไว้\n  บรรทัดถัดไป  ";
    const phoneDraft = " 02-123-4567 ต่อ 9 ";
    field(renderWorkspace(), "hospital-contact-address").props.onChange?.({ currentTarget: { value: addressDraft } });
    field(renderWorkspace(), "hospital-contact-phone").props.onChange?.({ currentTarget: { value: phoneDraft } });
    submit(renderWorkspace());
    const callback = harness.transitions.shift();
    if (!callback) {
      throw new Error("Missing queued transition");
    }
    await callback();
    const pendingTree = renderWorkspace();
    expect(field(pendingTree, focused).props.disabled).toBe(true);
    expect(harness.focus).not.toHaveBeenCalled();

    harness.pending = false;
    const tree = renderWorkspace();
    expect(harness.focus).toHaveBeenCalledExactlyOnceWith(focused);
    expect(field(tree, "hospital-contact-address").props.value).toBe(addressDraft);
    expect(field(tree, "hospital-contact-phone").props.value).toBe(phoneDraft);
    expect(markup()).toContain('aria-invalid="true"');
    expect(markup()).toContain('aria-describedby="hospital-contact-address-description hospital-contact-address-error"');
    expect(markup()).toContain('aria-describedby="hospital-contact-phone-description hospital-contact-phone-error"');
    expect(markup()).toContain('role="status"');
    expect(harness.focus).toHaveBeenCalledOnce();
  });

  it.each<HospitalContactMutationActionState>([
    { status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนแปลงแล้ว" },
    { status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" },
    { status: "ERROR", code: "UNAVAILABLE", message: "ไม่สามารถบันทึกได้" },
    { status: "UNCONFIRMED" },
    success("CREATED", contact()),
    success("UPDATED", contact()),
    success("NOOP", contact()),
  ])("does not focus an invalid field for non-validation result $status", async (result) => {
    mocks.update.mockResolvedValue(result);
    submit(renderWorkspace());
    await finishTransition();
    renderWorkspace();
    expect(harness.focus).not.toHaveBeenCalled();
  });

  it("announces an unavailable mutation once and retains its draft", async () => {
    mocks.update.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ไม่สามารถบันทึกได้" });
    field(renderWorkspace(), "hospital-contact-address").props.onChange?.({ currentTarget: { value: "แบบร่างที่เก็บไว้" } });
    submit(renderWorkspace());
    await finishTransition();
    const html = markup();
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).toContain("บันทึกข้อมูลติดต่อไม่สำเร็จ");
    expect(html).toContain("แบบร่างที่เก็บไว้");
  });

  it("holds local draft after conflict, loads current state explicitly, and never auto-merges or resubmits", async () => {
    const loaded = contact({ addressText: "ค่าเดิม", expectedUpdatedAt: currentVersion });
    mocks.update.mockResolvedValue({
      status: "ERROR",
      code: "CONFLICT",
      message: "ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลปัจจุบันเพื่อตรวจสอบ",
    });
    const current = contact({ addressText: "ข้อมูลล่าสุดของโรงพยาบาล", phoneNumber: "02-777-8888", expectedUpdatedAt: nextVersion });
    mocks.read.mockResolvedValue({ status: "SUCCESS", contact: current });
    field(renderWorkspace(loaded), "hospital-contact-address").props.onChange?.({
      currentTarget: { value: "แบบร่างของฉัน" },
    });
    submit(renderWorkspace(loaded));
    await finishTransition();
    expect(markup(loaded)).toContain("แบบร่างของฉัน");

    button(renderWorkspace(loaded), "โหลดข้อมูลปัจจุบัน").props.onClick?.();
    await finishTransition();
    const review = renderWorkspace(loaded);
    expect(markup(loaded)).toContain("ข้อมูลล่าสุดของโรงพยาบาล");
    expect(markup(loaded)).toContain("แบบร่างของฉัน");
    button(review, "เริ่มแก้ไขจากข้อมูลปัจจุบัน").props.onClick?.();

    const reconciled = renderWorkspace(loaded);
    expect(field(reconciled, "hospital-contact-address").props.value).toBe("ข้อมูลล่าสุดของโรงพยาบาล");
    expect(markup(loaded)).toContain("แบบร่างเดิมที่ยังไม่ได้ยืนยัน");
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(hospitalA.id);
  });

  it("keeps an unconfirmed draft and requires an explicit read without replay", async () => {
    mocks.update.mockResolvedValue({ status: "UNCONFIRMED" });
    field(renderWorkspace(), "hospital-contact-address").props.onChange?.({
      currentTarget: { value: "ค่าที่ยังไม่ยืนยัน" },
    });
    submit(renderWorkspace());
    await finishTransition();

    expect(markup()).toContain("ยังยืนยันผลการบันทึกไม่ได้");
    expect(markup()).toContain("ค่าที่ยังไม่ยืนยัน");
    button(renderWorkspace(), "โหลดข้อมูลปัจจุบัน").props.onClick?.();
    await finishTransition();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(hospitalA.id);
  });

  it("keeps load failure distinct from empty data and retains both drafts for review", async () => {
    mocks.update.mockResolvedValue({
      status: "ERROR",
      code: "CONFLICT",
      message: "ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลปัจจุบันเพื่อตรวจสอบ",
    });
    mocks.read.mockResolvedValue({ status: "UNAVAILABLE" });
    field(renderWorkspace(), "hospital-contact-address").props.onChange?.({
      currentTarget: { value: "ร่างระหว่างโหลดล้มเหลว" },
    });
    submit(renderWorkspace());
    await finishTransition();
    button(renderWorkspace(), "โหลดข้อมูลปัจจุบัน").props.onClick?.();
    await finishTransition();

    expect(markup()).toContain("โหลดข้อมูลปัจจุบันไม่สำเร็จ");
    expect(markup()).toContain("ร่างระหว่างโหลดล้มเหลว");
    expect(markup()).not.toContain("ยังไม่มีข้อมูลติดต่อ");
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("invalidates a successful review before another reload and preserves the original draft if it fails", async () => {
    mocks.update.mockResolvedValue({ status: "UNCONFIRMED" });
    mocks.read.mockResolvedValueOnce({ status: "SUCCESS", contact: contact({ addressText: "ข้อมูลจากรอบก่อน" }) })
      .mockResolvedValueOnce({ status: "UNAVAILABLE" });
    field(renderWorkspace(), "hospital-contact-address").props.onChange?.({ currentTarget: { value: "แบบร่างต้นฉบับ" } });
    field(renderWorkspace(), "hospital-contact-phone").props.onChange?.({ currentTarget: { value: "02-123-4567" } });
    submit(renderWorkspace());
    await finishTransition();
    button(renderWorkspace(), "โหลดข้อมูลปัจจุบัน").props.onClick?.();
    await finishTransition();
    expect(markup()).toContain("ข้อมูลจากรอบก่อน");
    expect(button(renderWorkspace(), "เริ่มแก้ไขจากข้อมูลปัจจุบัน")).toBeDefined();

    button(renderWorkspace(), "โหลดข้อมูลปัจจุบัน").props.onClick?.();
    const pending = markup();
    expect(pending).not.toContain("ข้อมูลจากรอบก่อน");
    expect(pending).not.toContain("ข้อมูลปัจจุบันจากโรงพยาบาล");
    expect(pending).not.toContain("เริ่มแก้ไขจากข้อมูลปัจจุบัน");
    await finishTransition();
    const failed = markup();
    expect(failed).toContain("โหลดข้อมูลปัจจุบันไม่สำเร็จ");
    expect(failed).not.toContain("ข้อมูลจากรอบก่อน");
    expect(failed).not.toContain("ข้อมูลปัจจุบันจากโรงพยาบาล");
    expect(failed).not.toContain("เริ่มแก้ไขจากข้อมูลปัจจุบัน");
    expect(failed).toContain("แบบร่างต้นฉบับ");
    expect(failed).toContain("02-123-4567");
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it("locks inputs while an owner mutation is pending", () => {
    field(renderWorkspace(), "hospital-contact-address").props.onChange?.({
      currentTarget: { value: "ค่าที่กำลังส่ง" },
    });
    submit(renderWorkspace());

    const tree = renderWorkspace();
    expect(field(tree, "hospital-contact-address").props.disabled).toBe(true);
    expect(field(tree, "hospital-contact-hospital").props.disabled).toBe(true);
    expect(button(tree, "กำลังบันทึก...").props.disabled).toBe(true);
  });

  it("clears private contact from view when the mutation reports revoked authority", async () => {
    const loaded = contact({ addressText: "ข้อมูลเดิมที่เป็นส่วนตัว", phoneNumber: "02-999-0000", expectedUpdatedAt: currentVersion });
    mocks.update.mockResolvedValue({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูลติดต่อของโรงพยาบาลนี้",
    });
    submit(renderWorkspace(loaded));
    await finishTransition();

    const html = markup(loaded);
    expect(html).toContain("สิทธิ์อาจเปลี่ยนแปลงแล้ว");
    expect(html).not.toContain("ข้อมูลเดิมที่เป็นส่วนตัว");
    expect(html).not.toContain("02-999-0000");
  });
});