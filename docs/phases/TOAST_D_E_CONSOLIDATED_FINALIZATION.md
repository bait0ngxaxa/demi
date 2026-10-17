# Phase D + E — Consolidated Toast Finalization

## A. Baseline

- Starting HEAD: `054c8bb55d13281b77f7fbcd48b5a674548dc1d1` (Phase C accepted).
- Commits:

| Commit | Scope |
| --- | --- |
| `ebec58f` fix(ui): harden toast reliability and recovery across workflows | D-01 fix, D-02 app-wide copy guard |
| `061031e` refactor(ui): rationalize transient and persistent feedback | Phase E announcement and copy cleanup |
| `test(ui): finalize toast integration regression and accessibility audit` | this document (the commit containing this file) |

- Source of truth: `src/components/ui/notify.ts`, `app-toaster.tsx`, `mutation-action-state.ts`, `unknown-outcome-alert.tsx`, `confirmable-action-form.tsx` (all **unchanged** by D/E), the accepted phase documents [A](TOAST_A_FOUNDATION_PILOT.md), [B.1](TOAST_B1_HOSPITAL_GOVERNANCE.md), [B.2](TOAST_B2_HOSPITAL_ONBOARDING.md), [B.3.1](TOAST_B31_WORKFORCE_PROVISIONING.md), [B remaining](TOAST_B_REMAINING_CONSOLIDATED.md), [C.1](TOAST_C1_PATIENT_PROVISIONING.md), [C.2](TOAST_C2_PATIENT_IMPORT.md), [C.3–C.6](TOAST_C3_C6_PATIENT_OPERATIONS_CONSOLIDATED.md).

Not changed: Server Actions, services, authorization, Prisma schema, transactions, audit events, idempotency keys, LINE, the single root `AppToaster`, dependencies.

## B. Phase D findings

Inventory: 19 non-test modules import `notify`; 60+ call sites plus the Workforce/Content notice tables. Every call was re-read against its accepted outcome contract (section C).

| ID | Severity | Workflow | Evidence | Root cause | Resolution | Regression test | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 | Medium (correctness of feedback) | Single OSM assignment | Assign `ASSIGNED` → Unassign `UNASSIGNED`: Toast said "ยกเลิกการมอบหมาย อสม. แล้ว" while the inline Alert still said "มอบหมายผู้ป่วยให้ อสม. เรียบร้อยแล้ว". Assign `FORBIDDEN` → Unassign success kept "ดำเนินการไม่สำเร็จ". Both reproduced by failing tests before the fix. | `AssignmentFeedback` picked `assign ?? unassign` from two independently retained `useActionState` values, not the latest submission (listed as a C limitation). | The shared single-flight guard records which operation was submitted last; only that operation's state is rendered. No change to the lock, recovery, Toast or refresh. | `patient-osm-assignment-workspace.test.tsx`: "shows only the latest operation inline…", "does not keep an earlier assignment error…" | FIXED |
| D-01a | P2 (review follow-up) | Single OSM assignment | Assign `ASSIGNED` → Unassign `UNASSIGNED` → Assign again: while the new request was pending, and after it returned `UNAVAILABLE`, the first Assign success was shown (beside `UnknownOutcomeAlert`). Reproduced by a failing test. | D-01 selected by operation kind, not by submission. A thrown/unconfirmed request keeps the hook's previous state, and `latestOperation` is set inside the form-action transition, so React commits it only when the request ends. | Inline feedback is hidden while any assignment request is pending or unconfirmed; once settled, only the latest submission's confirmed result is shown. | "never shows an earlier assignment success for a later assignment that is pending or unconfirmed" | FIXED |
| D-02 | Low (privacy enforcement gap) | All non-Patient workflows | The static-copy guard only scanned `app/app/patients`; Admin, Hospital, Workforce, Settings and Support relied on per-test assertions. | Guard scope. | `app/toast-privacy.test.ts` (moved from `app/app/patients/patient-toast-privacy.test.ts`) scans every `notify.*` / `notify[notice.level]` argument and every notice table under `app/`: arguments must be a literal, a ternary between literals on a plain discriminant, or a reviewed static table; tables may not interpolate or forward a `.message`; copy is Thai, ≤ 80 chars, no digits/Latin. Mutation-checked: a `result.email` argument and a `"Released 42"` table entry both fail. | same file | FIXED |
| D-03 | Low (a11y) | Many (see E) | Success Toast (Sonner `aria-live="polite"`) and the success Alert (`role="status"`) announced the same outcome; Knowledge create/detail announced it a third time through an `sr-only` region. | Phase A kept Alert roles pending an audit. | Phase E. | section E | FIXED in E |

All other workflows: **PASS** — the notify call is reached only after typed classification, inside the awaited submission wrapper, gated on mount + current context; no Toast from effects or retained state; no Toast for NOOP/REPLAYED/unconfirmed; static copy. No blocking defect found.

Re-checked and still PASS (no code change): Support Report and Contact Email (A), Hospital suspension/restoration, onboarding approve/reject (B.1/B.2), single/bulk Workforce provisioning, remote and assisted activation, membership/OSM/owner/export/release, Hospital Contact, Support status, Content and images (B), single provisioning, import, activation lookup/issue/handoff (including the three Phase C review fixes), completion, profile/health/name, classification, bulk OSM, Care End (C).

## C. Outcome and recovery matrix (summary)

| Workflow | Success Toast | NOOP / replay | Unconfirmed recovery | Duplicate guard |
| --- | --- | --- | --- | --- |
| Support Report | yes | — | note: verify with owner (not idempotent) | ref lock |
| Contact Email | yes | — | reload | ref lock |
| Hospital governance | yes | — | reload | submission record |
| Onboarding review | yes | `CONFLICT` warning | reload | submission record |
| Workforce single / bulk | yes / full-partial-zero | `existing` rows not called new | replay with same `submissionId` | session lock |
| Remote activation | yes | — | reload; no regeneration while a link is unacknowledged | session lock |
| Assisted activation | none (navigation is the feedback) | — | specific note; no navigation | session lock |
| Membership / OSM / owner / export / release | yes | — | `UnknownOutcomeAlert` reload; release never resubmitted | session lock |
| Hospital Contact | yes | NOOP inline | reconciliation, draft kept | in-flight ref |
| Support status | yes | — | reload, button locked | ref lock |
| Content create / edit / lifecycle / images | yes | REPLAY / NOOP inline | marker + nonce kept; reconciliation; images never retried | in-flight ref / generation |
| Patient provisioning | yes | existing patient inline | resend original request (natural key) | ref lock |
| Patient import | full / partial / zero | — | fresh preview bound to original file | ref lock |
| Activation issue | yes | ALREADY_ISSUED / ACTIVE / RECONCILIATION inline | reload; no reissue form; handoff locks search, Hospital, links | ref lock |
| Activation completion | none (redirect) | — | sign in or ask Hospital | disabled submit |
| Profile / health / name | yes | — | reload (version check) | ref lock |
| Classification | yes | NOOP inline | reload; CONFLICT refreshes | ref lock + confirmation |
| Single OSM assignment | yes | NOOP inline | reload; CONFLICT refreshes | one lock for assign + unassign |
| Bulk OSM | yes | REPLAYED inline | resend identical `FormData` + `submissionNonce` | ref lock |
| Care End | none (redirect) | — | read-only verification; never resent | ref lock |

Details per row are in the phase documents linked in section A.

## D. Accessibility

Automated evidence (jsdom, Sonner 2.0.8 source):

- One Toaster (root layout); container `aria-label="การแจ้งเตือน alt+T"`; list `aria-live="polite"`, `aria-relevant="additions text"`, `aria-atomic="false"`. Sonner's Alt+T hotkey moves focus to the region; showing a Toast never moves focus. Close button `aria-label="ปิดการแจ้งเตือน"`, focus-visible ring from `--focus-ring`.
- Status is conveyed by Sonner's type icon plus text, not color alone.
- Sonner disables its transitions/animations under `prefers-reduced-motion: reduce`; DEMI adds no Toast motion.
- Desktop `top-right` below the header; ≤600px `bottom-center` with 1rem gutters and `safe-area-inset-bottom + 5rem`. The mobile navigation is a header drawer, so there is no bottom bar to overlap. No keyboard-avoidance guarantee (A.1).
- Announcements after E: a Toasted success is announced once (Toast); its Alert stays visible as a non-live record. NOOP and other untoasted outcomes keep `role="status"`. Errors keep `role="alert"` with a short error Toast (intentional, see E). Validation stays inline with field `aria-invalid`/`aria-describedby` (unchanged). Recovery Alerts (`UnknownOutcomeAlert`) keep `role="alert"` and survive Toast expiry; their buttons are keyboard-reachable.
- Toasts and refreshes are emitted only inside awaited submissions, so rerender/remount/`router.refresh()` cannot re-announce.

Manual UAT not executed (no browser, device or screen reader was available or started):

1. NVDA + Chrome and VoiceOver + Safari (iOS): each Toasted success is heard once; NOOP is heard; error Toast + `role="alert"` order is acceptable.
2. Keyboard: Alt+T reaches the Toast, Tab to close, Esc/close returns focus sensibly; confirmation dialogs (Care End, suspend, demote, classification change) keep focus.
3. Mobile 360px / iOS Safari: bottom placement, safe area, long Thai copy wraps, virtual keyboard open while a Toast shows.
4. 200% zoom / large text: Toast not clipped.
5. OS reduced motion: no Toast animation.

## E. Phase E cleanup

Decision (confirmed with the user): keep every Alert visible; remove only duplicate announcements.

Changed (success Alert/text now `role="none"` when a success Toast exists; NOOP keeps `role="status"`):

| Workflow | Change |
| --- | --- |
| Hospital governance | success Alert non-live |
| Hospital Contact | CREATED/UPDATED non-live; NOOP live |
| Content create | `sr-only` region reports pending only; success Alert non-live; copy "บันทึกฉบับร่างแล้ว กำลังเปิดรายการปัจจุบัน" → "สร้างฉบับร่างแล้ว กำลังเปิดรายการปัจจุบัน" to match the Toast (creating a draft is not saving an existing one) |
| Content detail | `sr-only` region reports pending only (it also repeated error and unconfirmed text already in their own Alerts); UPDATED/PUBLISHED/WITHDRAWN/ARCHIVED Alert non-live; NOOP live |
| Content images | removed the wrapping `aria-live` (nested live regions); count Alert non-live; the uncertain/partial warning Alert stays live |
| Workforce relationship controls (`ScopedMutationFeedback`) | success Alert non-live (every consumer has a success Toast) |
| Classification, single OSM assignment | changes non-live; NOOP live |
| Profile / health history | success `<p>` no longer `role="status"`; errors keep `role="alert"` |
| Name correction, Contact Email, Support Report | success Alert non-live; other variants unchanged |

Intentionally retained live and unchanged:

- Result UI with continuation/credential/count/link: Patient provisioning, import row results, bulk OSM result, Workforce provisioning and bulk rows, activation handoff (link/QR), activation `ALREADY_*`.
- Every error/conflict/forbidden Alert (Case B: the Toast is a short summary, the Alert carries remediation).
- Every `UnknownOutcomeAlert`, reconciliation panel, Care End verification Alert, irreversible-operation warning.
- No validation Toast existed (Case C); no unknown-outcome Toast existed (Case D); navigation Toasts (Content create before `router.push`) survive because the Toaster is in the root layout; Care End, assisted activation and activation completion stay Toast-free (Case E); read-only lookups emit nothing (Case F).

Copy audit: no other wording changed. Existing distinctions are correct ("ออกลิงก์" not "เปิดใช้งาน", partial import/bulk as warnings, NOOP/REPLAYED silent, unknown never called failure, Care End is "สิ้นสุดการดูแล", no clinical interpretation in any Toast).

## F. Verification

Focused, during D/E:

```text
npx vitest run "app/app/patients/[relationshipId]/assignment/patient-osm-assignment-workspace.test.tsx"   # D-01 red: 2 failed / 14 passed; green: 16 passed
npx vitest run app/toast-privacy.test.ts                       # 4 passed; mutation check: 2 failed as intended
npx vitest run app/app/support app/app/settings app/app/hospitals app/app/admin app/app/workforce app/app/patients app/toast-privacy.test.ts
                                                               # 56 files, 687 tests passed
mutation check (scoped-mutation role, content sr-only)          # 4 tests failed as intended, sources restored
```

Final, on the stable tree (results below):

```text
npm run test
npm run typecheck
npm run lint
git diff --check
```

| Command | Result |
| --- | --- |
| `npm run test` (full Vitest suite, run once at `061031e`) | 397 files, 3804 tests passed, 0 failed, 0 skipped |
| `npm run typecheck` | passed |
| `npm run lint` | 0 errors; 2 pre-existing `<img>` warnings (`hospital-content-image-list.tsx`, `hospital-content-image-manager.tsx`) |
| `git diff --check 054c8bb HEAD` and working tree | no whitespace errors (LF/CRLF notices only) |

The full suite was run because Phase E touched feedback in 13 modules across Admin, Hospital, Workforce, Settings, Support and Patient workflows. This document commit changes no code, so it was not rerun.

Not run: production build, dev server, browser/E2E, integration suite against a database (no DB-facing code changed), CI.

## G. Residual limitations

- Blocking defects: none.
- Non-blocking:
  - Browser Back/Forward away from an unresolved page drops in-memory recovery state (accepted in C; no browser storage introduced).
  - Screen readers may hear an error twice (short Toast + `role="alert"` remediation). Kept deliberately; confirm in UAT.
  - If a success arrives after the user moved to another context in the same instance, the Toast is suppressed and the (pre-existing) inline success is now non-live.
  - Support Report and image uploads are not idempotent; the recovery copy says to check first (unchanged).
- Manual UAT pending: section D list.
- Deferred: none of the out-of-scope items were needed.

## H. Final disposition

`IMPLEMENTED / MANUAL UAT PENDING` — code complete and automated verification recorded in F; assistive-technology, keyboard and mobile-device UAT not executed. This is not a production deployment approval.
