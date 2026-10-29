# Patient Wellness interactive UX — 2026-10-29

## Scope and direction contract

Operate surface: `/app/personal/wellness`, Thai-first, exact persisted Patient SELF. The request is the current product authority for this extension of Phase 17H. Meal, Exercise, Weight Goal and Self Measurement remain separate domains.

- **THESIS:** Select everyday actions quickly, with manual entry always available. Read persisted daily records before interpreting anything about health.
- **OWN-WORLD:** Inherit `DESIGN.md`, existing clinical green tokens, Thai typography, Panel, Button, Input, semantic form controls and established feedback. No new global design system.
- **STORY:** Select a date, read daily record counts and recorded exercise minutes, add a meal or activity, review/edit/delete records, or set a personal weight target.
- **FIRST VIEWPORT:** Page header, calendar input and daily overview before section shortcuts. On narrow screens the date controls and summary stack vertically; sections follow in meal/exercise/weight order. Meal category selection and the search-first exercise picker reveal their editable entry fields.
- **FORM:** Existing responsive application workspace; native radio cards, searchable activity buttons and a native range input. The initial extension had no accessible reference images. The later local references and current comparison are recorded under “Reference follow-up”; that evidence supersedes the earlier missing-reference status without changing its historical verdict.
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

### F3 — historical reference comparison was BLOCKED

At this remediation checkpoint, the three requested reference images were not attached or accessibly provided, and no corresponding reference fixtures were found in the repository. Screenshot-to-implementation differences were therefore **UNKNOWN**. The table below preserves that checkpoint. The later “Reference follow-up” supersedes its missing-reference blocker; it does not retrospectively establish acceptance of this checkpoint.

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

## Reference follow-up — actual local references (2026-10-29)

The user subsequently supplied accessible local references in `Downloads/`: `ร่าง DEMI App ใหม่ (5).png` (weight), `ร่าง DEMI App ใหม่ (4).png` (exercise) and `ร่าง DEMI App ใหม่ (3).png` (daily overview and meals). These images have now been inspected. F3 is no longer blocked by missing references. Earlier **BLOCKED**, **RECAPTURE** and **SHIP** records above remain evidence for their own source states and review scopes, not acceptance of the current follow-up.

### Reference comparison and intentional differences

| Reference | Current implementation | Intentional difference / outcome |
| --- | --- | --- |
| Daily/meal `(3)`: date first, prominent summary, exercise section, four meal add rows | Daily overview now precedes section navigation; actual persisted record counts receive greater emphasis. Four full-width meal category rows on mobile reveal the manual details and focus the revealed details heading. | The existing shared shell, Thai typography and DEMI clinical green remain. The screenshot’s orange actions and blue headings do not establish a replacement design system. Meal entries remain manually described records rather than calculated nutrition. |
| Exercise `(4)`: search first, vertically stacked activity add rows | Search and preset/custom activity selection appear before the write form. Mobile choices are full width in a bounded native scroller; at `sm` they use two columns. Selecting an activity reveals the editable form and focuses its activity field. | Text-labelled controls provide the action without decorative activity illustrations. Notes, optional duration/date and editable activity names remain supported. Returning to the picker restores search focus and preserves the draft and submission nonce. |
| Exercise `(4)`: total and history action below activity choices | A summary below the editor uses the server’s selected-day `dailySummary`, with actual entry count and supplied duration only, plus a history link. The summary is withheld while refreshed or unavailable. | No calories or unsaved draft totals. The footer stays in normal document flow below the bounded list, avoiding a fixed overlay that would compete with app bottom navigation. |
| Weight `(5)`: desired weight and 1–26 week slider, then current weight and height | The existing target-only editor retains the 1–26 week range, explicit “ใช้ระยะเวลานี้” action and optional manual target date. | The range is a convenience for computing `targetDate`, not a separately persisted prescription. Current weight and height remain outside this domain; no observation, BMI, weight-progress linkage or automatic calculation was added. |
| Daily/meal `(3)`: calorie ring, calorie target and nutrition facts | The overview reports saved meal/activity counts and recorded exercise minutes. | The calorie ring, calorie target, nutrition facts and food calculations remain excluded pending the Phase E domain decisions above. Missing records are not evidence of zero intake or inactivity. |
| All references: mobile, short task-oriented recording | Existing responsive Panel, Button, Input, native controls, focus treatments and Thai recovery messages remain; selected-day history, editing and confirmed deletion are retained. | Conflict handling, idempotency and unresolved-request protection take precedence over simplifying the visible form into an unsafe one-step save. No authentication, authorization, schema or business-domain contract changed. |

Exercise search is outside the write form: its native `form` association is null. Enter in search cannot implicitly save an activity, and the hidden-editor submit guard rejects a save before an activity is selected. Explicit activity selection remains required to reveal the editable form. The F5 fix in `79d17a7c` remains in force: disabled controls and synchronous guards preserve the selected entry/version during `REVIEW_REQUIRED`, failed reads retain the lock, and only a successful non-append latest read reconciles it. A successful read still cannot resolve an uncertain create.

### Follow-up evidence and acceptance limits

- Fresh isolated empty-state SSR snapshots use the current shipping components and compiled application CSS; used utility definitions were checked. The preview label remains visible. No Patient session, records or synthetic clinical metrics were supplied. Temporary rendering files were removed; no app route, authority bypass or runtime persistence was added.
- Versioned review evidence: [mobile Exercise](assets/wellness-followup/exercise-mobile.png), [desktop Exercise](assets/wellness-followup/exercise-desktop.png), and [mobile daily overview](assets/wellness-followup/dashboard-mobile.png). These PNGs are native Chrome screenshots of the labelled empty component previews, produced for this follow-up; they are documentation evidence, not shipping UI assets. No reference image or Patient data is copied into them.
- Ignored captures are under `.next/wellness-reference-review/`: `exercise-320.png`, `exercise-390.png`, `exercise-1440.png`, `dashboard-320.png`, `dashboard-1440.png`, `meal-390.png` and `weight-320.png`. DOM width measurements stayed within their 320/390/1440 viewport widths; a native scrollbar reduces available content width by 15px where present. Full-page CDP capture timed out; native viewport captures succeeded. These establish isolated responsive layout evidence only.
- Native Chrome Enter testing confirmed that exercise search has no form owner and causes no submission. Other interaction flows were checked with mounted React tests. The focused scope passed 15 files / 117 tests before the final keyboard fix; the subsequent affected three-file run passed 38 tests. The earlier F5 regression run is recorded separately above.
- The follow-up detector ran once over five UI files and returned `[]`. The independent finish reviewer’s final disposition is **SHIP** for its sole listed Enter fix and the isolated layout evidence. This is explicitly not authenticated Patient, full-shell or populated-state visual acceptance.
- Final source verification: whole-repository ESLint with zero warnings passed before the keyboard correction; targeted ESLint then passed for every subsequently changed source/test file. Final `npm run typecheck` passed. PostgreSQL Meal/Exercise/Weight Goal: three files / 85 tests passed, including persisted SELF revocation, concurrency, receipts and commit-then-response-loss replay. The first database attempt stopped in global setup because the restarted disposable instance was empty (no tests executed); `npm run prisma:migrate:test` applied the existing 109 migrations under the normal disposable-database safeguards, then the three-file run passed. No new migration was authored.
- The one broad follow-up run (`npm run test`) completed 541 files / 6,024 tests: 540 files / 6,023 tests passed, one legacy source-copy assertion expected “บันทึกกิจกรรมที่คุณทำจริง” after the picker copy had intentionally changed to “เลือกกิจกรรมที่คุณทำจริง”. The failure was reproduced alone, aligned to the approved selection-first copy, and the full Wellness scope then passed 15 files / 117 tests. Production code is unchanged after the broad run; no second full-suite run was needed for this isolated copy expectation. Existing LINE jsdom navigation diagnostics remained nonfatal. No production build was rerun for this follow-up: no framework, bundler, route convention or environment configuration changed; current components were SSR-rendered and existing CSS utility definitions verified. The prior production-build evidence remains scoped to its earlier commit.
- Authenticated Patient mutations, populated layout in the full app shell, real-device date controls, sleeping-tab/midnight behavior and BFCache UAT remain unverified in a real Patient browser/device session. No login, permissions or identity data were changed to obtain acceptance.

`DESIGN.md`, `PRODUCT.md` and `.impeccable/design.json` remain unchanged. This is an extension of the incumbent visual system, not a new world. The existing sidecar drift concerning mobile drawer / Geist versus current bottom navigation / Noto Sans Thai remains reported, not canonized or repaired. No shipping raster asset was introduced. Phase E remains deferred.
