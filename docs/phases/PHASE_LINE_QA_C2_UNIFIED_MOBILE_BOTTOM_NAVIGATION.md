# Phase LINE-QA.C2 — Unified Mobile Bottom Tab Navigation

## 1. Starting revision and scope

- Repository: `bait0ngxaxa/demi`, branch `main`
- Required starting HEAD: `539022eb751857eaa6d6b427025b0babe8c2e088`
- Scope: one shared mobile navigation system for PATIENT, OSM, HOSPITAL, ADMIN, and supported combinations
- Desktop Sidebar, existing route tree, server authorization, LINE Provider/Rich Menus, and `/line/workflow/...` MINI App remain separate and unchanged in behavior

## 2. Target architecture

The protected server layout continues to resolve canonical `ActorContext` and call `projectApplicationNavigation(actor)`. `AppShell` derives the mobile projection only from that already authorized navigation list. `projectMobileNavigation` owns stable primary order, maximum slot count, workspace availability, and More coverage. `resolveActiveMobileTabId` is a pure route matcher. `MobileBottomNavigation`, `MoreNavigation`, `MobileWorkspaceLabel`, and `MobileNavigationGlyph` are shared presentation components; the existing `NavigationList` renders secondary destinations.

The existing `ApplicationWorkspaceContext` remains `personal | work`. Pathname determines the selected workspace. Users with both contexts switch through the existing “พื้นที่ใช้งาน” links in More; no preference persistence or new role switching endpoint is introduced.

## 3. All-role navigation matrix

The following is an order of preference. A slot appears only when its destination exists in the server-projected navigation. More is always the final slot for an available workspace.

| Role composition | Personal workspace | Work workspace |
| --- | --- | --- |
| PATIENT | Home, Appointments, Wellness, Care, More | — |
| OSM | — | Home, Assigned Patients, Screening, Follow-up, More when an active assignment is projected; otherwise Home, More |
| HOSPITAL | — | Home, authorized Patients, Workforce, Hospital Reports, More, subject to current capabilities |
| ADMIN | — | Home, Admin Hospitals, System Reports, Review, More, each present only when authorized |
| PATIENT + OSM | Patient tabs above | OSM tabs above |
| PATIENT + HOSPITAL | Patient tabs above | Hospital destinations currently authorized to that actor |
| PATIENT + ADMIN | Patient tabs above | Admin destinations currently authorized to that actor |
| OSM + HOSPITAL | — | Deterministic combined Work projection; OSM task priorities take primary slots when assigned; Hospital destinations remain in More |
| OSM + ADMIN | — | Deterministic combined Work projection; OSM task priorities take primary slots when assigned; Admin destinations remain discoverable in More |
| HOSPITAL + ADMIN | — | Deterministic combined Work projection; Admin governance priorities precede remaining Hospital operations |
| PATIENT + OSM + HOSPITAL | Separate Patient and combined Work contexts | OSM task priorities; Hospital destinations remain in More |
| PATIENT + OSM + ADMIN | Separate Patient and combined Work contexts | OSM task priorities; Admin destinations remain in More |
| PATIENT + HOSPITAL + ADMIN | Separate Patient and combined Work contexts | Admin governance priorities; Hospital destinations remain in More |
| OSM + HOSPITAL + ADMIN | — | Combined Work projection; OSM task priorities, then Admin priorities; all other authorized destinations in More |
| PATIENT + OSM + HOSPITAL + ADMIN | Separate Patient and combined Work contexts | Combined Work projection; OSM task priorities, then Admin priorities; all other authorized destinations in More |

Every workspace uses at most four primary destinations plus More. No empty or disabled placeholder slots are created. Actual permissions, active relationships, and hospital status are decided upstream by the existing server projection; role combinations do not grant access.

## 4. Primary and secondary navigation

Primary tabs use the shared icon/short Thai label treatment and stable priority order. The More dialog receives the existing navigation groups and removes links represented by primary tabs while retaining workspace selection. It therefore keeps remaining authorized work, personal, family, account, and support destinations in their original groups without a second route catalog.

## 5. Active route and query behavior

`resolveActiveMobileTabId` uses exact paths or slash-delimited route boundaries. Home is exact. Patient detail, screening, follow-up, and Program follow-up details associate with their unambiguous work tab. The Hospital Patient directory `/app/patients` and its Patient details select Patients when that tab is available. Secondary routes select More.

At `/app/patients/assigned`, exactly one `task=screening` or `task=followup` selects the matching OSM task tab when the server projection includes the assigned-patient destination. Missing, duplicate, or unknown task values fall back to Patients. Other query parameters do not affect authorization. Next pathname/search hooks keep selection current on navigation, history, and direct deep links.

## 6. Existing components reused and obsolete code removed

- Reused `projectApplicationNavigation`, `ApplicationWorkspaceContext`, `NavigationList`, `mobile-navigation-lifecycle`, `AppShell`, `AppSidebar`, and `LogoutButton`.
- Added one mobile tab projection, one pure active-route resolver, shared bottom tabs, shared More dialog, compact workspace label, and inline SVG glyphs using existing styling tokens.
- Removed the hamburger-first `mobile-navigation.tsx` and its role-agnostic drawer test. No role-specific AppShell or route is added.

## 7. Responsive and safe-area behavior

The existing 1024px breakpoint selects desktop Sidebar or mobile tabs. Mobile tabs use a shared 4rem height token plus `safe-area-inset-bottom`; the main content reserves that inset centrally, and horizontal gutters account for left/right safe areas. `viewportFit: cover` is scoped to `/app`, so the Patient Appointment MINI App keeps its own viewport/layout. Desktop content and Sidebar widths remain on the existing responsive rules.

The tabs stay in normal shell presentation while forms scroll. Main content has shared bottom clearance, and existing submit/pending/unknown-outcome controls remain within their routes. No form or domain mutation code is changed. Before a tab or More link navigates, the shell checks only for an existing busy action or active `UnknownOutcomeAlert` recovery guard. It asks before leaving; cancelling keeps the current route and its state. This does not track unsaved drafts or add a general form-navigation framework.

## 8. Accessibility and interaction

The bottom tabs expose a named navigation landmark, `aria-current`, focus-visible styles, pending status, and touch targets of at least 44px. More is a native modal dialog with a named navigation landmark, keyboard focus containment, Escape/backdrop close, body scroll locking, focus restoration on dismissal, focus transfer to Main after route/breakpoint changes, and cleanup on transitions. Reduced-motion styles use existing conventions. Workspace choices are exposed as `aria-current="location"` in More. The navigation warning uses the browser's native confirmation dialog when an action is pending or an existing unknown-outcome recovery is active.

## 9. Regression evidence

Projection tests construct server actor contexts across all 15 non-empty PATIENT/OSM/HOSPITAL/ADMIN role combinations and also cover no/revoked OSM scope, missing/suspended Hospital membership, primary slot limits, deterministic order, and More coverage. Active-route tests cover task queries, details, invalid queries, secondary routes, exact home, Hospital directory, workspace selection, and route-history sequences. Interaction tests cover keyboard operation, dialog focus, Escape/backdrop, body lock, route transitions, desktop breakpoint crossing, and cancel/confirm behavior for pending actions and unknown outcomes. Responsive shell tests retain Sidebar/collapse assertions and check the shared navigation and safe-area contract.

**Focused verification:**

- `npm run test -- src/components/app-shell/mobile-tab-projection.test.ts src/components/app-shell/mobile-navigation-state.test.ts src/components/app-shell/mobile-bottom-navigation.test.tsx src/components/app-shell/responsive-layout.test.tsx src/components/app-shell/mobile-navigation-lifecycle.test.ts src/components/app-shell/navigation-list.test.tsx src/components/app-shell/app-shell-skeleton.test.ts src/components/app-shell/application-navigation.test.ts src/components/ui/mutation-action-state.test.tsx` — **9 files / 98 tests passed**.
- `npm run typecheck` — **passed**.
- `npx eslint` on changed TypeScript/TSX shell/navigation components and tests — **passed with no findings**.
- `impeccable.cmd detect --json` on changed shell/navigation UI targets — **passed; no findings (`[]`)**.
- `npm run build` — **passed**, including TypeScript and generation of 48 static pages.
- `npm run test` — **430 files / 4,472 tests passed**.

No PostgreSQL integration suite was run because C2 does not change authorization policies, data access, or persistence. No migrations or real LINE Provider calls were made.

## 10. Browser and responsive inspection

**Actual browser screenshots:** captured and visually inspected in Chrome using a temporary local preview route. That route passed synthetic actor fixtures through the existing `projectApplicationNavigation` and rendered the real `AppShell`; it was removed after inspection. Captures covered 320, 360, 390, 430, 768, 1024, and 1440 CSS px. PATIENT-only, OSM-only, HOSPITAL-only, ADMIN-only, and combined-role Work views were inspected at 390px; PATIENT Personal was also inspected. The More drawer and its workspace links were inspected at 320px.

Observed: no horizontal tab scrolling or label collision at mobile widths; all five slots fit at 320px; content remains scrollable above the bar; the drawer stays within the viewport; at 1024px and 1440px the desktop Sidebar remains and mobile tabs are absent. Screenshots were inspected in the browser session but were not committed as image files.

Limitation: these were desktop Chrome responsive viewport captures using synthetic navigation projections, not authenticated production sessions or physical iOS/Android devices. Safe-area CSS was inspected and exercised through the responsive layout, but device-specific safe-area, browser chrome, and on-screen keyboard behavior were not verified on hardware.

## 11. Files changed

**Updated:**

- `DESIGN.md`, `docs/CONTEXT.md`, `app/app/layout.tsx`, `app/globals.css`
- `src/components/app-shell/app-shell.tsx`, `app-header.tsx`, `app-shell-skeleton.tsx`, `navigation-list.tsx`, `responsive-layout.test.tsx`
- `src/components/ui/unknown-outcome-alert.tsx`, `mutation-action-state.test.tsx`

**Added:**

- `docs/phases/PHASE_LINE_QA_C2_UNIFIED_MOBILE_BOTTOM_NAVIGATION.md`
- `src/components/app-shell/mobile-tab-projection.ts` and its test
- `src/components/app-shell/mobile-navigation-state.ts` and its test
- `src/components/app-shell/mobile-navigation-guard.ts`
- `src/components/app-shell/mobile-bottom-navigation.tsx` and its test
- `src/components/app-shell/mobile-navigation-glyph.tsx`
- `src/components/app-shell/mobile-workspace-label.tsx`
- `src/components/app-shell/more-navigation.tsx`

**Removed:** `src/components/app-shell/mobile-navigation.tsx` and `mobile-navigation.test.tsx` (the hamburger-first drawer implementation).

## 12. Known limitations

Physical iOS/Android, safe-area hardware behavior, authenticated role sessions, and MINI App/device UAT were not performed. Actual domain forms were reviewed in source but not visually exercised in signed-in sessions. Existing automated tests cover pending/unknown-outcome navigation prompts; there was no real in-flight form mutation in the browser preview. These remain outside the local Chrome responsive inspection. No C2 test, lint, typecheck, detector, or build failure remains.

## 13. Final commit

The final repository SHA is reported in the task handoff. A commit cannot contain its own hash; retrieve the final HEAD with `git rev-parse HEAD`.
