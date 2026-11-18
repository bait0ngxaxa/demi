/**
 * Form ↔ server contract tests.
 *
 * A component test mocks the server action, and a server-action test builds FormData by hand, so each
 * side can pass against a wrong assumption about the other (PR #31: the Follow-up form posted UI-only
 * radio names and the strict allow-list rejected every save). A contract test closes that gap: it
 * renders the real client form, captures the exact FormData the form hands to the (mocked) action,
 * and runs it through the real server parser, allow-list and request schema.
 *
 * Rules (also in docs/engineering/FORM_SERVER_CONTRACT_TESTS.md):
 * - Every server action that rejects unknown form fields has a contract test that uses
 *   `expectFormContract`.
 * - `fields` is the allow-list constant the server itself uses (exported from the transport module,
 *   or derived from the `.strict()` schema the action parses `Object.fromEntries` with), never a
 *   hand-written copy.
 * - UI-only controls are removed before dispatch (`dispatchFormDataPreservingInput` `omitFields`) or
 *   have no `name`.
 *
 * Registering a new strict form:
 * 1. Export the allow-list the server uses. A top-level "use server" module may export only async
 *    functions, so move the constant, unchanged, into a sibling module (see `goal-plan-form-input.ts`)
 *    and import it back into the action. An action that hands `Object.fromEntries(formData)` to a
 *    `.strict()` schema has no constant to export: the schema's keys are its allow-list.
 * 2. Write a jsdom component test next to the form that calls `captureSubmittedFormData` and
 *    `expectFormContract` once per form mode, with realistic filled input.
 * 3. Add the transport module to `FORM_CONTRACT_REGISTRY` below, naming every allow-list it guards and
 *    the test files that cover them. `src/shared/testing/form-contract-coverage.test.ts` finds strict
 *    parsers automatically (allow-list checks and `Object.fromEntries(formData…)` handed to a schema) and
 *    fails when a strict parser has no entry, when a listed test file is missing, or when a listed test does not
 *    mention a listed allow-list together with `expectFormContract`.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { ZodType } from "zod";

type ActionMock = { readonly mock: { readonly calls: readonly (readonly unknown[])[] } };

export type CaptureSubmittedFormDataOptions = {
  /** Renders the real client form. Mock only the server action module (and framework hooks). */
  readonly render: () => ReactNode;
  /** The mocked server action the form dispatches to. */
  readonly action: ActionMock;
  /** Fills the fields and triggers the submission, exactly as a user would. */
  readonly interact: (container: HTMLElement) => void | Promise<void>;
  /** Which call of `action` to read. Defaults to the last call. */
  readonly callIndex?: number;
};

/**
 * jsdom has no modal `<dialog>` support or `scrollTo`; forms that confirm in a dialog need both.
 * Call once from `beforeAll` in a jsdom test file.
 */
export function installFormContractEnvironment(): void {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.open = false; };
  HTMLElement.prototype.scrollTo ??= () => undefined;
  HTMLElement.prototype.scrollIntoView ??= () => undefined;
}

export async function settleForm(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Renders a real client form, lets the test fill and submit it, and returns the exact FormData instance
 * the form passed to the mocked server action. The FormData is never rebuilt from the DOM here.
 */
export async function captureSubmittedFormData(options: CaptureSubmittedFormDataOptions): Promise<FormData> {
  await interactWithForm(options);

  const calls = options.action.mock.calls;
  const call = calls[options.callIndex ?? calls.length - 1];
  const payload = call?.find((argument): argument is FormData => argument instanceof FormData);

  if (!payload) {
    throw new Error(
      `The form did not dispatch FormData to the server action (action was called ${calls.length} time(s)).`,
    );
  }

  return payload;
}

/**
 * Renders a real client form, runs the interaction and unmounts it. For actions that take a plain
 * object instead of FormData: read the object from the action mock and use `expectActionInputContract`.
 */
export async function interactWithForm(options: Pick<CaptureSubmittedFormDataOptions, "render" | "interact">): Promise<void> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() => root.render(options.render()));
    await options.interact(container);
    await settleForm();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
}

export type FormContract = {
  /** The allow-list the server action uses for this mode. */
  readonly fields: Iterable<string>;
  /** Allow-listed optional keys this form mode never posts, so the key comparison stays exact. */
  readonly notPosted?: readonly string[];
  /** Keys the server accepts more than once. */
  readonly repeatable?: readonly string[];
  /** The parser the real server action runs (`build*Input`, `parse*Form`, `Object.fromEntries`, …). */
  readonly parse: (formData: FormData) => unknown;
  /** The request schema the server action validates the parsed input with. */
  readonly schema?: ZodType;
};

function contractFailure(message: string): Error {
  return new Error(`Form ↔ server contract: ${message}`);
}

function describeKeys(keys: readonly string[]): string {
  return keys.length === 0 ? "(none)" : keys.join(", ");
}

/**
 * Asserts that the FormData a form posted is exactly what the server accepts:
 * (a) the key set, ignoring `$ACTION_*`, equals the allow-list (minus `notPosted`);
 * (b) no key appears twice unless it is `repeatable`;
 * (c) the server parser accepts it, and the schema (when given) parses its result.
 * Returns the parsed request (the schema output when a schema is given).
 */
/** Counts the posted keys and throws unless their set equals the allow-list minus `notPosted`. */
function assertExactKeys(
  postedKeys: readonly string[],
  fields: Iterable<string>,
  notPostedKeys: readonly string[] = [],
): Map<string, number> {
  const allowed = new Set(fields);
  const notPosted = new Set(notPostedKeys);

  for (const key of notPosted) {
    if (!allowed.has(key)) {
      throw contractFailure(`notPosted key "${key}" is not in the server allow-list.`);
    }
  }

  const counts = new Map<string, number>();
  for (const key of postedKeys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const actual = [...counts.keys()].sort();
  const expected = [...allowed].filter((key) => !notPosted.has(key)).sort();
  const extra = actual.filter((key) => !allowed.has(key) || notPosted.has(key));
  const missing = expected.filter((key) => !counts.has(key));

  if (extra.length > 0 || missing.length > 0) {
    throw contractFailure(
      `posted keys differ from the server allow-list.\n  extra (rejected by the server): ${describeKeys(extra)}\n  missing: ${describeKeys(missing)}`,
    );
  }

  return counts;
}

function parseWithSchema(schema: ZodType, input: unknown): unknown {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw contractFailure(`the request schema rejected the parsed input:\n${JSON.stringify(result.error.issues, null, 2)}`);
  }
  return result.data;
}

export function expectFormContract(formData: FormData, contract: FormContract): unknown {
  const repeatable = new Set(contract.repeatable ?? []);
  const postedKeys = [...formData.keys()].filter((key) => !key.startsWith("$ACTION_"));
  const counts = assertExactKeys(postedKeys, contract.fields, contract.notPosted);

  const duplicates = [...counts].filter(([key, count]) => count > 1 && !repeatable.has(key)).map(([key]) => key);
  if (duplicates.length > 0) {
    throw contractFailure(`keys posted more than once: ${describeKeys(duplicates)}`);
  }

  let parsed: unknown;
  try {
    parsed = contract.parse(formData);
  } catch (error) {
    throw contractFailure(`the server parser threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  }

  if (parsed === null || parsed === undefined) {
    throw contractFailure(`the server parser rejected the FormData (returned ${String(parsed)}).`);
  }

  return contract.schema ? parseWithSchema(contract.schema, parsed) : parsed;
}

export type ActionInputContract = {
  /** The keys the server accepts for this command. */
  readonly fields: Iterable<string>;
  readonly notPosted?: readonly string[];
  /** The schema the server action parses the object with. */
  readonly schema: ZodType;
};

/**
 * For server actions that take a plain object the client builds (from a form or from state) instead of
 * FormData: asserts the object's own keys equal the accepted keys and the action's schema accepts it.
 */
export function expectActionInputContract(input: unknown, contract: ActionInputContract): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw contractFailure(`the action input is not a plain object (${input === null ? "null" : typeof input}).`);
  }
  assertExactKeys(Object.keys(input), contract.fields, contract.notPosted);
  return parseWithSchema(contract.schema, input);
}

// ---------------------------------------------------------------------------------------------------
// DOM helpers for filling real forms.

export function setFieldValue(element: Element | null, value: string): void {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement) &&
    !(element instanceof HTMLSelectElement)
  ) {
    throw new Error(`setFieldValue: not a form field (${element === null ? "null" : element.tagName})`);
  }
  const prototype = element instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export function clickElement(element: Element | null): void {
  if (!(element instanceof HTMLElement)) {
    throw new Error("clickElement: element not found");
  }
  act(() => element.click());
}

export function findButton(scope: ParentNode, label: string | RegExp): HTMLButtonElement {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((node) => {
    const text = node.textContent?.trim() ?? "";
    return typeof label === "string" ? text === label : label.test(text);
  });
  if (!button) {
    throw new Error(`findButton: no button labelled ${String(label)}`);
  }
  return button;
}

export function clickButton(scope: ParentNode, label: string | RegExp): void {
  clickElement(findButton(scope, label));
}

/** Submits like a browser: native validation runs first, and the submitter is reported. */
export function submitForm(form: HTMLFormElement | null, submitter?: HTMLButtonElement | null): void {
  if (!form) {
    throw new Error("submitForm: form not found");
  }
  if (!form.checkValidity()) {
    const invalid = [...form.elements]
      .filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
      .filter((element) => !element.checkValidity())
      .map((element) => element.name || element.id);
    throw new Error(`submitForm: native validation blocked the submission (${invalid.join(", ")})`);
  }
  act(() => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter ?? null }));
  });
}

// ---------------------------------------------------------------------------------------------------
// Coverage registry. Every module listed here rejects unknown FormData keys; see the header comment.

export type FormContractRegistration = {
  /** Repo-relative path of the transport module that holds the strict check. */
  readonly module: string;
  /** Allow-list identifiers the contract tests import (exported constants, schemas or parsers). */
  readonly contracts: readonly string[];
  /** Repo-relative paths of the contract tests. */
  readonly tests: readonly string[];
};

const patients = "app/app/patients/[relationshipId]";
const program = `${patients}/programs/[programId]`;

export const FORM_CONTRACT_REGISTRY: readonly FormContractRegistration[] = [
  {
    module: "src/modules/followups/transport/server-action-helpers.ts",
    contracts: ["FOLLOWUP_FORM_FIELDS", "FOLLOWUP_PROGRAM_FORM_FIELDS"],
    tests: [`${patients}/followups/new/followup-form.test.tsx`],
  },
  {
    module: "src/modules/patient-program-rounds/transport/server-action-helpers.ts",
    contracts: [
      "VITALS_FORM_FIELDS",
      "PROFILE_FORM_FIELDS",
      "STEP_FORM_FIELDS",
      "COMPLETION_FORM_FIELDS",
      "ACHIEVE_SCORE_FORM_FIELDS",
      "REVIEW_FORM_FIELDS",
    ],
    tests: [`${program}/rounds/[roundNumber]/round-form-contracts.test.tsx`],
  },
  {
    module: "src/modules/patient-baseline/transport/server-action-helpers.ts",
    contracts: ["PATIENT_BASELINE_FORM_FIELDS", "PATIENT_BASELINE_UPDATE_FORM_FIELDS"],
    tests: [`${patients}/baseline/baseline-form-contract.test.tsx`],
  },
  {
    module: "src/modules/patient-final-assessment/transport/server-action-helpers.ts",
    contracts: ["FINAL_ASSESSMENT_FORM_FIELDS"],
    tests: [`${program}/final-assessment-contract.test.tsx`],
  },
  {
    module: "src/modules/goals/transport/goal-plan-form-input.ts",
    contracts: ["GOAL_PLAN_FORM_FIELDS", "GOAL_PLAN_PROGRAM_FORM_FIELDS"],
    tests: [`${patients}/goals/new/goal-plan-form-contract.test.tsx`],
  },
  {
    module: "src/modules/screening/transport/screening-form-input.ts",
    contracts: ["screeningFormFields"],
    tests: [`${patients}/screenings/new/screening-form-contract.test.tsx`],
  },
  {
    module: "src/modules/patient-program/transport/service-one-form-input.ts",
    contracts: [
      "SERVICE_ONE_ROUTINE_FORM_FIELDS",
      "SERVICE_ONE_FLOATING_CHART_FORM_FIELDS",
      "SERVICE_ONE_DREAM_CARD_FORM_FIELDS",
      "SERVICE_ONE_CONFIDENCE_FORM_FIELDS",
      "SERVICE_ONE_ARTIFACT_ASSOCIATION_FORM_FIELDS",
    ],
    tests: [`${program}/service-one-form-contracts.test.tsx`],
  },
  {
    module: "src/modules/patient-program/transport/program-form-input.ts",
    contracts: ["PROGRAM_OPEN_FORM_FIELDS", "PROGRAM_COMPLETE_FORM_FIELDS"],
    tests: [`${patients}/programs/program-mutation-controls-contract.test.tsx`],
  },
  {
    module: "src/modules/appointments/transport/appointment-form-input.ts",
    contracts: [
      "CREATE_FORM_FIELDS",
      "RESCHEDULE_FORM_FIELDS",
      "TRANSITION_FORM_FIELDS",
      "ACKNOWLEDGEMENT_FORM_FIELDS",
      "ASSIGNMENT_ACCEPTANCE_FORM_FIELDS",
      "CANCELLATION_REQUEST_FORM_FIELDS",
      "COORDINATION_FORM_FIELDS",
      "CANCELLATION_REVIEW_FORM_FIELDS",
    ],
    tests: [
      `${patients}/appointments/new/appointment-form-contract.test.tsx`,
      `${patients}/appointments/[appointmentId]/appointment-controls-contract.test.tsx`,
      "app/app/personal/appointments/patient-appointment-interaction-contract.test.tsx",
    ],
  },
  {
    module: "src/modules/exercises/transport/exercise-form.ts",
    contracts: ["EXERCISE_FORM_FIELD_LIMITS"],
    tests: ["app/app/personal/wellness/personal-wellness-form-contracts.test.tsx"],
  },
  {
    module: "src/modules/meals/transport/meal-form.ts",
    contracts: ["MEAL_FORM_FIELD_LIMITS"],
    tests: ["app/app/personal/wellness/personal-wellness-form-contracts.test.tsx"],
  },
  {
    module: "src/modules/weight-goals/transport/weight-goal-form.ts",
    contracts: ["WEIGHT_GOAL_FORM_FIELD_LIMITS"],
    tests: ["app/app/personal/wellness/personal-wellness-form-contracts.test.tsx"],
  },
  {
    module: "src/modules/medications/transport/schedule-form.ts",
    contracts: [
      "MEDICATION_CREATE_FORM_FIELD_LIMITS",
      "MEDICATION_SCHEDULE_FORM_FIELD_LIMITS",
      "personalMedicationUpdateSchema",
      "personalMedicationStopSchema",
    ],
    tests: ["app/app/personal/medications/personal-medication-form-contracts.test.tsx"],
  },
  {
    module: "src/modules/hospital-content/schemas/hospital-content-schemas.ts",
    contracts: ["COMMAND_KEYS"],
    tests: ["app/app/hospitals/knowledge/hospital-content-form-contracts.test.tsx"],
  },
  // Actions that pass `Object.fromEntries(formData)` to a `.strict()` schema; the coverage test finds them.
  {
    module: "src/modules/account-security/transport/server-actions.ts",
    contracts: ["authenticatedPasswordChangeSchema"],
    tests: ["app/app/personal/password/password-change-form-contract.test.tsx"],
  },
  // The self-measurement action reads each posted field itself (no allow-list check, no Object.fromEntries),
  // so no source pattern finds it; it is registered by hand.
  {
    module: "src/modules/patient-self-measurements/transport/self-measurement-form-input.ts",
    contracts: ["patientSelfMeasurementCreateSchema"],
    tests: ["app/app/personal/measurements/patient-self-measurement-form-contract.test.tsx"],
  },
  {
    module: "src/modules/patient-hospital-profile/transport/hospital-patient-edit-input.ts",
    contracts: ["staffPatientHospitalProfileUpdateSchema", "patientHealthHistorySchema"],
    tests: [`${patients}/hospital-patient-edit-form-contract.test.tsx`],
  },
  {
    module: "src/modules/patient-hospital-profile/transport/server-actions.ts",
    contracts: ["patientHospitalProfileUpdateSchema"],
    tests: ["app/app/personal/profile/[relationshipId]/profile-editor-contract.test.tsx"],
  },
];
