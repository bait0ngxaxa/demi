# UX-08 — Global Navigation, Responsive Layout & Visual Consistency

วันที่: 2026-10-13 (Asia/Bangkok)

Base / reviewed HEAD: `60058d51ff30fb6244f5bc036f41f6f3250eb517`, branch `main`. Actual HEAD และ remote main ตรง baseline; working tree สะอาดก่อนเริ่ม. ไม่มี unrelated work ที่แก้หรือ stage.

Final commit: commit ที่เพิ่ม handoff นี้พร้อม source/tests. Resolve SHA ด้วย `git log -1 --format=%H -- docs/phases/UX_08_GLOBAL_NAV_RESPONSIVE_POLISH_HANDOFF.md`; delivery report ระบุ full SHA หลัง commit/push. ไม่ฝัง self-referential commit hash ใน commit เดียวกัน.

Disposition: UX-08 IMPLEMENTED พร้อม automated verification และ bounded Chromium presentation inspection. Authenticated workflow/mobile UAT ยังไม่ครบ; ไม่อ้าง clinical acceptance, production readiness หรือ complete Workbook DoD. ไม่เริ่ม UX-09.

## 1. Context และ verified problems

อ่าน project AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, relevant architecture/current-scope sections ของ docs/CONTEXT.md, UX-01–07 handoffs, AppShell/navigation/persistence/lifecycle/loading source และ tests. ใช้ Impeccable context, Operate, adapt, craft floor และ polish guidance; ตรวจ React best-practices checklist. ตรวจ local Next.js 16.3 Link `onNavigate` / usePathname docs และ [native dialog semantics](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

Verified structural findings:

- Shell เป็น flex กับ `min-w-0 flex-1` อยู่แล้ว ไม่มี stale left margin หรือ reserved blank column ที่ต้องแก้. Sidebar 17rem/4.5rem ปรับ Main จริง.
- Work Home และ Patient Detail จำกัด `max-w-4xl` (56rem) ทางซ้าย. เมื่อ available width เกิน cap การยุบ Sidebar เพิ่ม Main แต่ไม่ได้เพิ่มเนื้อหา. Assigned Directory ใช้ cap เดียวกัน. Workforce ไม่มี cap แต่แตกสองคอลัมน์ตาม viewport `xl` โดยไม่คำนึงถึง Sidebar.
- Main gutters เดิม 20/32/40px ไม่ตรง Header 16/24/32px.
- Directory filter, Workforce และ reporting grids อิง viewport; expanded Sidebar บน desktop ขนาดกลางจึงมีพื้นที่น้อยกว่าที่ breakpoint สื่อ.
- Patient Detail loading ใช้ max-w-6xl แต่หน้าใช้งานจริง max-w-4xl. Reporting loading ใช้ max-w-6xl แต่ workspace 1440px.
- Mobile drawer เดิมมี custom Tab trap / aria-modal / scroll lock แต่ไม่มี native modal หรือ background inert. ปิดผ่าน link click รวม modified clicks และคืน focus ไป menu trigger เมื่อเลือก destination.
- Multi-role workspace selector ใช้ aria-current=page เช่นเดียวกับ destination ทำให้พื้นที่กับหน้าปัจจุบันไม่แยก semantic.
- Shared header/actions/breadcrumbs และ native inputs/selects ต้องมี explicit shrink/wrap constraints; breadcrumb links เดิมไม่มี 44px target. Native anchors ต้องเผื่อ sticky header.

## 2. Before / after width strategy

| Surface | ก่อน | หลัง |
| --- | --- | --- |
| Shell | flexible Main + ต่าง gutters จาก Header | Main named workspace container; gutters 16/24/32px ตรง Header; ไม่มี fixed Sidebar offset |
| Work Home | 56rem / Hospital cards ต่อกัน | opt-in `content-workspace`: full width, centered cap 90rem; auto-fit cards min 28rem, mobile min 100%, card เดียวเต็มแถว |
| Hospital / assigned directories | unconstrained / 56rem; viewport-based filters | workspace width เดียวกัน; filters แตกหลายคอลัมน์เมื่อพื้นที่ Main อย่างน้อย 64rem |
| Patient Detail | 56rem single column | centered `content-detail` cap 72rem; context/care 0.85:1.15 columns เมื่อ Main อย่างน้อย 64rem; supporting/history เต็มแถว; DOM order เดิม |
| Workforce | viewport xl แบ่ง roster/forms | workspace cap 90rem; สองคอลัมน์ที่ available Main 64rem; roster ก่อน forms เดิม |
| Direct OWNER / global ADMIN / Parent–Child reporting | 1440px left-aligned; viewport-based sections | centered workspace cap 90rem; source-backed summary and Program sections อิงพื้นที่ Main; fields/calculation/export ไม่เปลี่ยน |
| Contact / Content / Personal / appointment / Program / Follow-up reading forms | local max-w-3xl/4xl/5xl ตามชนิดงาน | รักษา local reading measures; ได้ shared Header, control wrapping, gutters และ scroll offset โดยไม่ stretch prose/forms |
| Loading | บาง route width ไม่ตรง destination | width policy ตรง Home/Directory/Workforce/Patient Detail/reporting; Patient Detail skeleton มี context/care + full-row history structure |

CSS width policies เป็น opt-in classes กับ tokens `--content-workspace-width` / `--content-detail-width`; ไม่ override max-width utilities ทั้งระบบ. ใช้ Tailwind named container queries ที่ stack เดิมรองรับและตรวจผ่าน compiled CSS ใน harness จริง. `type-readable` 68ch, Panel, Button, Input, Select, PageHeader, StatusBadge และ LoadingRegion เดิมยังเป็น primitives หลัก. ไม่เพิ่ม dependency, shell, domain component หรือ dashboard metrics.

## 3. Sidebar / navigation / accessibility

- เก็บ useSyncExternalStore, stable localStorage key `demi:desktop-sidebar`, safe parse/read/write fallback, storage event subscription, SSR expanded default, first-frame transition gate, 17rem/4.5rem และ reduced-motion classes เดิม.
- Expanded navigation ยังคง aria-hidden/inert/pointer-events-none ตอน collapsed; restore toggle อยู่นอก hidden nav และมี Thai action label/aria-expanded/aria-controls เดิม.
- Native modal dialog ทำให้ background inert ใน browser top layer. มี close button 44px, Escape, outside-panel dismissal, initial close-button focus, Tab/Shift+Tab containment, scroll lock และ cleanup. Drawer nav ใช้ min-h-0 / overflow-y-auto / overscroll-contain สำหรับแนว landscape และเมนูยาว.
- Normal close คืน focus ไป trigger. Client navigation และ desktop media transition ปิด drawer แล้ว focus Main โดย preventScroll; Next.js destination focus/scroll behavior ยังเป็นของ router. เปลี่ยน callback เป็น Link onNavigate ทำให้ modified/new-tab clicks ไม่ปิด drawer อย่างผิดบริบท.
- Workspace selector ใช้ aria-current=location; active destination ใช้ page. Work/Personal filtering, active segment matching และทุก capability-scoped navigation group/destination เหมือนเดิม. ไม่เพิ่ม role หรือ route และไม่เดาว่า exact Patient route มาจาก directory หรือ assigned entry; ใช้ exact breadcrumbs ที่มีอยู่.
- Shared breadcrumbs wrap และมี min-height 44px. Page header ใช้ wrapping flex composition; inputs/selects มี min-w-0/max-w-full; buttons wrap label โดยไม่ลด font size. Main มีหนึ่ง landmark/focus target และ skip link เดิม; skip motion และ spinner เคารพ reduced-motion.
- Global scroll-padding-top ใช้ header token + 1.5rem สำหรับ anchor/focus targets. Existing scroll-mt/local anchors และ return URL resolution ไม่เปลี่ยน.

## 4. Journey / capability boundaries

ตรวจ existing Work → Hospital → Patient R → Program P → Follow-up / Patient / Hospital, assigned OSM R, Personal Hospital/appointment history และ OWNER Workforce/Contact/Content/report returns. คง UX-01–07 breadcrumbs และ exact server-resolved H/R/P/A/Parent context. Actor-wide Access/Service request queues ยัง actor-wide; ไม่เติม unsupported Hospital filter. ไม่รับ arbitrary return URL.

Patient SELF ไม่เพิ่ม Work authority; direct OWNER/MEMBER, exact OSM assignment, independently scoped multi-role และ ADMIN governance ยังคง policies เดิม. ADMIN reporting ยัง selected-Hospital; Parent reporting ยัง exact eligible direct Child summary ไม่เพิ่ม Patient identifiers/clinical details/Program links/export. UI navigation ไม่เป็น authorization; protected layout, pages, services/actions ตรวจ server authority ตามเดิม.

ไม่มี schema/migration/authentication/authorization/query/mutation/business transition/clinical calculation/appointment lifecycle/request linkage/assignment acceptance/family disclosure/LINE consent or notification changes. ไม่ปิด pending Owner decisions. Existing scalability debt จาก UX-07 (unpaginated Workforce / Access Requests) และ bounded Work appointment history จาก UX-06 ยังคง separate follow-up ไม่แก้ใน UX-08.

## 5. Changed files

```text
DESIGN.md
app/app/hospitals/reporting/hospital-report-workspace.tsx
app/app/hospitals/reporting/loading.tsx
app/app/hospitals/reporting/parent-child-hospital-report-workspace.tsx
app/app/loading.tsx
app/app/page.tsx
app/app/patients/[relationshipId]/loading.tsx
app/app/patients/[relationshipId]/page.tsx
app/app/patients/assigned/assigned-patient-directory-view.tsx
app/app/patients/loading.tsx
app/app/patients/patient-directory-view.tsx
app/app/workforce/loading.tsx
app/app/workforce/workforce-workspace.tsx
app/globals.css
src/components/app-shell/app-shell-skeleton.tsx
src/components/app-shell/app-shell.tsx
src/components/app-shell/mobile-navigation-lifecycle.test.ts
src/components/app-shell/mobile-navigation-lifecycle.ts
src/components/app-shell/mobile-navigation.tsx
src/components/app-shell/navigation-list.test.tsx
src/components/app-shell/navigation-list.tsx
src/components/app-shell/navigation-state.test.ts
src/components/ui/button.tsx
src/components/ui/input.tsx
src/components/ui/loading-skeletons.tsx
src/components/ui/page-header.tsx
src/components/ui/select.tsx
src/components/app-shell/responsive-layout.test.tsx
docs/phases/UX_08_GLOBAL_NAV_RESPONSIVE_POLISH_HANDOFF.md
```

## 6. Actual automated validation

- Initial lifecycle/navigation/persistence focused run: 4 files / 13 tests PASS.
- Core Shell/Home/Workforce/reporting/Patient return regression: 11 files / 116 tests PASS.
- Stable shared UI/navigation regression: 18 files / 155 tests PASS (`npm run test -- src/components/app-shell src/components/ui` + Home, Workforce, Hospital operations, Service request workspace, Contact, Content, direct/Child report and Patient detail test paths). Some supplied CLI filters did not correspond to files; only the 18 matched files are claimed. Full-suite result below covers the remaining preserved UX suites.
- `npm run lint -- --max-warnings=0`: PASS, repository-wide zero warnings. `lint:strict` and `architecture:check` scripts do not exist; inspected module boundaries manually. New code stays in UI and imports no persistence layer.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS before delivery; final staged check also required.
- Full suite npm run test: **313 files / 2,734 tests PASS**, 63.87s. Run once after source/test diff review and stable focused/lint/typecheck results because shared primitives have application-wide presentation impact.
- No production build, Next dev server, database integration, migration, deployment or provider operation. Browser geometry required an isolated Vite presentation harness only; no application authentication bypass or demo runtime path was added.

## 7. Actual browser evidence — bounded presentation harness

Chrome extension browser was available; no authenticated DEMI session existed. Served temporary loopback harness at 127.0.0.1:4178 from ignored node_modules/.cache, using actual AppShell/AppSidebar/MobileNavigation, shared primitives, actual Hospital/Assigned Directory views, Workforce workspace (empty roster + real forms), Hospital reporting workspace (empty Programs + synthetic zero counts), and Personal Home (unbound warning state). Work Home composition uses actual shared primitives and matching grid, not the authenticated async Home loader. Next Link/router and logout/server-action boundaries were harness-only substitutes; mutations disabled. No real Patient data or credentials.

| CSS viewport width | Expanded inspection | Collapsed inspection | Result |
| --- | --- | --- | --- |
| 320px | mobile | mobile | no document horizontal overflow; Thai headings/controls wrap |
| 375px | mobile | mobile | no document horizontal overflow |
| 768px | mobile | mobile | no document horizontal overflow |
| 1024px | desktop | desktop | no document horizontal overflow; filters remain one column until Main fits |
| 1280px | desktop | desktop | no document horizontal overflow; container-dependent reflow |
| 1440px | desktop | desktop | no document horizontal overflow; Sidebar/Main align |
| 1920px | desktop | desktop | no document horizontal overflow; centered workspace cap 1440px |

First batched inspection covered 6 surfaces × 7 widths expanded; final geometry pass covered the same 42 combinations with persisted collapsed preference. Reported scroll widths exclude the vertical scrollbar where present; horizontal overflow check compares document scrollWidth/clientWidth. Screenshots inspected desktop 1440px and mobile 320px Workforce, plus desktop directory and Home composition. No populated roster/report rows or real Patient Detail geometry was inspected.

At 1440px with the vertical scrollbar present, settled Directory geometry:

- Expanded: Sidebar 272px, Main 1152.8px, content 1088.8px.
- Collapsed: Sidebar 72px, Main 1352.8px, content 1288.8px — full 200px gained. Header and Main left edge both 72px; hidden desktop nav inert=true.
- Reload retained collapsed/72px. Final Home single-card composition: content/card both 1304px (no vertical scrollbar), so one Hospital does not leave an empty grid track.

Interaction evidence: initial drawer focus on close; Shift+Tab close → last navigation item; Tab last item → close; Escape removes dialog, releases body overflow, restores trigger. Selecting Directory closes drawer and focuses Main. Switching 375 → 1024 while open closes dialog, releases scroll lock and focuses Main. Native :modal confirmed. Keyboard checks use synthesized keyboard events in Chrome, not physical mobile-device/screen-reader testing.

200% browser zoom shortcut was attempted, but viewport override continued to report CSS width 1440 and DPR ~1; no trustworthy zoom-level evidence, so 200% UAT is NOT claimed. Browser zoom/viewport restored. Browser reduced-motion was false; reduced-motion rules verified in source/CSS/tests only, not under a live changed preference. Local-storage denied/corrupt fallback is unit-tested, not live browser fault-injected. SSR/hydration timing was not measurable in this client presentation harness: SSR defaults expanded and safely reads persisted preference on hydration; no zero-flicker claim.

## 8. Remaining UAT / next phase

With authorized non-production accounts/data, verify authenticated OWNER A/MEMBER B, OSM exact assignments, Patient SELF, ADMIN and independently scoped multi-role across the same viewport matrix. Include real populated Patient Detail/Program/Follow-up, appointment history/forms, roster and activation feedback, Contact/Content, Parent/Child and ADMIN report views/export. Test long Thai Patient/Hospital names, loading/error/success/conflict, keyboard focus after actual Next navigation/Browser Back, drawer outside dismissal/orientation, physical iOS/Android, screen readers, 200% zoom, live reduced-motion and slow SSR hydration with persisted collapsed preference.

No new business-flow defect was changed. Existing pending requirements, Owner/privacy/clinical decisions and scaling debt remain separate. Recommended next phase: **UX-09 Integrated UAT & Regression Closure**, only after UX-08 review/authorization. Stop at UX-08; UX-09 has not started.
