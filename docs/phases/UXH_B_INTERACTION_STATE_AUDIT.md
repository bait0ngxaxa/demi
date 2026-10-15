# UXH-B — System-wide Interaction State Audit

Date: 2026-10-15 (Asia/Bangkok)

## Disposition

**Interaction-state hardening: IMPLEMENTED with automated evidence. Real-browser verification: NOT EXECUTED (handed to UXH-D).**

Starting HEAD: `ce2e30afa16ccb1cd283bbb2d2dc8d0860681ff9` (clean `main`). Work is delivered in three commits: UXH-B.1 critical flows, UXH-B.2 operational flows, UXH-B.3 read/navigation/final audit (this document).

No schema, migration, capability, authorization, Server Action contract, import template, or business-rule change was made. No dependency was added. `next/form` and `useLinkStatus` ship with the installed Next.js 16.3.

## Verified platform behaviour that drove the changes

| Finding | Evidence | Consequence before UXH-B |
| --- | --- | --- |
| React 19.2 resets uncontrolled fields after every `<form action={fn}>` call, including calls that **return** a validation error. | Probe test against the installed React (deleted after use); react.dev form docs. | Validation errors on uncontrolled forms erased what the user typed. |
| A Server Action that **throws** (network loss, 5xx) rejects the `useActionState`/`startTransition` action and React rethrows to the nearest error boundary. | react.dev `useActionState`; Next.js error-handling docs ("model expected errors as return values"). | Most workspaces have no nearby boundary, so `app/error.tsx` replaced the whole shell with "ไม่สามารถตรวจสอบการเข้าใช้งานได้" and a retry that invited resubmission of a non-idempotent mutation. |
| Next.js rejects the action promise with a redirect error when an action redirects. | `server-action-reducer.js` in the installed Next. | Any catch-all must rethrow navigation signals (`unstable_rethrow`). |
| `error.tsx` `reset()` re-renders without re-fetching; `retry()` is stable since 16.3. | Bundled `error.md` (version history). | 8 of 9 boundaries' "ลองอีกครั้ง" could not recover a server render failure. |
| The App Router state key for a page segment excludes search params. | `layout-router.js` (`createRouterCacheKey(activeSegment, true) // no search params`). | Search-param navigation keeps the page mounted: `loading.tsx` does not reappear and uncontrolled filters keep stale values after a client-side "clear" or Hospital change. |
| `loading.tsx` is instant only when prefetched; `useLinkStatus` exists for `prefetch={false}` links. | Bundled `loading.md`, `use-link-status.md`. | Non-prefetched sidebar links gave no feedback until the server answered. |

## Interaction state contract implemented

- `useMutationActionState` (`src/components/ui/mutation-action-state.ts`): same tuple as `useActionState` plus `unknownOutcome`. A thrown dispatch keeps the previous state, sets the flag, and never retries. Navigation signals are rethrown. The flag clears on a later confirmed result.
- `UnknownOutcomeAlert`: inline warning that requires an explicit recovery contract per workflow (see "UXH-B.4 recovery contracts" below). Forms using `ConfirmableActionForm` pass `outcome="unknown"` and keep UXH-A's own unknown handling, without a duplicate alert; all of those are update or terminal transitions.
- `withConnectionFailure`: for retry-safe actions (sign-in, sign-out, lookups), a thrown request becomes an ordinary retryable error.
- `submitPreservingInput`: dispatches from `onSubmit` so a rejected submission keeps typed values. The `action` prop stays for pre-hydration submissions. Forms that relied on React's reset now reset explicitly after a confirmed success.
- `PendingSubmitButton`: `useFormStatus` plus the existing `Button loading` for `next/form` search and filter forms.

## Inventory and disposition

Legend: **AC** already correct · **F** fixed · **NA** not applicable · **SD** separate decision. Unless stated, pending feedback uses `Button loading` with conflicting controls disabled, and errors are inline Thai `Alert`s.

### Authentication, onboarding, account (UXH-B.1)

| Route / component | Actor | Action · mechanism | Before | Disposition / now |
| --- | --- | --- | --- | --- |
| `/login` `login-form` | Any | Sign in · `useActionState` | Pending OK; network failure → root boundary; identifier erased after a rejected login | **F** retryable connection error; identifier preserved |
| App shell `logout-button` | Authenticated | Sign out · `useActionState` | Network failure → root boundary | **F** retryable error |
| `/activate/patient` | Patient | Link check · effect; complete · `useActionState` | Link-check rejection left "กำลังตรวจสอบลิงก์..." forever; completion throw → root boundary | **F** retry for the check; completion unknown outcome blocks resubmit |
| `/activate/workforce` | Staff/OSM | Same | Same; national ID erased on error | **F** same; input preserved |
| `/app/personal/password` | Authenticated | Change password · `useActionState` | No spinner/`aria-busy`; throw → boundary | **F** `Button loading`, unknown outcome (password fields still clear, by design) |
| `/hospital/onboarding` | Public applicant | Submit · `useActionState` | Name/ID erased on validation error; throw → boundary | **F** |
| `/patient/access-request` | Public | Submit · `useActionState` | Same | **F** |
| `/line/account` client, recovery panel | Patient | Link/unlink/refresh · `fetch` | try/catch, busy flags, tests | **AC** |
| LINE appointment notification preference | Patient | Toggle · `useActionState` | Throw → boundary | **F** |

### Patient provisioning and activation (UXH-B.1)

| Route / component | Action · mechanism | Before | Disposition / now |
| --- | --- | --- | --- |
| `/app/patients/provision` single add | `useActionState` | Fields erased on validation error; throw → boundary | **F** preserved on error, reset after success; unknown outcome blocks resubmit |
| Excel preview | `useTransition` | Context-versioned, stale-safe; throw → boundary | **F** retryable "เชื่อมต่อระบบไม่สำเร็จ" |
| Import confirm | `useTransition` | Context-versioned, dialog locked while importing; throw → boundary | **F** lost response stays unconfirmed in the dialog, confirm blocked; recovery = re-check the file (row-level idempotency shows already-saved rows) |
| Import result, partial success, failed-row download | `fetch` | Accurate buckets; download never fakes success | **AC** |
| Hospital switch | `router.push` | No feedback; the controlled select snapped back while navigating | **F** `useTransition` + "กำลังเปลี่ยนโรงพยาบาล..." status, select disabled |
| `/app/patients/activation` search | `useActionState` | Search term erased; throw → boundary; Hospital switch already keyed (no stale results) | **F** term preserved, retryable failure, empty result distinct from failure; switch feedback |
| Link / QR issue (`patient-activation-handoff`) | `useActionState` | Throw → boundary | **F** unconfirmed issue replaces the controls with the reload alert |
| `ConfirmableActionForm` / `ConfirmDialog` | Shared | UXH-A semantics | **AC**; now also receives thrown-request outcomes as `unknown` (test added) |

### Operational workflows (UXH-B.2)

All of these previously sent a thrown request to the root boundary. Now each shows an inline unknown outcome and blocks conflicting actions in the same workspace (**F**), unless noted.

| Area | Components |
| --- | --- |
| Patient care | Screening, baseline, Goal Plan, follow-up, final assessment, round vitals, round review, Service 1 cards (routine, floating chart, dream, confidence), Program open/complete, classification, appointment create/reschedule/manage/interaction (staff and patient), reschedule request, patient profile + health history edit, OSM assignment (single and bulk), access-request review/withdraw, Hospital service-request review, service catalog |
| Hospital / admin | Hospital onboarding review, Hospital governance suspend/restore, owner promote/demote, staff membership profession/suspend/restore, OSM relationship suspend/restore, workforce release, workforce staff/OSM provisioning, link reissue, assisted activation |
| Patient self-service | Patient profile editor, patient service requests (create/withdraw), patient appointment acknowledgement/cancellation request |
| Family | Caregiver invitation create/revoke, relationship revoke/withdraw, appointment-grant propose/accept/revoke, invitation accept/reject |
| Transitions | Support report create, support status update, contact email, medication LINE reminder |

Further B.2 fixes:

- Input preserved after validation errors on round vitals, final assessment, Service 1 notes, profile/health-history edit, patient profile editor, reschedule request, patient service request, staff/OSM provisioning, caregiver invitation, workforce release.
- Family invitation preview no longer stays on "กำลังตรวจสอบคำเชิญ..." forever. A retry reuses the in-memory token, because the token has already been stripped from the URL.
- Workforce bulk add (**F**, deliberately not blocked): submissions are keyed and replay-safe per the existing copy, so a lost response tells the user to press "บันทึกทั้งหมด" again without editing.

Already correct (**AC**, untouched): wellness meal/exercise/weight goal and medication (own `UNCONFIRMED` handling and authority generations), Hospital contact workspace, knowledge create/detail/publish/image upload, evidence upload, bulk OSM candidate search (request gate), Service 1 evidence upload.

### Read, navigation, boundaries (UXH-B.3)

| Item | Before | Disposition / now |
| --- | --- | --- |
| 8 `error.tsx` using `reset()` | Retry did not re-fetch | **F** `retry()` (contacts boundary was already correct) |
| No boundary for patients/admin/settings/support pages | Root boundary removed the shell; message about access verification | **F** `app/app/error.tsx` keeps shell + navigation, retry or back to home; root boundary unchanged for shell/actor failures |
| `personal/error.tsx` | Nested `<main>` inside the shell's `<main>` | **F** `<div>` |
| 10 GET search/filter forms (patient directory ×2, assigned directory, workforce, bulk assign ×2, OSM assignment, reporting ×2, knowledge Hospital selector) | Full-document reload, no in-app pending, double-submit possible | **F** `next/form` client navigation (GET semantics kept) + `PendingSubmitButton`; previous results stay visible while loading |
| Filters after client-side "clear" / Hospital change | Uncontrolled fields kept stale values (page not remounted) | **F** fields keyed to URL state (existing workforce convention) |
| Post-save navigation in screening, baseline, Goal Plan, follow-up, appointment | Between success and `router.push`, no success shown and the submit button re-enabled | **F** success status "บันทึกแล้ว กำลังเปิดรายการที่บันทึก..." and inputs locked until navigation |
| Sidebar (`prefetch={false}` items) | No feedback until the server answered | **F** `useLinkStatus` spinner + sr-only "กำลังเปิดหน้า" on the clicked link |
| Mobile drawer navigation | The drawer (and its links) unmounted on navigation, discarding the link status | **F** (UXH-B.4) `MobileNavigation` performs the navigation in its own transition (`router.push`); a spinner beside the menu trigger, `aria-busy` on the trigger, and a persistent `role="status"` region show "กำลังเปิดหน้า" until the destination renders or fails |
| Report XLSX export | Pending, disabled, no fake download | **AC**; **F** failure now `role="alert"` and danger-coloured instead of a muted status |
| Template download, activation slips (native) | Browser-managed | **NA** |
| `loading.tsx` coverage | Every `/app` page has its own or an ancestor skeleton; only `app/app/layout.tsx` awaits data, inside `Suspense` | **AC** |
| `not-found.tsx` (3) | Safe copy with a scoped back link | **AC** |

## UXH-B.4 recovery contracts (post-review)

The review found that reloading after a lost response regenerates server-rendered submission nonces (for example Screening and Appointment). A later attempt would therefore be a new request that could legitimately create a second record. Reload is no longer presented as verification for creates. Each unknown-outcome site now declares one contract:

| Contract | Behaviour | Why it is safe | Workflows |
| --- | --- | --- | --- |
| **resend** | "ตรวจสอบผลด้วยคำขอเดิม" re-sends the exact captured payload (same nonce, expected version, or natural key) only when the user clicks. Fields stay locked. The page warns before unload while the outcome is unconfirmed. | Verified in the services: a nonce replay with an identical payload returns the original record (`ConflictError` if the payload differs); unique keys or state checks return `ALREADY_*` or a conflict. The server action still re-runs actor, relationship and Hospital authorization. | Nonce: Screening, Appointment create, Follow-up, Goal Plan, round vitals, round review, reschedule request, patient/staff cancellation request, coordination, OSM bulk assignment. Natural key or state: Appointment reschedule and acknowledgement, baseline, Final Assessment, Program open, Service 1 records (`ALREADY_RECORDED`), single Patient provisioning (`ALREADY_PROVISIONED`), public access request (returns the existing request), Hospital onboarding application, caregiver invitation (pending invitation → conflict), appointment-grant proposal, invitation accept/reject, workforce staff/OSM provisioning, Patient/Workforce activation completion (single-use token). Link issue, link reissue and assisted activation also use resend, but each resend is a new issue under the same policy. The UI shows the newly issued link and does not present it as the unconfirmed one; no account or relationship is created twice. |
| **reload** | "โหลดข้อมูลล่าสุด" re-reads the page. The copy asks the user to load the latest data before repeating; it does not claim which request changed the state. | Update or terminal transitions guarded by an expected version or state. The page shows the entity's current state, and a repeat after reload uses the fresh version. | Patient profile/health-history edit, patient profile editor, Hospital governance restore, owner promote, staff profession/restore, OSM restore, workforce release, no-show, OSM assign/unassign, access-request review/withdraw, Hospital service-request review, service catalog, LINE appointment notifications, caregiver invitation/relationship revoke and withdraw, grant accept/revoke, onboarding review, support status, contact email, medication reminders; plus every `ConfirmableActionForm` site (Program complete, classification, appointment cancel/complete, cancellation approval, suspend/demote) |
| **review** | States that re-sending may create a duplicate. "ตรวจสอบรายการคำขอล่าสุด" reloads the page that lists the persisted requests. | No deduplication key exists, so the user decides after seeing the list. | Patient service request create |
| **note** | Explains how to check outside the form. No in-page action is offered. | No safe in-page verification exists. | Password change (sign in with the new password); support report create (no deduplication key, so re-sending may duplicate) |

Unchanged: Excel import confirmation already recovers by re-checking the file, because the stateless preview reports already-imported rows. Workforce bulk add keeps its keyed retry.

## Separate decisions / not done

- **SD-1** The root `app/error.tsx` copy says access could not be verified. It is accurate for shell/actor failures, which are the only errors that now reach it inside `/app`. Rewording for public pages is UXH-C copy work.
- **SD-2** Support reports and patient service requests have no server-side deduplication key. Their recovery is limited to the contracts below (a note, or a review of the persisted list). Adding an idempotency key is a contract change for a later decision.
- **SD-3** Patient knowledge feed category buttons remain native GET submissions (full reload, low risk). They were not converted.

## Verification executed

| Check | Result |
| --- | --- |
| Focused tests per checkpoint (shared UI, auth/activation, provisioning, activation search, operational forms, family, navigation, `PendingSubmitButton`) | Passed |
| New or extended test files | `mutation-action-state.test.tsx`, `confirmable-action-form.test.tsx` (+1), `activation-interactions.test.tsx`, `patient-activation-interactions.test.tsx`, `patient-provisioning-workspace-interactions.test.tsx` (+3), `operational-interaction-states.test.tsx`, `family-invitation-preview-recovery.test.tsx`, `navigation-list.test.tsx` (+1), `pending-submit-button.test.tsx` |
| Test adjustments | `family-invitation-preview.test.tsx`: the `useState` mock now drives only the preview object. Two assertions changed from `method="get"` to "not POST", because `next/form` omits the attribute and HTML defaults to GET. |
| `npm run lint` | 0 errors; 2 pre-existing `no-img-element` warnings in untouched files |
| `npm run typecheck` | Passed |
| `npm test` (full unit suite, once, after the code stabilized) | 353 files / 3164 tests passed |
| Integration (PostgreSQL) suite | Not run: no transport, contract, or persistence code changed |
| Production build | Not run |
| UXH-B.4 focused tests | `mutation-action-state.test.tsx` (lost response then resend with the same nonce: one record; resend sends the original payload; unload warning only while unconfirmed; a reloaded page is a new identity; reload/review/note contracts), `operational-interaction-states.test.tsx` (round review lost response then resend: one record), `mobile-navigation.test.tsx` (status persists after the drawer closes, clears on render and on failure, focus moves to main) — passed |
| UXH-B.4 full unit suite (once) | 354 files / 3176 tests passed. Only the new mobile test file changed afterwards (lint fix); it was re-run and passed. |
| UXH-B.4 lint / typecheck | 0 errors (2 pre-existing `no-img-element` warnings); typecheck passed |

## Browser testing limitations (UXH-D handoff)

No real-browser session was run in UXH-B. jsdom tests cover pending, unknown, preserved-input, and stale-state logic; they do not prove real network timing. UXH-D should exercise, per role and on mobile and desktop:

1. A throttled network and an offline toggle during a create (screening, appointment, provisioning) → the unknown alert appears, no duplicate after reload.
2. Rapid double clicks on every primary submit.
3. Patient directory search, then "ล้างการค้นหา", then a Hospital change → filters match the URL, and previous results stay until new ones arrive.
4. Non-prefetched sidebar items on slow 3G → per-link spinner, no global block.
   Mobile: follow a drawer link on slow 3G → the drawer closes, a spinner shows beside the menu button and a screen reader announces "กำลังเปิดหน้า", and both clear when the page renders.
7. Create with the response dropped after commit (DevTools offline right after the request leaves) → "ตรวจสอบผลด้วยคำขอเดิม" shows the saved record and no duplicate; a reload attempt shows the browser's leave-page warning.
5. A server render failure on a patient subpage → `app/app/error.tsx` keeps the shell; "ลองโหลดอีกครั้ง" recovers once the server is healthy.
6. Excel import with the connection dropped during confirmation → unconfirmed dialog, then re-check shows `ALREADY_EXISTS` rows.

Multi-role browser UAT still needs seeded accounts (Patient SELF, OSM, MEMBER, Parent/Child, Platform ADMIN), as recorded in UX-09.
