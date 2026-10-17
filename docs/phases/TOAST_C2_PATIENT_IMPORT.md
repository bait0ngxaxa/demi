# Phase C.2 — Excel Patient Import Toast Integration

Status: Phase C.2 complete. Phase C as a whole is **not** complete.

Reviewed baseline: `526938e2107d342df7bb17914162186db616abea`.

## 1. Scope

Transient feedback is integrated for the Excel mode ("นำเข้าจาก Excel") of `PatientProvisioningWorkspace` (`app/app/patients/provision/patient-provisioning-workspace.tsx`): file preview, confirmation, and the result dialog.

Changed files:

- `app/app/patients/provision/patient-provisioning-workspace.tsx`: preview and confirmation handlers, result classification, single-flight guard, unconfirmed recovery, switch locks, inline copy.
- `src/modules/patient-provisioning/presentation/patient-import-presentation.ts`: one result-heading correction (section 4).
- Tests: `app/app/patients/provision/patient-provisioning-workspace-interactions.test.tsx`, `src/modules/patient-provisioning/presentation/patient-import-presentation.test.ts`.

Unchanged: `previewPatientImportAction`, `confirmPatientImportAction` and their action states; the import service, row transactions, preview binding (`patient-import-file-binding.ts`), template contract v2 and Phase 16F rules; identity reuse, profile persistence, clinical baseline, classification, audit; failed-row export; `notify`, `UnknownOutcomeAlert`, `useMutationActionState`; Prisma schema and migrations. Phase C.1 single provisioning behavior is unchanged.

## 2. Preview feedback

Preview is read-only and is never reported as persistence.

| Preview result | Toast | Inline UI |
| --- | --- | --- |
| `SUCCESS` | None | Review dialog opens (unchanged) |
| `ERROR` + `INVALID_INPUT` | None | Existing message, template mismatch instructions and template download; file and date kept |
| `ERROR` + `FORBIDDEN` | `notify.error("ไม่มีสิทธิ์ตรวจสอบไฟล์ผู้ป่วยของโรงพยาบาลนี้")` | Existing message |
| `ERROR` + `UNAVAILABLE`, or a thrown request | None | Existing retryable message; file and date kept |
| Settles after the file, date or Hospital changed, or after unmount | None | Discarded; no dialog |

A file or effective-date change invalidates the current preview (existing `importContextVersion`). The preview handler now also checks that the component is still mounted.

## 3. Confirmed import classification

The Toast is decided inside the confirmation handler from the settled response. It is never derived from retained state, so rerenders, closing and reopening the result dialog, and mode changes do not replay it.

A `SUCCESS` is accepted only if its summary is consistent with the submission:

- `targetHospitalId` equals the submitted Hospital;
- the row count equals the preview row count (same bound file);
- every row has a known result, and each count (`imported`, `alreadyExists`, `duplicateInFile`, `invalid`, `conflict`, `failed`) equals the number of rows with that result;
- `baselineCreated` and `classificationCreated` do not exceed `imported`.

Otherwise the response is treated as unconfirmed (section 5).

"Attention" is `hasAttentionRows` from `getPatientImportResultPresentation`, which uses `isPatientImportAttentionResult`: any `DUPLICATE_IN_FILE`, `INVALID`, `CONFLICT` or `FAILED` row.

| Final rows | Toast | Inline heading |
| --- | --- | --- |
| `imported > 0`, no attention rows | `notify.success("นำเข้าข้อมูลผู้ป่วยแล้ว")` | "นำเข้าผู้ป่วยใหม่แล้ว" |
| `imported > 0`, attention rows | `notify.warning("นำเข้าได้บางรายการ กรุณาตรวจสอบผลรายแถว")` | "นำเข้าผู้ป่วยใหม่แล้ว และยังมีบางรายการที่ต้องแก้ไข" |
| `imported = 0`, `alreadyExists > 0`, no attention rows | None | "ไม่มีผู้ป่วยใหม่ในไฟล์นี้" |
| `imported = 0`, attention rows (with or without existing rows) | `notify.warning("ยังไม่มีผู้ป่วยใหม่ที่นำเข้าได้ กรุณาตรวจสอบผลรายแถว")` | "ยังไม่มีรายการที่บันทึกได้" |
| Empty summary | None | Existing inline result |

Partial success is derived only from final row results, never from preview counts. `ALREADY_EXISTS` means the Patient already had a relationship with the Hospital and the import left it untouched. Nothing was created, so it never counts as a new import. `FAILED`, `INVALID`, `DUPLICATE_IN_FILE` and `CONFLICT` rows are not persisted and are not counted. `baselineCreated` and `classificationCreated` count records attached to imported Patients, not additional Patients.

Toast text is static Thai. It never contains names, national IDs, HN, row numbers, counts, Hospital IDs or server messages.

## 4. Confirmation errors

| Result | Toast | Inline UI |
| --- | --- | --- |
| `ERROR` + `INVALID_INPUT` | None | Existing "นำเข้าไม่สำเร็จ" with the server message; file, preview and table kept. Raised before any row is written. |
| `ERROR` + `FORBIDDEN` | `notify.error("ไม่มีสิทธิ์นำเข้าผู้ป่วยของโรงพยาบาลนี้")` | Heading "ไม่มีสิทธิ์นำเข้าผู้ป่วยของโรงพยาบาลนี้" with a note that some rows may have been saved if access changed during the import. Confirm is disabled until a fresh preview. |
| `ERROR` + `UNAVAILABLE`, thrown, `IDLE`, inconsistent or other-Hospital `SUCCESS` | None | Unconfirmed recovery (section 5) |
| Settles after unmount or remount | None | Discarded |

Why `FORBIDDEN` is not shown as "นำเข้าไม่สำเร็จ": `importPatientRoster` rethrows `ForbiddenError` from inside the row loop (`patient-roster-import-service.ts`). Rows committed earlier remain, for example when access is revoked or the session expires mid-import. The previous "นำเข้าไม่สำเร็จ" heading could therefore be false.

The result heading was also corrected: `getPatientImportResultPresentation` said "นำเข้าผู้ป่วยใหม่แล้ว และยังมีบางรายการที่ต้องแก้ไข" whenever existing and attention rows were mixed, even with `imported = 0`. It now uses "ยังไม่มีรายการที่บันทึกได้" with the detail "ผู้ป่วยที่มีอยู่แล้วไม่ถูกเปลี่ยนแปลง รายการที่ต้องแก้ไขยังไม่ถูกบันทึก". The other headings are unchanged.

## 5. Unknown outcome and partial persistence

Rows are committed one by one, and `confirmPatientImportAction` maps any later exception (including one from `revalidatePath` after the import) to `UNAVAILABLE`. An unconfirmed confirmation may therefore have saved some, all or none of the rows. Before this phase, only a thrown request reached the unknown-outcome alert. A returned `UNAVAILABLE` showed "นำเข้าไม่สำเร็จ / ระบบไม่พร้อม… ลองใหม่อีกครั้ง" and left confirm enabled. All unconfirmed cases are now handled identically:

- No Toast and no failure text.
- The review dialog shows the existing warning (`unknownOutcomeMessage`) plus: "บางรายการอาจถูกบันทึกไปแล้ว ปิดหน้าต่างนี้แล้วกด “ตรวจสอบและแสดงตัวอย่าง” กับไฟล์เดิมอีกครั้ง…". After the dialog is closed, the page shows the same warning in place of the "ยังไม่ได้นำเข้า" reminder, which would be false.
- Confirm is disabled. The handler also refuses through a ref. Nothing is re-sent automatically.
- File input, "ล้างไฟล์", effective date, the SINGLE/EXCEL switch and the Hospital selector are locked, with the same checks in their handlers. The selected file and date are kept.
- Recovery is a fresh preview of the same file, date and Hospital. The server re-binds the preview (fingerprint, actor, Hospital, date, contract version) and reclassifies rows that are now saved as `ALREADY_EXISTS`. Only a successful fresh preview clears the unconfirmed state. The dialog then shows: "ไฟล์นี้อาจถูกนำเข้าไปแล้วบางส่วนจากคำขอก่อนหน้า รายการที่บันทึกไปแล้วแสดงเป็น “มีอยู่แล้ว” กรุณาตรวจสอบผลรายแถวก่อนยืนยันนำเข้า". A failed fresh preview keeps the warning and the locks.
- A later confirmation sends the fresh preview binding. The old binding is never reused.

`resend` recovery is deliberately not used. The whole file is not one deduplicated request identity, and the user must see the current row classification before confirming.

## 6. Duplicate-submit prevention

`handleImport` acquires `importInFlightRef` synchronously before `startImportTransition`. The ref is released in `finally` when the Server Action settles, so a second click in the same event turn never reaches the Server Action. A pending, unconfirmed (ref), already successful or `FORBIDDEN` confirmation cannot be confirmed again. "นำเข้าไฟล์ใหม่" still resets everything for a legitimate new import, except while a request is in flight or unconfirmed. Preview and failed-row download are not blocked by the guard.

## 7. Hospital, file and preview context

- The confirmation captures the Hospital, file, preview binding, effective date and contract version at click time, plus the local `importContextVersion`.
- A response is applied only if the component is still mounted and the version is unchanged. A Toast additionally requires the displayed Hospital (`activeHospitalIdRef`) to equal the submitted Hospital.
- `page.tsx` keys the Workspace by `selectedHospitalId`, so a Hospital change remounts it. The tests render with that key. A late response hits the unmount guard: no Toast, no dialog, and no stale result when returning to the first Hospital.
- The Hospital selector and mode switch are locked while a confirmation is in flight or unconfirmed. File and date inputs are already disabled while a request is pending.
- No Patient data or file is written to browser storage.

## 8. Preserved behavior

`ImportSummary` remains the authoritative result: counts, attention-row table with source Excel row numbers and masked identity display, saved-fields note, recovery guidance, OSM note, failed-row download, the Hospital Patient list link, OSM assignment link (Hospital owners) and "นำเข้าไฟล์ใหม่". Dialog focus, focus return, Escape blocking while importing, loading labels and disabled states are unchanged. The page-level warning uses the default polite `status` role so it is not announced twice after the dialog's `alert`.

## 9. Verification

Tests added (deferred promises for races; Workspace keyed by Hospital as in `page.tsx`):

Preview: success opens dialog without Toast; `INVALID_INPUT` inline; `FORBIDDEN` error Toast; returned `UNAVAILABLE` and thrown request without Toast; effective-date change invalidates the checked preview; preview settling after Hospital remount discarded.

Confirmation: table-driven classification for all new, new plus attention, only existing, no new with attention, and existing mixed with attention (exact Toast or none, heading, imported count); `FAILED` rows and baseline/classification counts excluded from imported count, failed-row download receives only failed rows, Patient list link present; `FORBIDDEN` Toast with non-definitive inline copy and blocked re-confirm; `INVALID_INPUT` inline with file and table kept; four inconsistent summaries (counts, other Hospital, row count, baseline) treated as unconfirmed.

Unconfirmed: returned `UNAVAILABLE`, thrown, returned `IDLE` (no Toast, no failure text, confirm blocked, one call); full recovery: locks on file, date, clear, mode and Hospital; failed re-preview keeps the warning; successful re-preview of the same file shows the recheck note and unlocks; the new confirmation uses the fresh binding and gets its own Toast.

Concurrency: rapid double click sends one request; late response after Hospital remount discarded; after unmount suppressed; no replay after rerender or result reopen; explicit "นำเข้าไฟล์ใหม่" import gets its own Toast.

The double-click guard, the unconfirmed classification of `UNAVAILABLE`, the recovery locks and the summary consistency check were each verified to fail their tests when removed.

```text
npx vitest run app/app/patients/provision src/modules/patient-provisioning/presentation src/modules/patient-provisioning/transport/patient-provisioning-workspace.test.ts src/modules/patient-provisioning/transport/server-actions.test.ts src/components/ui/mutation-action-state.test.tsx app/app/hospitals/reporting
  Passed: 7 files, 104 tests (includes all Phase C.1 tests)

npx vitest run app/app/patients/provision src/modules/patient-provisioning
  Passed: 17 files, 274 tests

npm run typecheck
  Passed

npm run lint
  0 errors; 2 existing <img> warnings in Hospital content components

git diff --check
  No whitespace errors
```

The full test suite was not run. The change is confined to one client component, one presentation helper and their tests, with no server, schema or shared-contract changes.

## 10. Limitations

- No browser test was run. Behavior rests on jsdom component tests.
- Unconfirmed state lives only in the mounted component. In-page switches are locked, but a reload, tab close, browser Back/Forward between Hospital URLs or a link out of the page discards it without a warning; no `beforeunload` guard was added because no in-memory identifier is needed for recovery. Data stays safe: previewing the same file again later shows already-saved rows as `ALREADY_EXISTS`, and import never modifies existing Patients.
- A fresh preview shows the current state; it cannot prove which request saved a row.
- If access is lost permanently after a partial `FORBIDDEN`, the operator cannot preview again and must check the Patient list with someone who still has access.
- The `INVALID_INPUT` heading "นำเข้าไม่สำเร็จ" relies on the current service raising validation errors only before the row loop.

## 11. Phase C.3 handoff

- Reuse the pattern: classify the settled response inside the handler, gate Toasts on mount, context version and Hospital, never derive Toasts from retained state.
- Check whether each Server Action can raise `FORBIDDEN` or `UNAVAILABLE` after a write before treating it as definitive.
- Patient activation, profile/classification, OSM assignment and Care End remain without Phase C Toast integration.
