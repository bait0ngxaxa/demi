// @vitest-environment jsdom
// Form ↔ server contract for Hospital Content. These actions take a plain object, not FormData:
// - the create form reads `new FormData(form)` through hospitalContentFormEntriesToObject(…, "CREATE"),
//   so the entries the form produced are checked against COMMAND_KEYS.CREATE (minus the two keys the
//   client adds), and the object sent to createHospitalContentAction against hospitalContentCreateSchema;
// - the detail workspace builds its edit and lifecycle objects from state; each is checked against
//   COMMAND_KEYS and its command schema.
import { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hospitalContentArchiveSchema,
  hospitalContentCreateSchema,
  hospitalContentEditSchema,
  hospitalContentFormEntriesToObject,
  hospitalContentPublishSchema,
  hospitalContentSchemaInternals,
  hospitalContentWithdrawSchema,
} from "@/modules/hospital-content/schemas/hospital-content-schemas";
import type { HospitalContentDetailProjection, HospitalContentOwnerHospital } from "@/modules/hospital-content/types/hospital-content-projections";

import {
  captureSubmittedFormData,
  clickElement,
  expectActionInputContract,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  interactWithForm,
  setFieldValue,
  settleForm,
  submitForm,
} from "../../../../tests/support/form-contract";

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  publish: vi.fn(),
  read: vi.fn(),
  reconcile: vi.fn(),
  withdraw: vi.fn(),
  /** Receives the entries the create form produced, as the FormData they came from. */
  formEntries: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/modules/hospital-content/transport/server-actions", () => ({
  archiveHospitalContentAction: mocks.archive,
  createHospitalContentAction: mocks.create,
  editHospitalContentDraftAction: mocks.edit,
  publishHospitalContentAction: mocks.publish,
  readHospitalContentCurrentAction: mocks.read,
  reconcileHospitalContentCreateAction: mocks.reconcile,
  removeHospitalContentImageAction: vi.fn(),
  reorderHospitalContentImagesAction: vi.fn(),
  withdrawHospitalContentAction: mocks.withdraw,
}));
vi.mock("@/modules/hospital-content/schemas/hospital-content-schemas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/hospital-content/schemas/hospital-content-schemas")>();
  return {
    ...actual,
    hospitalContentFormEntriesToObject: (entries: Iterable<readonly [string, FormDataEntryValue]>, command: Parameters<typeof actual.hospitalContentFormEntriesToObject>[1]) => {
      const list = [...entries];
      const formData = new FormData();
      for (const [key, value] of list) formData.append(key, value);
      mocks.formEntries(formData, command);
      return actual.hospitalContentFormEntriesToObject(list, command);
    },
  };
});

import { HospitalContentDetailWorkspace } from "./[contentId]/hospital-content-detail-workspace";
import { HospitalContentCreateForm } from "./new/hospital-content-create-form";

const { COMMAND_KEYS } = hospitalContentSchemaInternals;
const hospital: HospitalContentOwnerHospital = { id: "11111111-1111-4111-8111-111111111111", hospitalCode: "H-001", name: "โรงพยาบาลทดสอบ" };
const contentId = "22222222-2222-4222-8222-222222222222";
const expectedUpdatedAt = "2026-11-05T02:03:04.005Z";

function content(overrides: Partial<HospitalContentDetailProjection> = {}): HospitalContentDetailProjection {
  return {
    id: contentId,
    hospital,
    title: "กินผักให้ครบ 5 สี",
    body: "ผักหลากสีให้วิตามินต่างกัน",
    category: HospitalContentCategory.FOOD,
    sourceText: null,
    status: HospitalContentStatus.DRAFT,
    firstPublishedAt: null,
    latestPublishedAt: null,
    expectedUpdatedAt,
    imageIds: [],
    ...overrides,
  };
}

let uuidCounter = 0;

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  uuidCounter = 0;
  Object.defineProperty(window.crypto, "randomUUID", {
    configurable: true,
    value: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
  });
  mocks.reconcile.mockResolvedValue({ status: "SUCCESS", result: { status: "ABSENT" } });
  mocks.create.mockResolvedValue({ status: "SUCCESS", result: { outcome: "CREATED", content: content() } });
  for (const action of [mocks.edit, mocks.publish, mocks.withdraw, mocks.archive]) {
    action.mockResolvedValue({ status: "SUCCESS", result: { content: content() } });
  }
});

describe("Hospital Content create form ↔ createHospitalContentAction", () => {
  it("posts the create fields the parser accepts, and sends the object the create schema accepts", async () => {
    const formData = await captureSubmittedFormData({
      render: () => <HospitalContentCreateForm hospitals={[hospital]} recoveryScope="contract" selectedHospitalId={hospital.id} />,
      action: mocks.formEntries,
      interact: async (container) => {
        await settleForm();
        setFieldValue(container.querySelector("#hospital-content-title"), "ลดหวานวันละนิด");
        setFieldValue(container.querySelector("#hospital-content-body"), "เริ่มจากลดน้ำตาลในกาแฟครึ่งช้อน");
        setFieldValue(container.querySelector("#hospital-content-category"), HospitalContentCategory.FOOD);
        setFieldValue(container.querySelector('[name="sourceText"]'), "กรมอนามัย");
        const button = findButton(container, "บันทึกฉบับร่าง");
        submitForm(button.form, button);
        await settleForm();
      },
    });

    expect(expectFormContract(formData, {
      fields: COMMAND_KEYS.CREATE,
      notPosted: ["hospitalId", "submissionNonce"],
      parse: (data) => hospitalContentFormEntriesToObject(data.entries(), "CREATE"),
    })).toMatchObject({ title: "ลดหวานวันละนิด", category: HospitalContentCategory.FOOD });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(expectActionInputContract(mocks.create.mock.calls[0]?.[0], { fields: COMMAND_KEYS.CREATE, schema: hospitalContentCreateSchema }))
      .toMatchObject({ hospitalId: hospital.id, title: "ลดหวานวันละนิด", sourceText: "กรมอนามัย" });
  });
});

describe("Hospital Content detail workspace ↔ edit and lifecycle actions", () => {
  async function confirm(label: string): Promise<void> {
    const button = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((node) => node.textContent?.trim() === label);
    clickElement(button ?? null);
    await settleForm();
  }

  it("save draft sends the edit fields", async () => {
    await interactWithForm({
      render: () => <HospitalContentDetailWorkspace content={content()} />,
      interact: async (container) => {
        setFieldValue(container.querySelector("#hospital-content-title"), "กินผักให้ครบ 5 สีทุกวัน");
        const button = findButton(container, "บันทึกฉบับร่าง");
        submitForm(button.form, button);
        await settleForm();
      },
    });

    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(expectActionInputContract(mocks.edit.mock.calls[0]?.[0], { fields: COMMAND_KEYS.EDIT, schema: hospitalContentEditSchema }))
      .toMatchObject({ contentId, expectedUpdatedAt, title: "กินผักให้ครบ 5 สีทุกวัน", sourceText: null });
  });

  const lifecycle = [
    { command: "PUBLISH", status: HospitalContentStatus.DRAFT, trigger: "เผยแพร่", confirmLabel: "เผยแพร่", action: mocks.publish, schema: hospitalContentPublishSchema },
    { command: "WITHDRAW", status: HospitalContentStatus.PUBLISHED, trigger: "ถอนการเผยแพร่เพื่อแก้ไข", confirmLabel: "ถอนการเผยแพร่", action: mocks.withdraw, schema: hospitalContentWithdrawSchema },
    { command: "ARCHIVE", status: HospitalContentStatus.DRAFT, trigger: "เก็บถาวร", confirmLabel: "เก็บถาวร", action: mocks.archive, schema: hospitalContentArchiveSchema },
  ] as const;

  for (const { command, status, trigger, confirmLabel, action, schema } of lifecycle) {
    it(`${command.toLowerCase()} sends the content version after confirmation`, async () => {
      await interactWithForm({
        render: () => <HospitalContentDetailWorkspace content={content({ status })} />,
        interact: async (container) => {
          clickElement(findButton(container, trigger));
          await confirm(confirmLabel);
        },
      });

      expect(action).toHaveBeenCalledTimes(1);
      expect(expectActionInputContract(action.mock.calls[0]?.[0], { fields: COMMAND_KEYS[command], schema }))
        .toEqual({ contentId, expectedUpdatedAt });
    });
  }
});
