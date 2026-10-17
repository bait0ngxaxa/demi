# Phase B (remaining) — Toast Integration and Final Regression Audit

## 1. Scope and baseline

Baseline: `2239c24` (`fix(workforce): preserve unhandled activation credentials`). Already accepted: Phase A, A.1, B.1 (Hospital governance), B.2 (Hospital onboarding), B.3.1 (single Workforce provisioning).

This change completes Phase B in one cycle: B.3.2 bulk provisioning, B.3.3 activation issuance and assisted handoff, B.3.4 Workforce membership/relationship/owner/export-grant/release, B.4 Hospital Contact and Support report status, B.5 Hospital Knowledge and Content, and the B.6 cross-workflow audit.

Unchanged by design: authorization, domain transitions, transactions, audit semantics, idempotency, content versioning, the Prisma schema, the global Toaster (`AppToaster` in `app/layout.tsx`), `WorkforcePasswordResetControl` (still fail-closed, no Toast), `completeWorkforceActivationAction`, and every Phase A/B.1/B.2/B.3.1 implementation.

Shared building block (new, feature-local): `app/app/workforce/scoped-mutation.tsx`.

- `useScopedMutationSession` owns the *latest submission* of a group of mutations (id, kind, scope, status, state). Inline feedback, Toasts, locks and the single page refresh all derive from that record, never from retained `useActionState` state.
- `useScopedMutation` wraps one existing Server Action. Its guarded form action acquires a synchronous lock, awaits the action, classifies the result, and emits the Toast inside that awaited call.
- `classifyWorkforceState` maps the typed Workforce action states to a verdict (`SUCCESS`, `CONFLICT`, `FORBIDDEN`, `REJECTED`, `UNCONFIRMED`).
- It is used by the Workforce workspace (bulk, remote, assisted) and the five relationship controls. Hospital Contact, Support and Content keep their own specialized controllers and only gain Toast calls at their confirmed-result branches.

## 2. B.3.2 — Bulk provisioning result matrix

The Toast follows the authoritative per-row outcomes of the confirmed result. Bulk is not all-or-nothing.

| Confirmed result | Toast |
| --- | --- |
| Every processed row `created` or `existing`, none invalid | success `บันทึกรายการบุคลากรแล้ว` (OSM batch: `บันทึกรายการ อสม. แล้ว`) |
| Some rows saved, some `invalid` | warning `บันทึกได้บางรายการ กรุณาตรวจสอบผลรายแถว` |
| Every row `invalid` | warning `ไม่มีรายการที่บันทึกสำเร็จ กรุณาตรวจสอบข้อมูลรายแถว` |
| Confirmed validation (including duplicate National IDs) | none; inline message and row highlight stay |
| Confirmed `CONFLICT` | warning `ไม่สามารถบันทึกรายการได้ กรุณาตรวจสอบรายการล่าสุด` |
| Confirmed `FORBIDDEN` | error `ไม่มีสิทธิ์เพิ่มบุคลากรของโรงพยาบาลนี้` / `ไม่มีสิทธิ์เพิ่ม อสม. ของโรงพยาบาลนี้` |
| Returned `UNAVAILABLE`, `IDLE`, mismatched success, thrown request | none; the existing replay instruction is shown |

The wording never says accounts were newly created, so an all-`existing` result is described accurately. A success only counts when the result's Hospital and kind equal the submitted ones.

Row results remain visible and are now shown only for the Hospital and kind they belong to. A returned `UNAVAILABLE` previously showed a definitive-looking server message; it now shows the same replay instruction as a thrown request, because `UNAVAILABLE` can follow a commit.

## 3. B.3.3 — Activation issuance and assisted handoff

Remote regeneration:

| Result | Behaviour |
| --- | --- |
| Confirmed `SUCCESS` for the requested user, Hospital and kind | success `ออกลิงก์เปิดใช้งานใหม่แล้ว`; link and QR stay in the roster UI |
| `CONFLICT` | warning `ไม่สามารถออกลิงก์ใหม่ได้ กรุณาตรวจสอบสถานะล่าสุด` plus inline text |
| `FORBIDDEN` | error `ไม่มีสิทธิ์ออกลิงก์เปิดใช้งานใหม่` plus inline text |
| `INVALID_INPUT` | inline only |
| Returned `UNAVAILABLE`, `IDLE`, mismatched success, thrown | no Toast; reload-and-review guidance; roster locked; nothing is retried or regenerated |

Credential preservation (same rule as B.3.1): the confirmed result is kept per Hospital in component memory, not in retained action state, so a later error or unknown outcome no longer erases it. While the link has not been acknowledged as handed over, no further remote regeneration can start (button disabled and checked synchronously at dispatch). The existing copy states the old link cannot be shown again; no copy claims the previous link is still valid.

Assisted handoff decision: **no success Toast.** The flow issues a credential, signs the issuer out and navigates to the activation page; a Toast would be discarded with the page and would imply progress the target user has not made. The navigation is the feedback. A small inline status (`ออกลิงก์เปิดใช้งานแล้ว กำลังส่งต่ออุปกรณ์ให้ผู้ใช้งาน`) is shown, every roster action is locked once the handoff is confirmed, and the `window.location.replace` runs once per confirmed submission from the submission record rather than from retained state. The credential appears only in that navigation URL fragment.

- `CONFLICT` / `FORBIDDEN`: warning `ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้ กรุณาตรวจสอบสถานะล่าสุด` / error `ไม่มีสิทธิ์เริ่มการเปิดใช้งานแบบช่วยเหลือ`.
- Failure after issuance (`UNAVAILABLE`, thrown) keeps the existing specific message and note, emits no Toast, does not navigate, and does not issue another credential.
- Starting an assisted handoff is refused while any issued link in the Hospital (remote, Staff or OSM) has not been acknowledged, because the handoff reloads the page and discards in-memory credentials.

## 4. B.3.4 — Membership, relationship, owner, export grant and release

Each control owns one session scoped to the relationship. Success requires the result to be for the same relationship and Hospital and to carry the requested state.

| Operation | Success Toast | Confirmed `CONFLICT` (warning) | Confirmed `FORBIDDEN` (error) |
| --- | --- | --- | --- |
| Update profession | `บันทึกวิชาชีพแล้ว` | `สถานะสมาชิกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด` | `ไม่มีสิทธิ์จัดการสมาชิกโรงพยาบาลนี้` |
| Suspend membership | `ระงับสมาชิกโรงพยาบาลแล้ว` | same | same |
| Restore membership | `คืนสถานะสมาชิกโรงพยาบาลแล้ว` | same | same |
| Suspend OSM relationship | `ระงับความสัมพันธ์ อสม. แล้ว` | `ไม่สามารถเปลี่ยนความสัมพันธ์ อสม. ได้ กรุณาตรวจสอบสถานะล่าสุด` | `ไม่มีสิทธิ์จัดการความสัมพันธ์ อสม. นี้` |
| Restore OSM relationship | `คืนสถานะความสัมพันธ์ อสม. แล้ว` | same | same |
| Promote owner | `กำหนดสิทธิ์เจ้าของโรงพยาบาลแล้ว` | `สิทธิ์เจ้าของเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด` | `ไม่มีสิทธิ์จัดการสิทธิ์เจ้าของโรงพยาบาล` |
| Demote owner | `เปลี่ยนสิทธิ์เจ้าของโรงพยาบาลแล้ว` | same (includes the last-eligible-owner guard) | same |
| Grant export | `ให้สิทธิ์ส่งออกรายงานแล้ว` | `สถานะสิทธิ์ส่งออกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด` | `ไม่มีสิทธิ์จัดการสิทธิ์ส่งออกรายงาน` |
| Revoke export | `ยกเลิกสิทธิ์ส่งออกรายงานแล้ว` | same | same |
| Permanent release | `นำความสัมพันธ์ออกจากระบบแล้ว` | `ไม่สามารถนำออกจากระบบได้ กรุณาโหลดข้อมูลล่าสุด` | `ไม่มีสิทธิ์นำความสัมพันธ์ออกจากระบบ` |

`INVALID_INPUT` stays inline-only. Suspend and demote keep their destructive `ConfirmableActionForm`; cancelling it performs no mutation and shows no Toast. The `expectedUpdatedAt` payload is unchanged. The export-grant success must return the `granted` value that was requested; the status badge stays authoritative.

Old behaviour that is fixed: the per-control `useEffect` observed every retained `SUCCESS` and could refresh after a later `CONFLICT`, and `Feedback` picked the first error or success across independent hooks. Now only the latest submission can refresh (once, deduplicated by submission id) or display, and an earlier error cannot appear after a later success. After a confirmed success the control stays locked until the refreshed page props reflect the result (`updatedAt` for membership/OSM/owner, the grant badge for export).

Release transport change (the only transport change): `releaseWorkforceAction` now also returns `outcome` (`RELEASED`, `INVALID_CONFIRMATION`, `CONFLICT`, `FORBIDDEN`, `UNAVAILABLE`); `success` and `message` are unchanged. `ConflictError` → `CONFLICT`, `ValidationError` → `INVALID_CONFIRMATION`, `ForbiddenError`/`UnauthenticatedError` → `FORBIDDEN`, everything else (including `NotFoundError` and infrastructure errors, which may follow a commit) → `UNAVAILABLE`. The UI never reads a bare `{ success: false }` as a conflict or refusal. The typed confirmation phrase is unchanged, the form locks permanently after a confirmed release, and no client refresh or retry is added (the action's own `revalidatePath` supplies the post-release state).

## 5. B.4 — Hospital Contact and Support

Hospital Contact keeps its draft, `expectedUpdatedAt`, reconciliation and access-revocation handling; only Toast calls and a synchronous duplicate guard were added.

| Result | Toast |
| --- | --- |
| `CREATED` | success `บันทึกข้อมูลติดต่อโรงพยาบาลแล้ว` |
| `UPDATED` | success `ปรับปรุงข้อมูลติดต่อโรงพยาบาลแล้ว` |
| `NOOP` | none; the inline explanation stays |
| `CONFLICT` | warning `ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาตรวจสอบข้อมูลล่าสุด` (draft kept, reconciliation required) |
| `FORBIDDEN` | error `ไม่มีสิทธิ์แก้ไขข้อมูลติดต่อโรงพยาบาล` |
| `VALIDATION`, `UNAVAILABLE`, `UNCONFIRMED`, thrown | none |

A success counts only when the returned Hospital equals the displayed one. The read-only "load current contact" lookup emits nothing.

Support report status:

| Result | Behaviour |
| --- | --- |
| Confirmed `SUCCESS` for this report | success `รับทราบรายงานแล้ว` (NEW → ACKNOWLEDGED) or `บันทึกสถานะว่าแก้ไขแล้ว` (ACKNOWLEDGED → RESOLVED), then one `router.refresh()` |
| `CONFLICT` | warning `สถานะรายงานเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด` plus inline text |
| `FORBIDDEN` | error `ไม่มีสิทธิ์จัดการรายงานนี้` plus inline text |
| `VALIDATION` | inline only |
| `UNAVAILABLE`, unexpected `IDLE`, success for another report, thrown | no Toast; reload-and-review alert; button locked |

`window.location.reload()` was replaced by `router.refresh()` so the Toast survives (the Toaster lives in the root layout). No terminal status is fabricated; the button stays locked until the refreshed `status`/`updatedAt` props arrive, and `expectedUpdatedAt` is still sent.

## 6. B.5 — Hospital Knowledge and Content

| Operation | Toast |
| --- | --- |
| Create, `CREATED` | success `สร้างฉบับร่างแล้ว`, emitted before the existing navigation to the detail page |
| Create, `REPLAY` | none; the existing "already created" Alert and link remain, and the stored marker is released as before |
| Create, `UNCONFIRMED` / thrown | none; marker and nonce preserved; nothing is retried |
| Edit, `UPDATED` | success `บันทึกฉบับร่างแล้ว` |
| Edit, `NOOP` | none; inline explanation stays |
| Edit/lifecycle `CONFLICT` | warning `เนื้อหาเปลี่ยนแปลงแล้ว กรุณาตรวจสอบฉบับล่าสุด` (reconciliation flow unchanged) |
| Edit/lifecycle `FORBIDDEN` | error `ไม่มีสิทธิ์จัดการเนื้อหาของโรงพยาบาลนี้`; `NOT_FOUND` is not treated as a confirmed denial |
| Publish / Withdraw / Archive | success `เผยแพร่เนื้อหาแล้ว` / `ถอนการเผยแพร่เนื้อหาแล้ว` / `เก็บเนื้อหาเข้าคลังแล้ว`, only after the existing confirmation and only when the outcome matches the command |
| Validation, `UNAVAILABLE`, `UNCONFIRMED`, thrown | none |

Create error codes other than validation were not given Toasts (the specification lists none); their inline messages are unchanged.

Images (private upload API, one request per file):

| Result | Behaviour |
| --- | --- |
| Every selected image confirmed | success `เพิ่มภาพประกอบแล้ว` |
| Some confirmed, then a failure | warning `อัปโหลดได้บางรูป กรุณาตรวจสอบรายการภาพ`; confirmed images stay listed and `เพิ่มรูปแล้ว N รูป` is shown |
| Client-side validation or optimization failure | inline only |
| First file refused (4xx) | inline only |
| Lost response, network failure, 5xx, or `ok` without an image id | treated as unconfirmed: `ระบบยังยืนยันผลการอัปโหลดรูปไม่ได้ ... กรุณาตรวจสอบรายการภาพก่อนอัปโหลดซ้ำ`; never reported as a definite failure and never retried |

Previously a network failure was labelled as an image-preparation failure; that mislabel is fixed. Toasts never include image ids, file names or URLs.

## 7. Unknown-outcome strategy by workflow

| Workflow | Treatment of `UNAVAILABLE` / `IDLE` / thrown / mismatched success |
| --- | --- |
| Bulk | no Toast; existing instruction to press save again with unchanged data (same `submissionId`); submit stays available because replay is the sanctioned recovery |
| Remote activation | no Toast; reload-and-review alert; roster locked; no regeneration |
| Assisted activation | no Toast; existing specific message and note; no navigation; roster locked |
| Membership/OSM/owner/grant/release | no Toast; `UnknownOutcomeAlert` (reload); that control is locked until reload; release can never be resubmitted |
| Hospital Contact | no Toast; draft kept; reconciliation required for `UNCONFIRMED`/thrown; no resubmission |
| Support | no Toast; reload alert; button locked |
| Content create/edit/lifecycle | no Toast; existing reconciliation flows; no retry |
| Images | no Toast unless some images were confirmed (then the partial warning); never retried |

`revalidatePath` runs inside the `try` of the Workforce Server Actions, so an `UNAVAILABLE` can follow a committed write; that is why those results are treated as unknown rather than failed.

## 8. Idempotency and replay guarantees

- Bulk: the `submissionId` is never regenerated automatically. It changes only through "start a new submission" or a kind/Hospital change, as before. Tests verify the same id on replay after a confirmed result and after a thrown request, and a different id after the explicit action.
- Content create: the submission nonce and recovery marker handling is untouched; `REPLAY` is never described as a new draft.
- No Server Action is ever re-dispatched by the UI on its own; the only resend paths are the pre-existing user-initiated ones.
- Idempotency guarantees are not widened. Bulk replay relies on the service's documented per-submission idempotency; other mutations rely on `expectedUpdatedAt`.

## 9. Sensitive credential and privacy boundaries

All Toast text is static Thai. Toasts receive no result object, form data, identifier, version, National ID, name, contact detail, content text, file name, URL or error text. Tests assert that serialized Toast calls contain none of the test credentials, ids, names, phone numbers, addresses, titles or file names.

Activation credentials exist only in the existing activation presentation, the in-memory per-Hospital record and latest-submission record, and (assisted) the navigation URL fragment. Nothing new is written to `localStorage`, `sessionStorage` or logs. The only storage use in the touched code is the pre-existing bulk key and content recovery marker.

## 10. Submission deduplication and context protection

- Each Toast is emitted inside the awaited call of the submission that produced it, after checking: component mounted, this is the latest submission, and the displayed scope (Hospital, relationship, report, content) still equals the submitted one. Rerenders, Strict Mode, `router.refresh()` and later retained states cannot replay it.
- A synchronous lock (`acquire`) drops a rapid duplicate or a cross-action submit before it reaches the Server Action; Hospital Contact and Content use equivalent in-flight refs next to their existing `isPending`/generation guards.
- Only the latest submission drives inline feedback and the single refresh; an old `SUCCESS` cannot refresh after a newer `CONFLICT`/`UNAVAILABLE`.
- Responses for a previous Hospital/relationship/report show nothing in the new context (remote credentials are kept per Hospital and only shown for the matching one).
- The Hospital selector is disabled while a bulk, remote or assisted request is pending.

## 11. Regression test evidence

New tests (196):

| File | Tests |
| --- | --- |
| `app/app/workforce/workforce-bulk-toast.test.tsx` | 19 |
| `app/app/workforce/workforce-activation-toast.test.tsx` | 24 |
| `app/app/workforce/[kind]/[relationshipId]/staff-owner-controls-toast.test.tsx` | 38 |
| `app/app/workforce/[kind]/[relationshipId]/osm-grant-release-toast.test.tsx` | 37 |
| `src/modules/workforce/transport/workforce-release-action.test.ts` | 9 |
| `app/app/hospitals/contact/hospital-contact-workspace-toast.test.tsx` | 14 |
| `app/app/hospitals/support/[reportId]/support-report-status-control.test.tsx` | 17 |
| `app/app/hospitals/knowledge/hospital-content-toast.test.tsx` | 38 |

They cover, per workflow, confirmed success, confirmed refusals, validation, returned `UNAVAILABLE`, thrown requests, rapid duplicates, stale and cross-Hospital/relationship results, unmount, rerender and Strict Mode deduplication, cross-action sequences (Suspend `SUCCESS` → Restore `UNAVAILABLE`, Profession `SUCCESS` → Suspend `CONFLICT`, Promote `SUCCESS` → Demote `FORBIDDEN`, Grant `SUCCESS` → Revoke `UNAVAILABLE`), confirmation cancel, and privacy. A mutation check (disabling the synchronous lock) made 10 of them fail, confirming they exercise the guard.

Commands executed on the final tree:

```text
npx vitest run app/app/workforce app/app/hospitals src/modules/workforce src/modules/hospital-contact src/modules/hospital-content src/modules/support src/components/ui app/app/admin/hospitals
  Passed: 59 files, 697 tests

npm run typecheck
  Passed

npm run lint
  0 errors; 2 pre-existing <img> optimization warnings (hospital-content-image-list.tsx, hospital-content-image-manager.tsx)

git diff --check
  No whitespace errors (only LF/CRLF notices from the repository's autocrlf setting)
```

Pre-existing tests for the touched areas (workforce workspace/recovery/provisioning Toasts, Hospital Contact interactions, Content lifecycle) pass unmodified. The repository defines no `lint:strict` or `architecture:check` script, so `npm run lint` was used. The Impeccable detector hook reported no findings on the changed files.

## 12. Limitations and outstanding risks

- No browser verification was run. The development environment's `.env` points at a configured database and signing in would exercise real data, so a smoke test was not started. Toast continuity across navigation and `router.refresh()` rests on the Toaster being mounted in the root layout and on unit tests; responsive Toaster positioning is unchanged and was not visually re-checked.
- Permanent release: if the framework applied the post-release page update before the awaited Server Action continuation ran, the control would already be unmounted and the Toast suppressed by the unmount guard. The inline result and the ended-relationship status still appear. This ordering could not be proven without a browser.
- Remote activation credentials are in memory only; a reload or navigation discards an unacknowledged link (same boundary as B.3.1). A new regeneration is required in that case.
- Image uploads send a fresh per-file nonce on every attempt, so repeating an upload after an uncertain result can store a duplicate; the new message tells the user to check the image list first.
- Hospital Contact still shows its pre-existing inline copy for a returned `UNAVAILABLE` ("บันทึกข้อมูลติดต่อไม่สำเร็จ"); no Toast is emitted for it, as specified.
- Content create `CONFLICT`/`FORBIDDEN` have no Toast because the specification does not define one.
- Assisted handoff is blocked while any issued link is unacknowledged. This is stricter than before and may require an extra acknowledgment click.

## 13. Deferred items outside Phase B

Patient management (Phase C), clinical/care workflows (Phase D), LINE/LIFF, public activation completion and password-reset completion, the disabled Workforce password reset, Hospital hierarchy, the Prisma schema and authentication configuration were not touched.

## 14. Final completion checklist

- [x] Bulk results distinguish full, partial and zero success; `submissionId` and replay semantics intact; no automatic replay.
- [x] Remote activation feedback is authoritative; credentials never enter a Toast; undelivered credentials are not overwritten.
- [x] Assisted handoff preserves issuer sign-out and navigation; the success Toast is deliberately omitted.
- [x] Staff profession, suspend/restore, OSM suspend/restore, owner promote/demote, export grants and permanent release give correct feedback with their confirmations intact.
- [x] Hospital Contact and Support feedback is correct; drafts, reconciliation, and version checks are intact; Support no longer reloads the page.
- [x] Content create/replay/edit/no-op/lifecycle/image feedback is correct; reconciliation and recovery markers intact.
- [x] No duplicate or stale Toasts; no cross-Hospital or cross-resource leakage; no success from retained state.
- [x] No unconfirmed mutation is reported as failed or successful; no automatic retries.
- [x] Disabled password reset remains disabled.
- [x] Typecheck passes; lint has no errors; affected tests pass.
- [ ] Browser smoke test (not performed; see section 12).
