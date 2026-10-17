# Phase B.2 — Hospital Onboarding Toast Integration

## Scope

Admin approval and rejection now receive transient feedback after a confirmed decision. The onboarding service calls, transaction boundaries, authorization checks, audit events, rejection-reason validation, and status transitions are unchanged.

## Result and notification mapping

| Result | Approve Toast | Reject Toast | Inline and recovery behavior |
| --- | --- | --- | --- |
| Confirmed `SUCCESS` with matching decision | `อนุมัติคำขอโรงพยาบาลแล้ว` | `ปฏิเสธคำขอโรงพยาบาลแล้ว` | Refresh the current detail route. The server page renders the persisted terminal status; review controls disappear and approval continuation remains available for approved applications. |
| `CONFLICT` | Warning: `คำขอนี้ถูกดำเนินการแล้ว โปรดตรวจสอบสถานะล่าสุด` | Same warning | Preserve the sanitized conflict detail inline. |
| `FORBIDDEN` | Error: `ไม่มีสิทธิ์อนุมัติคำขอโรงพยาบาล` | Error: `ไม่มีสิทธิ์ปฏิเสธคำขอโรงพยาบาล` | Preserve the sanitized access-denial detail inline. |
| `NOT_FOUND` | Warning: `ไม่พบคำขอที่ต้องการตรวจสอบ` | Same warning | Preserve the sanitized not-found detail inline. |
| `INVALID_INPUT` | None | None | Keep validation guidance inline and retain the rejection reason. |
| `UNAVAILABLE`, returned `IDLE`, mismatched success, or thrown request | None | None | Show reload-and-review recovery, suppress definitive failure text, and keep both decision actions locked until the page is reloaded. |

Toast copy contains no applicant, Hospital, credential, rejection-reason, or infrastructure details. Inline Alerts retain the actionable context; the extra outer live region was removed so the same Alert is not nested in a second announcement region. Toasts do not move keyboard focus.

## Success acknowledgement and navigation

The old review action always redirected after success, so the hydrated Client could not distinguish a confirmed result from an ordinary action return. The action state now includes `SUCCESS` with the decision kind and typed error codes.

The hydrated submit handler prevents native form dispatch and builds `FormData` from the submitted form and its submitter, following the input-preserving pattern used by `submitPreservingInput`. It adds a response-mode marker only to that in-memory payload and dispatches the existing Server Action through `useMutationActionState`. It does not add a hidden input to rendered HTML. The marker selects response presentation only; authorization and the domain decision run before it is read.

The form's native action remains the raw Server Action reference wrapped by `useActionState`, following the installed Next.js forms guide. A submission before hydration therefore has no response-mode marker: after the same authorization, service call, and path revalidation, the Server Action redirects to the existing application detail URL. For an enhanced Client submission, the action instead returns the matching typed `SUCCESS`. The Client emits one Toast and calls `router.refresh()` once; it does not push or replace the same URL. The refreshed Server Component remains the authority for the decision status.

The Server Action keeps `redirect()` outside its application-error `try/catch`. `unstable_rethrow()` is called first in the catch block so a framework navigation signal cannot be converted into an application error.

## Error and unknown-outcome handling

Review errors are classified at the transport boundary as `CONFLICT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, or `UNAVAILABLE`. Existing sanitized Thai messages are preserved for conflict, access denial, and not-found results. Validation has an inline-only result. Unexpected failures use `UNAVAILABLE` and never recommend an automatic retry.

`UNAVAILABLE`, a dispatched `IDLE`, a success for the wrong decision, and a thrown request are treated as unresolved. `useMutationActionState` preserves thrown-request behavior and rethrows Next.js navigation signals. Returned unresolved states use the same component-local recovery state. Both actions and the reason field are disabled, and `UnknownOutcomeAlert` offers a reload to read the latest authorized status. No request is retried automatically.

## Submission and input protection

A synchronous component-local guard allows one decision per application at a time, including across Approve and Reject. It blocks rapid duplicate submits before React updates pending state. Confirmed recoverable errors unlock a new intentional submission. Success remains locked while the authoritative refresh runs; unknown outcomes remain locked until reload.

Each operation has a local submission identity, application ID, and decision. Inline feedback, Toast emission, and refresh are applied only to the current matching submission. A keyed application boundary resets state when the component is reused for another application, and mounted checks suppress responses that arrive after unmount. Notifications are emitted in the awaited action wrapper, never from an effect observing retained action state.

The rejection textarea stays uncontrolled with the existing optional value and 500-character limit. The hydrated handler prevents React's post-action field reset by preventing the form's native dispatch, so a confirmed validation or conflict result keeps the exact draft. The reason is sent only to the rejection Server Action and is never included in Toast copy.

## Verification

Focused tests executed:

```text
npm run test -- 'app/app/admin/hospital-onboarding/[id]/review-actions.test.tsx' 'app/app/admin/hospital-onboarding/[id]/page.test.tsx' 'app/app/admin/hospital-onboarding/[id]/approval-continuation.test.ts' 'src/modules/hospital-onboarding/transport/server-actions.test.ts'
  Passed: 4 files, 38 tests

npm run typecheck
  Passed

npm run lint
  Passed: 0 errors; 2 existing <img> optimization warnings in Hospital content image components
```

Coverage includes result-to-Toast mapping, authorization and typed error handling, enhanced success and native redirect selection, exact rejection-reason submission and preservation, unknown outcomes, duplicate and cross-action locking, rerender deduplication, unmount and application-context replacement, and terminal status rendering.

The native redirect path is verified at the Server Action boundary by omitting the marker and asserting the unchanged detail URL. The component test also confirms the marker is not rendered into native form fields. No browser test with JavaScript disabled was run.

## Handoff for Phase B.3

For the next workflow, inspect its action contract and native navigation behavior before adding a success result. Keep notification emission tied to one confirmed submission, classify errors at the transport boundary, and decide recovery from the operation's persistence and idempotency guarantees. Preserve existing persistent status and inline recovery UI alongside Toasts.
