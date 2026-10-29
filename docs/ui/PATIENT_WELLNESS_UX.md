# Patient Wellness interactive UX — 2026-10-29

## Scope and direction contract

Operate surface: `/app/personal/wellness`, Thai-first, exact persisted Patient SELF. The request is the current product authority for this extension of Phase 17H. Meal, Exercise, Weight Goal and Self Measurement remain separate domains.

- **THESIS:** Select everyday actions quickly, with manual entry always available. Read persisted daily records before interpreting anything about health.
- **OWN-WORLD:** Inherit `DESIGN.md`, existing clinical green tokens, Thai typography, Panel, Button, Input, semantic form controls and established feedback. No new global design system.
- **STORY:** Select a date, read daily record counts and recorded exercise minutes, add a meal or activity, review/edit/delete records, or set a personal weight target.
- **FIRST VIEWPORT:** Page header, section shortcuts, calendar input and daily overview. On narrow screens the date controls and summary stack vertically; sections follow in meal/exercise/weight order. The signature interaction is selecting a meal card to reveal its editable entry fields.
- **FORM:** Existing responsive application workspace; native radio cards, searchable activity buttons and a native range input. Code-led extension; seed: none (unavailable). The three referenced screenshots were not attached in the accessible request, so visual fidelity to them is unverified.
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. No shipping rasters or global design changes are needed here.

## Delivered behavior and files

| Phase | Files / responsibility |
| --- | --- |
| A | `personal-wellness-workspace.tsx`: mobile section shortcuts and shared dashboard composition using existing tokens. |
| B | `personal-meal-controls.tsx`: four native meal category radio cards revealing the manual editor; `personal-exercise-controls.tsx`: searchable Thai activity conveniences and custom names. Existing actions, editing and confirmed deletion retained. |
| C | `personal-weight-goal-controls.tsx`: 1–26 week duration selection, explicit apply, optional manual target date; `personal-weight-goal.ts`: Bangkok civil calendar addition, independent of browser time zone. |
| D | `page.tsx`: authenticated initial today scope. `daily-wellness-action.ts`: combined read, withholding both payloads on either denial. Domain list schemas/form parsers: optional validated `occurredOn`. Domain query services: owner/date scope, date-compatible signed cursors, snapshot-consistent full-date counts and exercise aggregation. Domain page DTOs: optional daily summaries. All three workspaces: date-navigation coordination; journals refresh their date reads after confirmed mutations. |
| Verification | `wellness-interactions.test.tsx`, `daily-wellness-interactions.test.tsx`, `daily-wellness-action.test.ts`, `weight-goal-duration.test.ts`, updated page/contract/lifecycle tests and Meal/Exercise PostgreSQL integration tests. |

No schema, migration, dependency or lockfile changes. Existing owner/date indexes serve the date queries. Unfiltered list callers retain their paginated history contract. Selected-day histories remain paginated, while aggregates cover the entire selected day, independent of the cursor.

Duration sums include only records with a supplied duration. An all-null duration scope remains null; an empty journal means missing records, not a recorded zero or evidence of inactivity. Counts describe entries, not unique meals, adherence or clinical progress. Multiple intentional entries per meal category/day or exercise/day remain legal.

The slider is not persisted. Moving it does not change the saved date; pressing “ใช้ระยะเวลานี้” calculates `targetDate` from the Bangkok date at that interaction. Merely opening/editing a goal preserves its original optional date, including an unchanged past date. The server still enforces the existing create/changed-date rules.

## Security and consistency

- Each domain continues to resolve the authenticated persisted ACTIVE Patient SELF inside its transaction. No browser-supplied owner IDs or role claims are accepted.
- Submission nonces, surviving create receipts, `expectedUpdatedAt`, physical deletion and transactional audit code are unchanged.
- Confirmed mutations refresh the selected-day aggregate; while unavailable the dashboard withholds that total instead of showing a stale calculation. Moving a record to another date removes it from the current day's list.
- Pending or uncertain mutations prevent date navigation from discarding their retry/review state. Explicit new journal intent retains the existing recovery semantics.
- Shared private authority, request generations, unmount guards, pagehide clearing and BFCache reload remain in use. A denied daily read clears all private sections; a late read after invalidation is ignored.
- Self Measurement is linked as a separate workflow. No personal observations, clinical synchronization, staff/caregiver visibility, BMI, weight progress or goal completion were introduced.

## Verification evidence and limits

- Focused Wellness/domain suite: 25 files, 261 tests passed; subsequent focused interactive checks passed after the meal disclosure/layout refinement.
- PostgreSQL integration: Meal, Exercise and Weight Goal, 3 files / 83 tests passed, on the guarded disposable `demi_test` database. Includes >50 daily entries, same-date continuation, other-day rejection, owner isolation, fresh persisted-authority denial and totals after move/delete, plus existing nonce/conflict/audit regressions.
- Final stable source: `npm run typecheck` PASS; `npm run lint -- --max-warnings 0` PASS; `npm run test` PASS, **540 files / 5,984 tests**, one full-suite run after diff review and focused checks. Subsequent edits only complete this handoff. The broad suite emitted non-failing jsdom navigation diagnostics from unchanged LINE account tests.
- No `architecture:check` or `lint:strict` script exists. Existing lint with zero allowed warnings was used; module boundaries were inspected directly. No production build is justified by these changes.
- Browser: actual local application denied the existing Hospital-only session. The saved synthetic Patient login was rejected. Authenticated Patient browser mutations and real-device/BFCache UAT remain unverified; no credentials or authority were changed to bypass this.
- Isolated static SSR previews used the shipping components and compiled app CSS with empty states, no patient records or fake metrics. Chrome DOM measurements showed no horizontal overflow at widths 320, 390 and 1440; the Weight editor also fit 320. This is layout evidence, not an authenticated end-to-end flow. Interactive behavior is covered by mounted React/jsdom tests and real database tests.
- Local screenshots live under ignored `.next/wellness-review/`: `mobile-320.jpg`, `mobile.jpg`, `desktop.jpg`, `weight-320.jpg`. They depict only isolated component previews, not patient data. The temporary renderer was removed; previews add no application route or production bypass.
- Impeccable independent finish review: **SHIP**, no material findings, limited to source and isolated SSR screenshot evidence. Documentation review: complete; preserve `DESIGN.md` and `.impeccable/design.json`. The documenter noted pre-existing sidecar references to mobile drawer / Geist that differ from current bottom navigation / Noto Sans Thai; these were left untouched.
- The first Weight Goal focused runner attempt stopped before tests because Windows could not rename the Prisma engine DLL while the dev server used it (`EPERM`). The final three-file integration run used the existing generated client, loaded `readCommittedIntegrationEnvironment()`, called `assertDisposableIntegrationEnvironment()`, then spawned Vitest with `--config vitest.integration.config.mts` and the three explicit integration paths. The normal database-identity global setup also ran. No isolation check was bypassed.

## Phase E — deferred Product Owner decisions

Nothing from Phase E is implemented. Approval must specify all of:

1. Trusted nutritional data sources, licensing and update responsibility; whether a food database is approved.
2. Which values are entered manually versus calculated, with explicit provenance for both.
3. Calculation formulas, assumptions, estimation labels and intended clinical/non-clinical interpretation.
4. Ownership and authority to set or change calorie targets.
5. Units, precision, conversion and rounding rules.
6. Meaning of missing, unknown and recorded zero values.
7. Data provenance, correction history and treatment of changing source data.
8. Privacy, consent, retention, visibility and any secondary use.
9. A separate domain contract for personal weight observations and any proposed weight-progress linkage.

## Remediation — baseline `fb6b7282` (2026-10-29)

This section records the remediation of the implementation above. Earlier verification, isolated SSR screenshots and the earlier **SHIP** verdict are historical baseline evidence only; they do not establish acceptance of this remediation. The implementation commits are `bbbac8b` (F1, unresolved create intent), `895283f` (F2, separate read/mutation locks) and `d6797a2` (F4, Bangkok recording dates). The current source also includes the focused journal retry/lifecycle refinements reviewed during this remediation.

### F1 — preserve an unresolved journal create intent

The Meal and Exercise workspaces previously allowed ordinary new-intent actions to replace the nonce after an uncertain create. Retry fields also remained editable, so the same nonce could be sent with different values. A successful list read could discard unresolved context without reconciling its receipt. The recovery form now disables editing; because native submission omits disabled controls, retry explicitly uses a retained snapshot instead of rebuilding the request from the disabled form.

Each journal create hook now retains the original submitted `FormData` in memory and copies that retained payload for each retry. An uncertain response or retryable conflict freezes the editable fields and offers “ลองคำขอเดิมอีกครั้ง”. Ordinary new-intent actions, record selection and selected-day switching cannot discard the unresolved create. A later failed retry does not release recovery: the same payload and nonce survive until a confirmed mutation result or `CREATE_CONSUMED`. A list read alone cannot prove rollback. The retained payload is not persisted in browser storage. Server services, receipts, nonce contracts and transactional authorization are unchanged; this remediation concerns the Meal and Exercise journal create hooks, not a new Weight Goal recovery contract.

### F2 — separate read activity from mutation authority

The same Boolean navigation-lock signal represented reads and writes. Successful reads could clear unresolved mutation protection, while failed reads never released their lock. Mutation pending callbacks could overwrite those signals, and read feedback could overwrite mutation feedback. Each journal now owns an activity ref with `readPending` and write state `IDLE`, `WRITE_PENDING`, `UNRESOLVED_CREATE`, `REVIEW_REQUIRED` or `CONFIRMED`. It synchronously publishes the derived navigation lock when those activities change. Completing a read releases only that read's activity; unresolved creates and existing-record review requirements retain their write lock.

Read warnings and mutation feedback occupy separate state and feedback regions. A refresh failure can warn that the list/summary is unavailable while keeping the confirmed result or unresolved retry instruction visible. Daily aggregates are withheld while a fresh authoritative read is unavailable. Request generations, private-authority generations and active/unmount guards reject late responses; unmount invalidates the pending read and releases that journal's published lock. A successful fresh read can reconcile an existing-record review, but cannot resolve an uncertain create. No server mutation, permission or persistence rule changed.

### F4 — maintain the live Bangkok recording-date limit

The browser date controls previously lacked a live maximum for Thai recording dates. A server-provided day could become stale after hydration delay, midnight or a sleeping tab. The workspace now reconciles Bangkok today after hydration, schedules the next Bangkok midnight, and refreshes the limit on focus and visibility changes. Both journal recording-date inputs and the daily date selector receive the live maximum. The date-submit handler independently recomputes Bangkok today and rejects a future date before requesting the selected day.

Updating this limit preserves the selected day and all editor drafts. It does not rewrite recording dates or Weight Goal targets. The existing optional Weight Goal date, 1–26 week slider, explicit “ใช้ระยะเวลานี้” action and server target-date validation remain unchanged. Server validation remains authoritative.

### F3 — reference comparison is BLOCKED

The three requested reference images were not attached or accessibly provided, and no corresponding reference fixtures were found in the repository. Screenshot-to-implementation differences are therefore **UNKNOWN**. Source inspection establishes the implementation below; it cannot establish fidelity to an unavailable image.

| Requested layout / interaction reference area | Actual implementation inspected | Screenshot-to-implementation differences |
| --- | --- | --- |
| Overall Wellness layout and daily calendar/overview | Existing Thai page header, section shortcuts, native date selector and daily readback; responsive stacking uses the existing workspace and tokens. Live Bangkok date limit and event guard apply. | **UNKNOWN — reference unavailable; F3 BLOCKED** |
| Meal selection and entry | Four native category radio cards reveal manual fields; unresolved creates freeze fields and retain the original payload/nonce for retry. | **UNKNOWN — reference unavailable; F3 BLOCKED** |
| Exercise selection and entry | Searchable Thai activity conveniences with manual entry, journal readback, independent read warnings and protected create recovery. | **UNKNOWN — reference unavailable; F3 BLOCKED** |
| Weight Goal duration/date interaction | Native 1–26 week range, explicit apply action and optional manual target date; existing target rules retained. | **UNKNOWN — reference unavailable; F3 BLOCKED** |
| Mobile navigation and touch ergonomics | Existing section anchors, stacked responsive controls and shared mobile touch-target primitives retained. No fresh rendered geometry measurement in remediation. | **UNKNOWN — reference unavailable; F3 BLOCKED** |
| Date history, empty, loading and confirmation states | Date-scoped persisted history, empty copy, pending controls, delete confirmation and separate refresh/recovery feedback remain; component behavior is tested. | **UNKNOWN — reference unavailable; F3 BLOCKED** |

Native controls, Thai content, clinical green semantic tokens, existing typography, Panel, Button, Input, Alert and focus treatments are retained. No new visual system, imagery or raster asset was introduced. `DESIGN.md`, `PRODUCT.md` and `.impeccable/design.json` remain unchanged. The previously noted sidecar drift is not canonized or repaired by this task.


### Remediation file responsibilities

| Files | Responsibility |
| --- | --- |
| `personal-meal-controls.tsx`, `personal-exercise-controls.tsx` | In-memory original-request snapshot, immutable retry fields/payload, persistent unknown-outcome navigation marker and recording-date maximum. |
| `personal-meal-workspace.tsx`, `personal-exercise-workspace.tsx` | Separate read/write activity, guarded new intent/history selection, safe refresh cleanup, warnings and confirmed feedback. |
| `personal-wellness-workspace.tsx` | Live Bangkok maximum, event-time date validation and unavailable aggregate copy. |
| `journal-recovery.test.tsx` | Both journals: lost response, same payload/nonce retry, failed retries/reads, consumed/replayed creates, edit conflict, unmount and authority invalidation. |
| `daily-wellness-interactions.test.tsx`, `wellness-private-response-matrix.test.tsx` | Both-domain date protection, failed aggregate navigation, stale/replaced reads, write/read overlap, timezone and midnight behavior. |
| `personal-meal-workspace.test.tsx`, `personal-exercise-workspace.test.tsx`, `personal-wellness-workspace.test.tsx`, `wellness-interactions.test.tsx` | Static contract alignment, frozen recovery fields, recording maximum and unrestricted future Weight Goal dates. |
| `tests/integration/personal-meal.integration.test.ts`, `tests/integration/personal-exercise.integration.test.ts` | Real PostgreSQL commit-then-response-loss replay with one row, receipt and create audit. |
| `docs/ui/PATIENT_WELLNESS_UX.md` | Root causes, design, actual evidence and blocked F3 acceptance. |

### Remediation verification and remaining limits

- Independent finish reviewer: no material source or interaction issue found; formal disposition is **RECAPTURE** because reference images and fresh visual captures are missing. This is not visual-fidelity acceptance.
- The detector was run once over five UI files and returned `[]`. This finding does not replace visual or authenticated browser verification.
- Real PostgreSQL verification **PASS**, three files / 85 tests: Meal 29 tests, Exercise plus Weight Goal 56 tests. The response-loss scenario commits a real transaction before losing the response; retry returns `REPLAY` with one persisted row, one surviving receipt and one audit event.
- Remediation `npm run typecheck` PASS and `npm run lint -- --max-warnings 0` PASS. An earlier lint invocation overlapped a test-file write and reported a transient parse error; the stable-file targeted lint and subsequent whole-repository lint passed. The first `npm run build` compiled but exhausted its default approximately 2 GiB Node heap during type checking. One resource-adjusted retry with command-local `NODE_OPTIONS=--max-old-space-size=6144` PASS, including TypeScript, page data collection and generation of all 58 static pages. No check, repository config or environment file was weakened or changed. The one final full-suite run (`npm run test`) completed 541 files / 6,015 tests: 540 files / 6,014 tests passed; one Wellness composition assertion still required date inputs to have no maximum, contrary to approved F4. That deterministic failure was reproduced alone and the assertion changed to require the Bangkok maximum on all three recording-date inputs. The affected four-file run passed 37 tests, then the complete Wellness scope passed 15 files / 108 tests. All production code is unchanged since the broad run. No second full-suite run was performed for this isolated test-expectation correction. Existing LINE tests emitted nonfatal jsdom navigation diagnostics. Targeted ESLint was also rerun for the changed composition test.
- Browser attempt: the local production server started successfully. Its configured canonical-origin redirect sent the browser to the existing deployment, whose active session was Admin and correctly showed the Patient-only denial. That deployment is not evidence for this local patch; authenticated Patient browser flows and fresh remediation screenshots remain unverified. No account, permissions, auth configuration or credentials were changed. The temporary server/tab and disposable PostgreSQL container were stopped after verification, preserving database data. Ignored `.next/wellness-review/` screenshots remain previous-baseline isolated SSR evidence only, not reference comparison or remediation acceptance.
- Reference comparison and fresh responsive captures remain outstanding. Authenticated Patient mobile flows, device/browser native-date behavior, sleeping-tab/midnight behavior on real devices and BFCache UAT remain unverified in a real browser/device session. Mounted interaction and real-database checks do not establish those visual/device results.
- No schema, migration, dependency, authentication, authorization, clinical calculation or clinical interpretation changes were introduced. Phase E remains deferred under the separate Product Owner decisions listed above.

## Follow-up F5 — review-required intent protection

The `REVIEW_REQUIRED` navigation lock could be cleared by ordinary new-intent or record-selection handlers, because they guarded only pending writes and unresolved creates. Both journals now disable those controls and synchronously reject those handlers during `REVIEW_REQUIRED`. The original entry/version and lock survive failed refreshes; only a successful non-append latest read reconciles this state. An explicit Thai warning explains the required recovery action.

Eight mounted regressions cover Meal/Exercise × edit/delete × UNCONFIRMED/CONFLICT, attempted new intent/other record selection, failed refresh, and successful reconciliation. The focused recovery/privacy run passed 44 tests in two files; targeted ESLint passed. No server, schema, receipt or audit changes.
