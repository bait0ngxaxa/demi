# Phase C.3–C.6 — Consolidated Patient Operations Toast Integration

Status: **ACCEPTED for final review** (no blocking finding open). Limitations in section 11 are non-blocking.

Baseline: `a7aaebdd570d26486fc0adf41b742531bb8b009e` (C.1 and C.2 accepted).

| Slice | Commit |
| --- | --- |
| C.3 Patient Activation | `3ce2075` feat(patients): integrate activation toast feedback |
| C.4 Profile / Health history / Name / Classification | `226065d` feat(patients): integrate profile and classification toast feedback |
| C.5 OSM assignment / Care End | `bb9eb03` feat(patients): integrate assignment and care-end toast feedback |
| C.6 Audit, regression tests, this document | `test(patients): complete phase C recovery and regression audit` (the commit containing this file) |

## 1. Common pattern (unchanged from C.1/C.2)

- The Server Action is awaited **inside a submission-scoped wrapper** passed to the shared `useMutationActionState`. The wrapper classifies the result, then emits at most one static Thai Toast. Toasts are never derived from retained `useActionState` state or from an effect.
- `ERROR + UNAVAILABLE`, a returned `IDLE`, and a result that does not match what was submitted (other Patient/Hospital, other operation, other classification, wrong count) are **unconfirmed**. The wrapper throws; the hook records the unknown outcome, keeps the previous state, and the existing recovery UI is used. A thrown request already took that path.
- A synchronous `useRef` single-flight lock sits in front of `dispatch` and is released in the wrapper's `finally`, so rapid double submits never reach the Server Action even before React renders `pending`.
- Feedback is dropped when the component unmounted or now shows another Patient/Hospital (`mounted` + `active…Id` refs).
- `router.refresh()` moved from state-observing effects into the wrapper (activation has none): once per confirmed submission, independent of router identity.
- No new notification manager. `notify`, `useMutationActionState`, `UnknownOutcomeAlert`, `ConfirmableActionForm` are unchanged.

## 2. C.3 Patient Activation outcome matrix

| Authoritative outcome | Toast | Inline / behavior |
| --- | --- | --- |
| Lookup `SUCCESS`, empty, `TOO_MANY_RESULTS`, `INVALID_INPUT` | none | existing results/alerts (read-only) |
| Lookup `FORBIDDEN` | error "ไม่มีสิทธิ์ค้นหาผู้ป่วยเพื่อเปิดใช้งานบัญชี" | existing alert; same code for any Hospital, no existence leak |
| Lookup `UNAVAILABLE`/thrown | none | existing retryable connection failure (read-only, safe to repeat) |
| Issue `ISSUED` + token, user/Hospital match | success "ออกลิงก์เปิดใช้งานแล้ว" | token only in the existing handoff (QR + link) |
| `ISSUED` without a token, or `userId`/`hospitalId` ≠ submitted | none | unconfirmed → reload recovery |
| `ALREADY_ISSUED` | none | existing "มีลิงก์ที่ยังใช้ได้" + explicit replace button |
| `ALREADY_ACTIVE` | none | existing active-account text; no password reset implied |
| `RECONCILIATION_REQUIRED` (outcome or error) | none | existing reconciliation instructions |
| `INVALID_INPUT` | none | inline |
| `CONFLICT` | warning "ไม่สามารถออกลิงก์ได้ กรุณาตรวจสอบสถานะผู้ป่วย" | inline message, form kept |
| `FORBIDDEN` | error "ไม่มีสิทธิ์ออกลิงก์เปิดใช้งานในโรงพยาบาลนี้" | inline message |
| `UNAVAILABLE`, `IDLE`, thrown | none | existing alert: "ระบบอาจออกลิงก์แล้ว แต่ลิงก์เดิมแสดงซ้ำไม่ได้…" with reload; **no issue form is rendered**, so nothing can reissue automatically |
| Access-request-linked issuance | same table | request id only is sent; `ALREADY_ACTIVE` resolution unchanged |

Before this phase a returned `UNAVAILABLE` showed "ลองใหม่อีกครั้ง" and kept the issue form, inviting a reissue that invalidates a possibly issued link. It now follows the unknown path.

Patient-side completion (`/activate/patient`):
- **Intentionally Toast-free.** Success is `redirect("/login?activated=1")`; the login screen is the confirmation. The Server Action contract, one-time token consumption and redirect are untouched; the action is not converted to a SUCCESS return.
- The only change: a returned `UNAVAILABLE`/`IDLE` is now reported through the same unconfirmed path as a lost request ("ระบบยังยืนยันไม่ได้ว่าการเปิดใช้งานสำเร็จหรือไม่ … เข้าสู่ระบบด้วยรหัสผ่านใหม่ หากเข้าไม่ได้ติดต่อโรงพยาบาล") and the submit stays disabled; it no longer claims failure and invites retry. `INVALID_INPUT` (field errors) and `CONFLICT` (invalid/expired link) stay inline. No password or token reaches a Toast.

Credential rules: the token lives only in the `PatientActivationHandoff` instance that received it. A Toast never hides or clears it; no global/local storage; the URL is only in the existing handoff UI. While a token is on screen the page now asks before unload (`beforeunload`), because it cannot be displayed again. Replacing a link still needs an explicit click; the unconfirmed state offers no reissue.

## 3. C.4 Profile / classification outcome matrix

Contract refinement (backward compatible): `HospitalPatientEditState` gained optional `code?: "INVALID_INPUT" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE"`, set by `save`, `correctPatientNameAction`. Messages are unchanged; nothing classifies by message text. Mapping: `ConflictError`→CONFLICT, `ValidationError`→INVALID_INPUT, `ForbiddenError`/`NotFoundError`/`PatientNameCorrectionRequiresAdminError`→FORBIDDEN, anything else (including a failure after the write, e.g. revalidation)→UNAVAILABLE. An ERROR without `code` (older contract) stays inline only.

| Result | Toast | Inline / behavior |
| --- | --- | --- |
| Profile `SUCCESS` | success "บันทึกข้อมูลผู้ป่วยแล้ว" | existing message |
| Health history `SUCCESS` | success "บันทึกประวัติสุขภาพแล้ว" | existing message |
| Name correction `SUCCESS` | success "แก้ไขชื่อ-สกุลแล้ว" | existing alert |
| `INVALID_INPUT` | none | inline, draft kept |
| `CONFLICT` | warning (profile: "บันทึกไม่สำเร็จ ข้อมูลมีการเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุด"; name: "ไม่สามารถแก้ไขชื่อ-สกุลได้ กรุณาตรวจสอบข้อมูลล่าสุด") | inline reload instruction |
| `FORBIDDEN` (incl. multi-Hospital name restriction) | error ("ไม่มีสิทธิ์บันทึกข้อมูลนี้" / "ไม่มีสิทธิ์แก้ไขชื่อ-สกุลผู้ป่วยรายนี้") | inline message with the administrator guidance |
| `UNAVAILABLE`, `IDLE`, thrown | none | form locked, existing reload recovery |

Drafts: fields are uncontrolled and disabled while pending; `submitPreservingInput` keeps values; a draft edited before the request is not reset by a result.

Classification (`result.operation` is `CREATED | CHANGED | NOOP`):

| Result | Toast | Behavior |
| --- | --- | --- |
| `CREATED` | success "บันทึกสถานะผู้ป่วยแล้ว" | refresh once |
| `CHANGED` | success "เปลี่ยนสถานะผู้ป่วยแล้ว" | confirmation dialog still required first; refresh once |
| `NOOP` | none | existing "เป็นค่าเดียวกับข้อมูลปัจจุบัน"; refresh once |
| `INVALID_INPUT` | none | inline |
| `CONFLICT` | warning | inline + one read-only refresh so the stale current status is replaced |
| `FORBIDDEN` | error | inline |
| `UNAVAILABLE`, `IDLE`, unknown `operation`, `classification` ≠ submitted, thrown | none | no refresh; select and submit disabled; one reload-recovery message |

Recovery gap closed: `ConfirmableActionForm` only reports an unconfirmed result for a submission it confirmed; the create path (no confirmation) showed nothing and stayed editable after a thrown request. The view now shows `UnknownOutcomeAlert` for that path (never both alerts) and disables the select and button. The classification domain rule (shared across Hospitals) is untouched.

## 4. C.5 Assignment / Care End outcome matrix

Single OSM assignment (operation comes from the service result, not the button):

| Result | Toast |
| --- | --- |
| `ASSIGNED` | success "มอบหมาย อสม. แล้ว" |
| `REASSIGNED` | success "เปลี่ยน อสม. ผู้รับผิดชอบแล้ว" |
| `UNASSIGNED` | success "ยกเลิกการมอบหมาย อสม. แล้ว" |
| `NOOP` | none (existing inline) |
| `INVALID_INPUT` | none (inline) |
| `CONFLICT` | warning "ข้อมูลการมอบหมายเปลี่ยนแปลง กรุณาตรวจสอบข้อมูลล่าสุด" + one read-only refresh |
| `FORBIDDEN` | error "ไม่มีสิทธิ์จัดการการมอบหมายผู้ป่วย" |
| `UNAVAILABLE`, `IDLE`, thrown, wrong relationship, operation not valid for that action, different OSM than requested | none; reload recovery; controls locked |

Assign and unassign share **one** single-flight lock, so they cannot race each other.

Bulk assignment (OWNER, ≤500, eligible unassigned only, `submissionNonce`):

| Result | Toast | Behavior |
| --- | --- | --- |
| `ASSIGNED`, Hospital/OSM/count match | success "มอบหมาย อสม. ให้ผู้ป่วยแล้ว" | refresh once |
| `REPLAYED` | none | inline "คำขอนี้ถูกบันทึกไปแล้ว ระบบไม่มอบหมายซ้ำ" |
| `CONFLICT` | warning | inline; atomic server rollback unchanged |
| `FORBIDDEN` | error | inline |
| `INVALID_INPUT` | none | inline |
| `UNAVAILABLE`, `IDLE`, thrown, mismatched Hospital/OSM/`assignedCount` | none | existing "ตรวจสอบผลด้วยคำขอเดิม" |

Nonce rule: the hook keeps the exact `FormData` (including `submissionNonce`) of the unconfirmed request and the resend dispatches that same object. Returned `UNAVAILABLE`/`IDLE` now also reach this resend path (before, only a thrown request did). The server deduplicates by nonce and selection fingerprint, and a changed set cannot be sent because checkboxes, OSM picker and "กลับไปแก้ไข" are disabled while unconfirmed.
Audit fix: the Hospital selector and its button are disabled while a request is in flight or unconfirmed (a switch remounts the keyed workspace and would drop the nonce-bound payload), and "กลับไปแก้ไข" is disabled while unconfirmed (it hid the recovery and led to a new nonce).

Care End (irreversible):
- `PatientHospitalRelationshipEndActionState` gained optional `code` (`INVALID_INPUT | CONFLICT | FORBIDDEN | UNAVAILABLE`); messages unchanged. Unexpected failures (possibly after commit) are `UNAVAILABLE`.
- Success: the action still redirects to the Patient list. The redirect reaches the client as a Next.js redirect rejection that `useMutationActionState` rethrows via `unstable_rethrow`; the wrapper has only `try/finally` and never catches it. **No success Toast**: the client unmounts as it navigates and a destination-side flash would need a new server-issued, unforgeable channel. The Patient leaving the list is the confirmation.
- `INVALID_INPUT` inline; `CONFLICT` warning; `FORBIDDEN` error; none contain the reason or Patient data.
- `UNAVAILABLE`, `IDLE`, thrown → unknown: no Toast, no failure claim, form locked, the existing read-only `verifyPatientHospitalRelationshipEndAction` is offered. `ENDED` (confirmed, link to the list, no resend), `ACTIVE` (form re-enabled for an explicit new request), `UNRESOLVED` or a failed verification (no claim, verify again). A failed verification is never treated as proof either way. The end request is never retried automatically.

## 5. Actions intentionally Toast-free

| Action | Why |
| --- | --- |
| Patient-side activation completion | success is a redirect to login; unknown completion uses the inline note |
| Care End success | irreversible transition that redirects; no trustworthy client-side moment for a Toast |
| Activation `ALREADY_ISSUED`, `ALREADY_ACTIVE`, `RECONCILIATION_REQUIRED` | not new writes; need persistent inline explanation |
| Classification/assignment `NOOP`, bulk `REPLAYED` | no new write |
| Lookup results (activation, OSM candidates) | read-only |

## 6. Confirmation and duplicate-submit controls

| Workflow | Control |
| --- | --- |
| Activation issue/reissue | ref lock before dispatch; unconfirmed state removes the issue form; reissue needs an explicit click |
| Profile / health / name | ref lock; fields and button disabled while pending/unconfirmed |
| Classification | `ConfirmableActionForm` (unchanged) for changes + ref lock for all paths |
| Assign / unassign | one shared ref lock |
| Bulk | ref lock on submit and resend; confirmation panel; nonce per confirmation |
| Care End | reason + retention acknowledgment required; ref lock; locked while unknown |

## 7. Recovery matrix

| Workflow | UNAVAILABLE / IDLE / thrown | Recovery mechanism |
| --- | --- | --- |
| C.1 Single provisioning | unconfirmed | original request replay (natural-key dedup) — unchanged |
| C.2 Excel import | unconfirmed | fresh authoritative preview — unchanged |
| C.3 Activation issue | unconfirmed | reload; operator-controlled replacement (old plaintext cannot be shown again) |
| C.3 Activation completion | unconfirmed | sign in with the new password or ask the Hospital for a new link |
| C.4 Profile/health/name | unconfirmed | reload to read the persisted state (version check protects the next save) |
| C.4 Classification | unconfirmed | reload; `CONFLICT` refreshes automatically |
| C.5 Single assignment | unconfirmed | reload; `CONFLICT` refreshes automatically |
| C.5 Bulk | unconfirmed | nonce-bound resend of the identical payload |
| C.5 Care End | unconfirmed | read-only lifecycle verification; no resend |

Different mechanisms were kept on purpose; no generic abstraction was introduced.

## 8. Navigation and unmount analysis

- Unmount after dispatch (all wrappers): the awaited action still completes on the server; the response is classified, but no Toast, refresh or state-dependent feedback is produced. Tested per workflow.
- Rerender/remount/`router.refresh()`: Toasts and refreshes live in the awaited wrapper, so none replays. Tested (classification, assignment, bulk, profile, activation).
- Patient/relationship change in the same instance: guarded by `active…Id` refs (profile/health/name, classification, assignment, Care End is per relationship page).
- Hospital change: bulk workspace is keyed by Hospital+search; its Hospital selector is now locked while a request is unresolved. Activation page keys by Hospital; a Hospital switch discards an on-screen link (see limitations).
- Browser Back/Forward and links out of an unresolved page: still unmount the component and drop in-memory recovery state without a warning (same accepted limitation as C.1/C.2/bulk). Reassessed: persistent submission storage would be needed; no browser storage was introduced (it would hold Patient data or credentials). Safe recovery is documented in the matrix above and every unconfirmed server effect remains verifiable from persisted state.
- `beforeunload` guards: existing for `resend`/`verify` alerts; added for an on-screen activation link.

## 9. Cross-Hospital / cross-Patient isolation

Server authorization is unchanged and authoritative. The client adds defense in depth: results are compared with the submitted user/Hospital/relationship/OSM/classification/count and ignored (unconfirmed) when they differ; feedback is gated on the current mount and context. Toast copy never reaches identifiers or names, so a Toast cannot reveal data across boundaries. Lookup `FORBIDDEN` is context-independent.

## 10. Privacy audit

Every `notify.*` call in `app/app/patients` was reviewed. All arguments are static Thai literals or entries of reviewed static copy tables. `app/app/patients/patient-toast-privacy.test.ts` enforces this: arguments must be a literal or an allowed table reference, literals must be Thai/space/`.`/`-` only (no digits, identifiers, interpolation, Latin mojibake) and ≤ 80 characters. Per-workflow tests also assert tokens, names, clinical text, the Care End reason and OSM/Patient names never appear in Toast arguments. Audit-event and persistence semantics were not changed; no schema change.

## 11. Verification

Commands run on the final tree (all from the repository root):

```text
npx vitest run app/app/patients app/activate src/modules/patient-activation src/modules/patient-classification src/modules/patient-assignment src/modules/patient-hospital-profile src/modules/patient-hospital-relationship src/modules/patient-provisioning src/components/ui
npm run typecheck
npm run lint
git diff --check
```

Results are recorded in the final report of the delivery. The full suite was not run: shared infrastructure (`notify`, `useMutationActionState`, `UnknownOutcomeAlert`, `ConfirmableActionForm`) is unchanged and the contract changes are two optional fields.

New tests: `patient-activation-interactions.test.tsx` (issuance/lookup feedback), `patient-activation-handoff-linked.test.tsx`, `activation-interactions.test.tsx` (completion), `patient-edit-feedback.test.tsx`, `patient-classification-view.test.tsx`, `patient-osm-assignment-workspace.test.tsx`, `patient-osm-bulk-assignment-feedback.test.tsx`, `patient-care-end-feedback.test.tsx`, `patient-toast-privacy.test.ts`, `hospital-patient-edit-actions.test.ts`, `server-actions.test.ts` (relationship end). The bulk single-flight guard was checked by mutation: removing it fails its test. The existing C.1/C.2 workspace tests and Care End recovery tests pass unmodified.

## 12. Remaining non-blocking limitations

- No browser/E2E run; behavior rests on jsdom component tests and Server Action contract tests. The redirect rethrow is tested with a real Next.js redirect error, not through a live Server Action.
- Browser Back/Forward or in-app links away from an unresolved page drop in-memory recovery state without warning (C.1/C.2/bulk unchanged). A Hospital switch on the activation page can discard an on-screen activation link; only reload/close is guarded. The link can be replaced explicitly, which invalidates the old one.
- After an unconfirmed reissue the previous on-screen link is hidden by the recovery message, because the replacement may already have invalidated it.
- Single assignment still shows an earlier assign error ahead of a later unassign success inline (pre-existing display precedence); Toasts are correct.
- A `REPLAYED` bulk answer after a lost first response gives no Toast by design; the inline text explains it.
- A name-correction `ConflictError` covers both a changed and an unchanged name; Toast copy is neutral.
- Care End success has no Toast (section 4).
