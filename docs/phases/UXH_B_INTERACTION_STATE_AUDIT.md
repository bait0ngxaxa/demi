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
- `UnknownOutcomeAlert`: inline warning with the existing UXH-A message and a "โหลดข้อมูลล่าสุด" reload. Reload is the reconciliation step because it re-reads persisted state and discards stale nonces and client state. Forms using `ConfirmableActionForm` pass `outcome="unknown"` and keep UXH-A's own unknown handling, without a duplicate alert.
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
| Sidebar / mobile nav (`prefetch={false}` items) | No feedback until the server answered | **F** `useLinkStatus` spinner + sr-only "กำลังเปิดหน้า" on the clicked link |
| Report XLSX export | Pending, disabled, no fake download | **AC**; **F** failure now `role="alert"` and danger-coloured instead of a muted status |
| Template download, activation slips (native) | Browser-managed | **NA** |
| `loading.tsx` coverage | Every `/app` page has its own or an ancestor skeleton; only `app/app/layout.tsx` awaits data, inside `Suspense` | **AC** |
| `not-found.tsx` (3) | Safe copy with a scoped back link | **AC** |

## Separate decisions / not done

- **SD-1** The root `app/error.tsx` copy says access could not be verified. It is accurate for shell/actor failures, which are the only errors that now reach it inside `/app`. Rewording for public pages is UXH-C copy work.
- **SD-2** Reload is the only generic reconciliation for unknown outcomes. Per-flow "check whether it was saved" reads would need product decisions per workflow.
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

## Browser testing limitations (UXH-D handoff)

No real-browser session was run in UXH-B. jsdom tests cover pending, unknown, preserved-input, and stale-state logic; they do not prove real network timing. UXH-D should exercise, per role and on mobile and desktop:

1. A throttled network and an offline toggle during a create (screening, appointment, provisioning) → the unknown alert appears, no duplicate after reload.
2. Rapid double clicks on every primary submit.
3. Patient directory search, then "ล้างการค้นหา", then a Hospital change → filters match the URL, and previous results stay until new ones arrive.
4. Non-prefetched sidebar items on slow 3G → per-link spinner, no global block.
5. A server render failure on a patient subpage → `app/app/error.tsx` keeps the shell; "ลองโหลดอีกครั้ง" recovers once the server is healthy.
6. Excel import with the connection dropped during confirmation → unconfirmed dialog, then re-check shows `ALREADY_EXISTS` rows.

Multi-role browser UAT still needs seeded accounts (Patient SELF, OSM, MEMBER, Parent/Child, Platform ADMIN), as recorded in UX-09.
