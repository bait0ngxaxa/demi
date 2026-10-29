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
