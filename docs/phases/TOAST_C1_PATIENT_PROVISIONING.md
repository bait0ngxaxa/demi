# Phase C.1 — Single Patient Provisioning Toast Integration

Status: Phase C.1 complete. Phase C as a whole is **not** complete.

## 1. Scope

Transient feedback is integrated for the single-Patient mode ("เพิ่มรายบุคคล") of `PatientProvisioningWorkspace` (`app/app/patients/provision/patient-provisioning-workspace.tsx`).

Unchanged: `provisionPatientAction` and its request/response contract, `PatientProvisionActionState`, the provisioning service and transaction, Person/User reuse, Patient role and Hospital relationship creation, HN consistency, account status, access capabilities, audit events, activation credential ownership, the shared `useMutationActionState` and `notify` helpers, and the Excel import preview/confirmation flow.

Out of scope and untouched: Excel import and bulk result notifications, Patient activation, profile editing and classification, OSM assignment, Patient Care End, clinical/care workflows, schema and migrations, authentication.

## 2. Result-to-Toast matrix

| Authoritative result | Toast | Inline UI |
| --- | --- | --- |
| `SUCCESS` + `CREATED`, `result.hospitalId` equals the submitted Hospital, page still shows that Hospital | `notify.success("เพิ่มข้อมูลผู้ป่วยแล้ว")` | Existing success `ProvisionResult` with continuation links; form reset if it still holds the submitted values |
| `SUCCESS` + `ALREADY_PROVISIONED` | None | Existing "ผู้ป่วยรายนี้มีข้อมูลในโรงพยาบาลแล้ว" explanation and continuation links |
| `ERROR` + `INVALID_INPUT` | None | Existing field errors and inline message; input kept |
| `ERROR` + `CONFLICT` | `notify.warning("ข้อมูลผู้ป่วยขัดแย้งกับข้อมูลเดิม กรุณาตรวจสอบ")` | Existing sanitized conflict message; input kept |
| `ERROR` + `FORBIDDEN` | `notify.error("ไม่มีสิทธิ์เพิ่มผู้ป่วยในโรงพยาบาลนี้")` | Existing access message; input kept |
| `ERROR` + `UNAVAILABLE` | None | Unknown-outcome recovery (section 4); the "ลองใหม่อีกครั้ง" message is no longer shown |
| Thrown request or returned `IDLE` | None | Unknown-outcome recovery |
| `SUCCESS` whose `hospitalId` differs from the submitted Hospital | None | Treated as unconfirmed; never displayed as a result |
| Any result that settles after the page switched to another Hospital, or after unmount | None | Not shown in the other Hospital; no form reset |

Toast copy is static Thai text chosen by verdict. It never receives the action result, national ID, names, HN, Hospital or relationship IDs, account data, or server messages.

## 3. Why `ALREADY_PROVISIONED` is not a create success

The transaction returns `ALREADY_PROVISIONED` when it found an existing Person, User, Patient role, profile and Hospital relationship and changed nothing. Nothing was created and no audit event was written, so a "เพิ่มข้อมูลผู้ป่วยแล้ว" Toast would misreport the operation. The existing neutral Alert already states the Patient exists and that no duplicate was created, and keeps the continuation links. It is also the expected answer when the user re-sends an unconfirmed request that had in fact committed (section 4), where a success Toast would claim credit for an earlier request.

## 4. Unknown outcome and replay

`provisionPatientAction` maps any unexpected exception to `ERROR` + `UNAVAILABLE`, including exceptions raised after the transaction may have committed. A rejected request (network loss, crash) proves nothing either. Both, plus a returned `IDLE` and a mismatched-Hospital success, are classified `UNCONFIRMED`:

- No Toast and no failure message; the action state is reset to `IDLE` so an older result is not shown beside the warning.
- The existing `UnknownOutcomeAlert` with `kind: "resend"` is shown for the Hospital the request was submitted for. Before this phase, only a thrown request reached it; a returned `UNAVAILABLE` showed a definitive-looking "ระบบไม่พร้อม… กรุณาลองใหม่อีกครั้ง" Alert.
- Typed input is kept. The submit button is disabled, and the synchronous guard refuses a new form submission for that Hospital.
- "ตรวจสอบผลด้วยคำขอเดิม" dispatches the exact `FormData` object of the unconfirmed request again. No identifier is generated client-side; the request identity is the existing natural key (Thai national ID + target Hospital), which the transaction already deduplicates: a committed earlier request answers `ALREADY_PROVISIONED`, an uncommitted one answers `CREATED`. Re-send never runs automatically.
- The resend alert keeps its existing `beforeunload` warning while active.

No idempotency guarantee is added beyond the existing service behavior. The hook's own thrown-request flag (`unknownOutcome`) and `resendUnconfirmed` are not used by this form; the component keeps its own per-Hospital record so that the returned-`UNAVAILABLE` and thrown cases are handled identically.

## 5. Submission lifecycle and Hospital context

- Each hydrated submission dispatches `{ hospitalId, formData }`, where `hospitalId` is the `targetHospitalId` actually sent to the server.
- `sendProvision` acquires a ref-based single-flight lock synchronously before dispatching, so a rapid second submit never reaches the Server Action. The lock is released when the awaited action settles.
- The wrapper passed to `useMutationActionState` awaits `provisionPatientAction` and is the only place a Toast or form reset happens. Toasts are not derived from retained `useActionState` state, so rerenders, mode switches and remounts do not replay them.
- Feedback is emitted only if the component is still mounted and the displayed Hospital (`activeHospitalIdRef`, updated in a layout effect) equals the submitted Hospital.
- The Hospital selector is disabled while a request is in flight, with the same check in `changeHospital`. If the Hospital changes by other navigation (for example browser history), the late response produces no Toast, no reset and no inline result in the new Hospital.
- Displayed feedback is gated by Hospital: a success only when `result.hospitalId` equals the displayed Hospital, an error only when it was returned for the displayed Hospital. Continuation links (Patient Detail, Patient Activation Management) therefore never appear under another Hospital. Returning to the original Hospital shows its own result again.
- Unconfirmed records are kept per Hospital. Switching away hides the warning; switching back restores it and the resend action.
- A confirmed success resets the form only when its current values (Hospital, names, national ID, HN) still equal the submitted ones, so an edit made while the request was pending is preserved.

## 6. Inline feedback and accessibility

Field errors, the existing-Patient explanation, conflict and access messages, unknown-outcome recovery, and continuation links remain inline and are the source of truth. Toasts only summarize. Pending label, `loading` state, disabled states, focus behavior and the shared Toaster's announcement and reduced-motion behavior are unchanged.

## 7. Verification

Focused tests added to `app/app/patients/provision/patient-provisioning-workspace-interactions.test.tsx` (deferred promises for races):

1. `CREATED` → exactly one success Toast, form reset, continuation links; no replay after rerender and mode switch.
2. `ALREADY_PROVISIONED` → no Toast; existing explanation and link.
3. `INVALID_INPUT` → no Toast; field error, `aria-invalid`, input kept.
4. `CONFLICT` → warning Toast; inline message; form not locked.
5. `FORBIDDEN` → error Toast; inline message.
6. Returned `UNAVAILABLE` → no Toast; no failure text; unknown-outcome alert; input kept; submit disabled.
7. Thrown request → no Toast; alert; a direct form submit is refused; resend sends the identical `FormData` (national ID and HN unchanged even after the user edits the field) and an `ALREADY_PROVISIONED` reply clears the alert without a Toast or reset of the edited draft.
8. Two synchronous form submit events → one Server Action call (verified to fail when the guard is removed).
9. Selector disabled while in flight.
10. Success settling after a Hospital change → no Toast, new draft kept, no continuation links.
11. `UNAVAILABLE` settling after a Hospital change → hidden in the other Hospital, restored on return.
12. Success for a different Hospital → unconfirmed.
13. Unmount before resolution → no Toast.

The existing static continuation tests in `src/modules/patient-provisioning/transport/patient-provisioning-workspace.test.ts` pass unmodified.

```text
npx vitest run app/app/patients/provision src/modules/patient-provisioning/transport/patient-provisioning-workspace.test.ts src/modules/patient-provisioning/transport/server-actions.test.ts src/components/ui/mutation-action-state.test.tsx
  Passed: 4 files, 60 tests

npm run typecheck
  Passed

npm run lint
  0 errors; 2 existing <img> warnings in Hospital content components

git diff --check
  No whitespace errors
```

The full test suite was not run: the change is confined to one client component and its tests, with no shared contract changes.

## 8. Limitations and unverified behavior

- No browser test was run. Behavior rests on jsdom component tests.
- Submission before hydration was not tested. As before this phase, the form `action` is a client function, so the form has no working no-JavaScript path; this was not changed.
- Unconfirmed payloads live only in the mounted component. A reload or leaving the page discards them (the resend alert warns before unload); the user can re-enter the same national ID, which the service deduplicates the same way.
- Resend proves only that the Patient now exists in the Hospital, not which request created it.

## 9. Phase C.2 handoff

- Reuse the pattern here: await the Server Action inside a client wrapper, classify the result, gate Toasts on mount and Hospital context, and never derive Toasts from retained action state.
- Treat `UNAVAILABLE` from Patient Server Actions as unconfirmed unless the action is read-only.
- Before offering resend, confirm the service deduplicates the exact request identity; otherwise use `review` or `reload` recovery.
- Excel import, activation, profile/classification, OSM assignment and Care End remain without Phase C Toast integration.
