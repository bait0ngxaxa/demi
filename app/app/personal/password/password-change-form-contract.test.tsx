// @vitest-environment jsdom
// Form ↔ server contract: the password change form posts exactly the keys of
// authenticatedPasswordChangeSchema (strict), which the action receives as Object.fromEntries(formData).
// Password values are synthetic and never logged or snapshotted.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { authenticatedPasswordChangeSchema } from "@/modules/account-security/schemas/account-security-schemas";

import {
  captureSubmittedFormData,
  expectFormContract,
  installFormContractEnvironment,
  setFieldValue,
  submitForm,
} from "../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({ change: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/account-security/transport/server-actions", () => ({ changeAuthenticatedPasswordAction: actions.change }));

import { PasswordChangeForm } from "./password-change-form";

beforeAll(() => {
  installFormContractEnvironment();
});

describe("Password change form ↔ changeAuthenticatedPasswordAction", () => {
  it("posts the current password, the new password and its confirmation", async () => {
    actions.change.mockResolvedValue({ status: "IDLE" });
    const newPassword = "Contract-test-7491-ripple";
    const payload = await captureSubmittedFormData({
      render: () => <PasswordChangeForm />,
      action: actions.change,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="currentPassword"]'), "Previous-test-3302-harbor");
        setFieldValue(container.querySelector('[name="newPassword"]'), newPassword);
        setFieldValue(container.querySelector('[name="passwordConfirmation"]'), newPassword);
        const form = container.querySelector("form");
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    const parsed = expectFormContract(payload, {
      fields: Object.keys(authenticatedPasswordChangeSchema.shape),
      parse: (formData) => Object.fromEntries(formData.entries()),
      schema: authenticatedPasswordChangeSchema,
    });
    // Compare without printing the values on failure.
    expect((parsed as { newPassword: string }).newPassword === newPassword).toBe(true);
  });
});
