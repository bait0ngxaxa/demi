# Form ↔ server contract tests

A component test mocks the server action, and a server-action test builds its FormData by hand. Each side
can then pass against a wrong assumption about the other. In PR #31 the Follow-up form posted UI-only radio
names, and the strict allow-list rejected every save while both test suites stayed green.

A contract test renders the real client form, captures the exact FormData the form hands to the mocked
action, and runs it through the real server parser, allow-list and request schema.

## Rules

- Every server action that rejects unknown form fields must have a contract test that uses
  `expectFormContract` (`tests/support/form-contract.ts`). An action that takes a plain object built by
  the client uses `expectActionInputContract` instead.
- The contract's `fields` must be the allow-list the server uses, imported from the transport module, or
  the keys of the `.strict()` schema the action parses. Never use a hand-written copy. A top-level
  `"use server"` module may export only async functions, so keep the allow-list and its parser in a
  sibling module (for example `goal-plan-form-input.ts`) that the action imports.
- UI-only controls must be removed before dispatch (`dispatchFormDataPreservingInput` `omitFields`), or
  must have no `name`.
- Register each strict parser in `FORM_CONTRACT_REGISTRY`. `src/shared/testing/form-contract-coverage.test.ts`
  fails when a strict parser has no registration, when an exported `*_FORM_FIELDS` or
  `*_FORM_FIELD_LIMITS` allow-list is not registered, or when a registered test does not use the
  allow-list it is registered for.

## Writing one

1. Mock the server action module (and `next/navigation`), not the form's own helpers.
2. Call `captureSubmittedFormData({ render, action, interact })`. Fill the fields and submit the form the
   way a user would, with `setFieldValue`, `clickButton` and `submitForm`.
3. Call `expectFormContract(formData, { fields, parse, schema })`. List optional allow-listed keys that
   this form mode never posts in `notPosted`, so the comparison stays exact.
4. Add one test per form mode, for example create vs update, or Program vs relationship.
