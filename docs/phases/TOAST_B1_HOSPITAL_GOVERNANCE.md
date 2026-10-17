# Phase B.1 — Admin Hospital Governance Toast Integration

## Scope

Transient notifications are integrated for suspending an active Hospital and restoring a suspended Hospital. The existing inline Alerts, suspension confirmation, Server Action signatures and results, `expectedUpdatedAt` values, authorization checks, persistence rules, `revalidatePath` calls, and authoritative status rendering remain in place.

## Result feedback

| Operation result | Toast | Inline feedback and recovery |
| --- | --- | --- |
| Confirmed suspend success | `ระงับโรงพยาบาลแล้ว` | Existing success Alert; refresh reads the persisted `SUSPENDED` state |
| Confirmed restore success | `คืนสถานะโรงพยาบาลแล้ว` | Existing success Alert; refresh reads the persisted `ACTIVE` state |
| `CONFLICT` | Warning: `สถานะโรงพยาบาลเปลี่ยนแปลงแล้ว โปรดโหลดข้อมูลล่าสุด` | Existing conflict explanation |
| `FORBIDDEN` | Error: `ไม่มีสิทธิ์จัดการสถานะโรงพยาบาล` | Existing access-denial explanation |
| `INVALID_INPUT` | None | Existing validation guidance |
| `UNAVAILABLE`, returned `IDLE`, or thrown request | None | Unknown-outcome Alert with reload-and-review action; mutations remain locked until the page is reloaded |

## Emission, refresh, and navigation behavior

Each operation uses a component-local wrapper around its existing Server Action. The wrapper awaits that submission's returned state and emits feedback only for the authoritative result codes above. It does not catch action exceptions, so `useMutationActionState` continues to pass Next.js redirect/navigation signals through `unstable_rethrow` and represents ordinary thrown requests as unknown outcomes.

Toast emission is not tied to an effect that observes persisted action state. It occurs only in the wrapper invocation for the user submission, after checking that the component is still mounted and that the submitted Hospital/version context still matches the current page or the returned success result. Rerenders and `router.refresh()` therefore do not replay a prior Toast. A later user submission has its own wrapper invocation and can receive its own feedback.

The existing success effect still calls `router.refresh()`. The component does not fabricate a status update; the server-rendered Hospital status remains authoritative. The existing `revalidatePath` behavior and `expectedUpdatedAt` payload are unchanged. No Toast is emitted when an action settles without a confirmed result.

Restore also uses a synchronous in-flight guard around form dispatch so rapid duplicate submissions cannot queue. Suspension continues to use `ConfirmableActionForm`; confirmation is required, and its existing pending/unknown guards remain active. If the result is uncertain, confirmation stays visibly unresolved and the dialog's close control is labeled `ปิดหน้าต่าง` so closing it is not presented as canceling the already-dispatched operation. The page-level recovery Alert then provides the reload action.

## `UNAVAILABLE` and unknown outcomes

The Server Action contract uses `ERROR` as its transport discriminant, but `UNAVAILABLE` does not prove that persistence rolled back. The UI therefore hides its definitive-looking action error, emits no failure Toast, retains the displayed Hospital details, explains that the persisted status must be checked, and blocks follow-up mutations until reload. Reload reads the latest Hospital status; it does not retry or claim which request changed it. Thrown requests continue through `useMutationActionState` and receive the same recovery behavior.

## Regression coverage and verification

The component tests cover confirmation and cancellation, exact success Toasts, conflict/access/validation mapping, returned `UNAVAILABLE` and `IDLE`, thrown requests, inline feedback, no retry, duplicate submission guards, refresh and rerender deduplication, a stale Hospital context, and a result arriving after unmount.

Commands run:

```text
npm run test -- 'app/app/admin/hospitals/[hospitalId]/hospital-governance-controls.test.tsx'
  Passed: 1 file, 20 tests

npm run test -- 'src/components/ui/confirmable-action-form.test.tsx' 'src/modules/hospital-governance/transport/server-actions.test.ts'
  Passed: 2 files, 11 tests

npx eslint 'app/app/admin/hospitals/[hospitalId]/hospital-governance-controls.tsx' 'app/app/admin/hospitals/[hospitalId]/hospital-governance-controls.test.tsx' 'src/components/ui/confirmable-action-form.tsx'
  Passed

npm run typecheck
  Passed

npm run lint
  Passed: 0 errors; 2 pre-existing <img> optimization warnings in Hospital content image components

Impeccable detector on the two changed UI components
  Passed: no findings
```

The full test suite has not been run. No production build or browser-based visual verification was run; this change preserves the existing visual layout and adds state/recovery behavior.

## Phase B.2 handoff

Keep feedback bound to the specific user-initiated action result. Before choosing recovery for another workflow, inspect whether its `UNAVAILABLE` result can follow a committed write and whether the page can authoritatively reload or verify the affected resource. Use a retry/resend only when the operation's existing idempotency contract proves it safe. Do not extend the Hospital governance behavior to the remaining Phase B workflows as part of B.1.
