# Phase 14B.2 — Loading UI System & Route Coverage

สถานะ: ปิดแล้ว

## Problem

route/data loading เดิมใช้ pulse skeleton เฉพาะบาง route และบาง route ใช้ fallback ที่ไม่ใกล้กับ geometry จริง ทำให้เกิด blank state หรือ layout jump ระหว่าง navigation ได้ Phase นี้จึงรวม loading UI เป็น DEMI pattern เดียว โดยไม่เปลี่ยน business flow, authorization, mutation หรือ data model

## Loading UI contract

- **Route/data loading:** ใช้ structural skeleton + shimmer ผ่าน shared primitive/composition เท่านั้น
- **Mutation/action loading:** คง button spinner + pending label + disabled/`aria-busy` ตาม Phase 14B
- route ใหม่ให้ใช้ inherited boundary เมื่อ geometry ใกล้เคียง หรือเพิ่ม `loading.tsx` ระดับ route family ด้วย composition ที่มีอยู่
- ไม่สร้าง skeleton CSS, shimmer keyframe หรือ page-specific skeleton component ซ้ำ

## Shared Skeleton and shimmer

- `src/components/ui/skeleton.tsx` เป็น Server Component-compatible primitive รองรับ `className`, geometry และ `default`/`inverse` surface tone โดยไม่มี client JavaScript
- `src/components/ui/loading-skeletons.tsx` มี `LoadingRegion`, `PageHeaderSkeleton`, `PanelSkeleton`, `FormSkeleton`, `DirectorySkeleton`, `DetailSkeleton` และ `PublicFormSkeleton`
- `app/globals.css` มี muted token-based base และ soft highlight sweep จากซ้ายไปขวา 1.6 วินาทีเพียง implementation เดียว
- `prefers-reduced-motion: reduce` ปิด pseudo-element/animation และคง static placeholder
- shapes ทั้งหมดเป็น `aria-hidden`; route region ใช้ `aria-busy` และมี concise `role="status"` เพียงจุดเดียว

## Route inventory and boundary decisions

| Route family | Async resolution | Loading coverage |
| --- | --- | --- |
| `/app` dashboard | actor และ workspace data | generic protected fallback: page header + multi-panel geometry |
| `/app/patients`, `/app/patients/assigned` | actor, scope, search results | patient directory boundary; assigned directory ตั้งใจ inherit boundary เดียวกัน |
| `/app/patients/[relationshipId]/*` | patient/workflow history/detail | patient detail/workflow boundary ใช้ header + summary/detail panels |
| patient screening, goal, appointment, follow-up creation; appointment reschedule; baseline | server-resolved form context | nested form skeleton เฉพาะ route ที่ layout ต่างจาก detail fallback ชัดเจน |
| patient OSM assignment | patient context, current assignment, candidate search | specialized assignment workspace skeleton |
| patient provisioning | Hospital scopes และ form workspace | form-oriented skeleton |
| patient activation workspace | Hospital scopes และ lookup workspace | Hospital context + lookup/result skeleton |
| `/app/workforce` | actor, Hospital scope, directory | workforce directory skeleton |
| `/app/workforce/[kind]/[relationshipId]` | relationship/governance detail | detail/panel skeleton |
| `/app/admin/hospital-onboarding`, `/app/admin/hospitals` | authorization และ directory data | shared admin directory/table-like skeleton |
| admin onboarding/hospital detail | authorization และ governance detail | nested detail/panel skeleton |
| `/login` | current actor access resolution | public split-form skeleton |
| `/hospital/onboarding` | available Hospital Master resolution | public wide split-form skeleton |
| `/activate/workforce`, `/activate/patient` | dynamic request/route resolution | shared public activation skeleton at `/activate` |

`/app/patients/[relationshipId]` boundary intentionally covers screening/goal/appointment/follow-up history and detail, evidence, and other panel-oriented patient subroutes. `/app/admin/loading.tsx` intentionally covers both admin directories. `/app/loading.tsx` remains the safety net for protected routes whose geometry does not materially justify another boundary. The root `/` page is redirect-only and does not render a user-facing async workspace, so no skeleton was added there.

The protected layout still resolves the authenticated actor before rendering `AppShell`; this existing fail-closed authorization architecture was not moved or weakened. During client navigation, the existing screen remains until the protected layout resolves, while page segments inside the shell use the loading boundaries above.

## Collapsible desktop sidebar

- desktop sidebar รองรับ `expanded` 17rem และ `collapsed` rail 4.5rem; root shell ยังใช้ flex layout เดิม จึงคืนพื้นที่ให้ main content โดยธรรมชาติ
- `AppSidebar` เป็น client boundary ขนาดเล็กเพียงจุดเดียวสำหรับ visual state; `AppShell`, protected layout, navigation projection และ authorization ยังคงเป็น server-owned ตามเดิม
- expanded state แสดง DEMI title, navigation group headings/labels และปุ่ม “ย่อเมนู”; collapsed state ซ่อน navigation ด้วย `aria-hidden` + `inert`, แสดง compact `D` mark และปุ่ม “ขยาย” ที่มี accessible label “ขยายเมนู”
- toggle ใช้ native button, inline SVG, `aria-expanded`, `aria-controls`, Thai action label และ DEMI focus-ring pattern
- preference เก็บใน `localStorage` key `demi:desktop-sidebar`; invalid/unavailable storage เริ่มจาก expanded และ in-memory toggle ยังคงทำงานได้
- `useSyncExternalStore` ใช้ expanded server snapshot เพื่อไม่สร้าง hydration mismatch; transition จะเปิดหลัง preference synchronization เพื่อลด animated expanded → collapsed flash
- width transition 200ms และ navigation opacity 150ms ใช้ `motion-safe`; `prefers-reduced-motion` ปิด transition โดย behavior เหมือนเดิม
- state อยู่ใน persistent `/app` layout boundary และ module-local store จึงไม่ reset ระหว่าง client-side route/loading transitions
- mobile drawer และ `NavigationList` implementation เดิมไม่ถูกแก้ และ desktop state ไม่ควบคุม mobile navigation

focused tests ครอบคลุม default expanded, collapse/expand toggle, Thai labels/ARIA state, stable preference key, invalid/unavailable storage fallback และ reuse navigation authorization tests เดิมเพื่อยืนยันว่า destination projection ไม่เปลี่ยน

## Golden journey re-audit

- Journey A: public Hospital onboarding, Platform Admin review/detail และ Hospital Owner handoff มี public/admin structural coverage
- Journey B: workforce directory/detail, provisioning handoff, public activation และ login มี route-family coverage
- Journey C: patient directory/detail, assignment, screening, goal, appointment, follow-up, baseline, evidence และ histories มี directory/detail/form coverage ตาม geometry
- Journey D: patient activation, login และ patient landing มี activation/login/generic protected coverage
- Journey E: workforce/OSM lifecycle, Hospital lifecycle และ Hospital Owner governance มี workforce/admin detail coverage

ไม่พบ audited golden-journey route ที่ยังเปลี่ยนเป็น blank white loading region; leaf routes ที่ไม่เพิ่ม boundary ใช้ inherited structural fallback ที่ระบุข้างต้น

## Verification

- `npm run lint` — ผ่าน
- `npm run typecheck` — ผ่าน
- focused sidebar/navigation tests — ผ่าน 15 tests ใน 3 test files
- `npm test` — ผ่าน 619 tests ใน 96 test files
- `git diff --check` — ผ่าน
- source audit: ไม่เหลือ `animate-pulse` ใน `app`/`src`; มี `demi-skeleton-shimmer` keyframe เดียว; ไม่มี blank หรือ spinner-only `loading.tsx`
- integration tests ไม่ได้รัน เพราะเปลี่ยนเฉพาะ presentational Server/Client Components, UI-only browser preference, CSS และ route loading boundaries ไม่มี runtime business, database หรือ authorization behavior เปลี่ยน

## Known limitations

- skeleton ตั้งใจประมาณ geometry ระดับ route family ไม่ duplicate ทุก field/row ของ final page จึงอาจมี layout adjustment เล็กน้อยตามข้อมูลจริงและ responsive breakpoint
- route fallback ไม่แสดงข้อมูลจริงหรือ fake personal data และไม่จำลอง mutation progress ภายในหน้า
- direct reload ที่ client JavaScript ช้ามากอาจเห็น expanded server snapshot ชั่วครู่ก่อนใช้ stored collapsed preference; hydration ไม่มี mismatch, initial synchronization ไม่ animate และ client-side navigation ไม่ reset state
- unresolved Phase 14A business/clinical requirements ยังคงไม่เปลี่ยนแปลง

ไม่มี dependency ใหม่, schema migration, business capability หรือ security-policy change ใน Phase นี้
