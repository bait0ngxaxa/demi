# Phase B.3.1 — Single Workforce Provisioning Toast Integration

## Scope

Transient feedback is integrated for adding one Hospital staff member and adding one OSM relationship. The existing provisioning Server Actions, service calls, authorization, audit records, transaction behavior, activation token lifecycle, bulk provisioning, and activation workflows remain unchanged.

## Result and notification mapping

| Result | Hospital staff | OSM | Persistent UI |
| --- | --- | --- | --- |
| Confirmed `SUCCESS` matching the submitted kind and Hospital | `บันทึกข้อมูลบุคลากรโรงพยาบาลแล้ว` | `บันทึกข้อมูล อสม. แล้ว` | Existing `ProvisionResult`, activation presentation, continuation links, and server-rendered roster |
| `CONFLICT` | Warning: `ไม่สามารถเพิ่มบุคลากรได้ กรุณาตรวจสอบรายการล่าสุด` | Warning: `ไม่สามารถเพิ่ม อสม. ได้ กรุณาตรวจสอบรายการล่าสุด` | Existing sanitized action error remains inline |
| `FORBIDDEN` | Error: `ไม่มีสิทธิ์เพิ่มบุคลากรของโรงพยาบาลนี้` | Error: `ไม่มีสิทธิ์เพิ่ม อสม. ของโรงพยาบาลนี้` | Existing access guidance remains inline |
| `INVALID_INPUT` | None | None | Existing validation feedback remains inline |
| `UNAVAILABLE`, returned `IDLE`, mismatched success, or thrown request | None | None | Unknown-outcome recovery; mutation controls remain blocked |

All Toast copy is static Thai text. It does not receive the action result or identity data. Idempotent results retain the existing activation presentation and use wording that does not claim a new account or relationship was created.

## Submission binding and duplicate protection

Each hydrated form submission receives a component-local identity containing its sequence number, submitted Hospital ID, and provisioning kind. The wrapper awaits the existing Server Action and returns its original state to `useMutationActionState`. It emits feedback only while the same submission is current, the component is mounted, and the displayed Hospital still matches. A success must also return the expected kind and Hospital ID.

Toast calls happen inside the awaited submission wrapper; they are not effects over retained action state. Rerenders and Server Component refreshes therefore do not replay feedback. A synchronous shared guard prevents rapid duplicate submits and prevents Staff and OSM requests from running at the same time. The Hospital selector is disabled during either request, with a synchronous handler guard as well. Existing bulk and activation pending restrictions remain in `actionsBlocked`.

Known results release the guard after the Action transition settles. `UNAVAILABLE`, `IDLE`, mismatched success, and thrown requests stay blocked until the user reloads and reviews the roster. They are never automatically resent. The existing `revalidatePath("/app/workforce")` remains responsible for returning the authoritative roster with the Server Action response; no client-side status is fabricated and no additional navigation is started.

## Unknown outcomes and Hospital context

`UNAVAILABLE` is treated as an unconfirmed persistence result because an unexpected error can happen after account or relationship persistence. Its definitive-looking action message is suppressed. The existing `UnknownOutcomeAlert` remains visible and explains that the account and relationship may already exist while the original activation link cannot be retrieved. The Admin must review the latest roster and use the existing explicit activation regeneration workflow only when appropriate; regeneration is not automatic and may revoke a previous usable link.

When the selected Hospital changes outside the guarded selector, responses for the old context do not emit Toasts, show results or errors in the new context, or reset the new form. An unconfirmed old request remains visible with a link back to its Hospital roster. Confirmed activation results already associated with another Hospital are hidden until that Hospital is selected again; credentials are never rendered under a different Hospital context.

## Activation credential and form handling

The one-time token, activation URL, and QR payload remain exclusively in the existing `ProvisionResult` and `ActivationPresentation`. Toasts receive only fixed messages; they contain no token, URL, QR data, names, national IDs, email, account or relationship identifiers, Hospital identifiers, or exception text.

Confirmed provisioning results are stored separately from the current submission/error state in Component memory, keyed by provisioning kind and Hospital. Switching the selected Hospital therefore shows only that Hospital's result, and returning to another Hospital restores its still-mounted in-memory credential instead of replacing it with a different Hospital's result.

When a confirmed result includes an activation token, the same-kind form for that Hospital stays disabled until the Admin confirms that the link was copied or delivered. The same check runs synchronously at dispatch, so submitting the form directly cannot bypass the disabled button. After acknowledgment, another same-kind submission may start; the previous credential stays visible while it is pending or unconfirmed and is replaced only by another matching authoritative success. Results without an activation token do not require this acknowledgment. Credentials are not written to localStorage, sessionStorage, Toasts, logs, or analytics.

The existing `submitPreservingInput` form convention is retained. Success resets a form only if its current values still match the submitted values; an edited draft is preserved. Confirmed errors, unknown outcomes, and stale context responses do not reset the form. A same-kind `UNAVAILABLE` or thrown request does not clear the previous credential or automatically retry the provisioning request.

## Verification

Focused tests executed:

```text
npm run test -- 'app/app/workforce/workforce-provision-toast.test.tsx' 'app/app/workforce/workforce-recovery.test.tsx' 'app/app/workforce/workforce-workspace.test.tsx' 'src/modules/workforce/transport/server-actions.test.ts'
  Passed: 4 files, 61 tests
```

The new component tests cover confirmed Staff/OSM success, delayed success, activation token privacy, idempotent result copy, conflict/forbidden/validation mapping, returned `UNAVAILABLE`, thrown requests, returned `IDLE`, rerender deduplication, form reset/preservation, rapid duplicate submissions, cross-form locking, context changes, stale unknown recovery, and unmount.

Credential-preservation regression tests additionally verify Staff and OSM same-Hospital replacement is blocked until acknowledgment, the prior Staff credential remains available after an acknowledged later submission returns `UNAVAILABLE`, and credentials for two Hospitals remain isolated when switching context.

Follow-up verification for Finding B31-01:

```text
npm run test -- 'app/app/workforce/workforce-provision-toast.test.tsx' 'app/app/workforce/workforce-recovery.test.tsx' 'app/app/workforce/workforce-workspace.test.tsx' 'src/modules/workforce/transport/server-actions.test.ts'
  Passed: 4 files, 66 tests

npm run test -- 'app/app/workforce/workforce-provision-toast.test.tsx'
  Passed: 1 file, 32 tests, including the final credential acknowledgment assertions

npm run typecheck
  Passed

npx eslint app/app/workforce/workforce-workspace.tsx app/app/workforce/workforce-provision-toast.test.tsx
  Passed

npm run lint
  Passed with 0 errors and 2 existing <img> optimization warnings in Hospital content components

git diff --check
  Passed
```

Local Next.js 16.3.0 Forms and Server Actions guides were inspected. They document action return values with `useActionState`, progressive form actions, and the re-rendered Server Component payload returned with immediate `revalidatePath`. The existing form `action` and `submitPreservingInput` arrangement was preserved. No browser test with JavaScript disabled was run.

`npm run typecheck`, `npm run lint`, and focused ESLint for the changed UI/tests passed. Full lint reported two existing `<img>` optimization warnings in the Hospital content image components; the changed Workforce files had no lint warnings. The Impeccable detector reported no findings.

## Remaining limitations and Phase B.3.2 handoff

- No real-browser test was run for a submission before hydration. The native form action wiring and Server Action contract were not changed.
- Unacknowledged credentials live only as long as this mounted Component. A page reload or navigation that unmounts the Workspace discards them; this preserves the one-time credential's in-memory-only boundary.
- The recovery path depends on the user reviewing the latest authorized Workforce roster; it does not prove which request created an existing relationship.
- Keep future notifications tied to a confirmed, submission-scoped result. Inspect credential recovery and idempotency guarantees before offering any retry, and preserve the same Hospital-context and one-time-credential boundaries.
