# Phase 17F.3 — Family Invitation QR Transport Implementation

## Current-status addendum — Phase 17F.4A (2026-10-02)

[17F.4A re-audit](./PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md) records the complete implemented Family source/security review and PostgreSQL regression evidence; [17F.4B manual device UAT sheet](./PHASE_17F4B_FAMILY_DEVICE_UAT_CHECKLIST.md) contains unexecuted evidence fields. **17F.1 IMPLEMENTED / CLOSED; 17F.2 IMPLEMENTED (synthetic/demo only); 17F.3 IMPLEMENTED; 17F.4A automated/security/PostgreSQL re-audit = PASS. P17F-L04 OPEN — AUTOMATED/INTEGRATION RE-AUDIT COMPLETE; REAL-DEVICE UAT PENDING. P17F-L05 OPEN / FUTURE; Q5 real-data delegated use GOVERNANCE BLOCKED; Phase 17F overall NOT CLOSED.** L01/L02/L03/L06 remain CLOSED / OWNER APPROVED. No real-device/browser evidence or controller/privacy approval is supplied by automated tests. Historical phase sections below remain unchanged.

วันที่: 2026-10-02 · Repository: `bait0ngxaxa/demi`

## Baseline / delivery status

Actual starting HEAD: `0f279bee2d4e455ae2ec72f949db1dfa517225f8` — `docs(phase-17f3b): close family invitation QR decisions`; ตรง expected baseline และ working tree สะอาด. อ่าน AGENTS.md, current Family/auth source และ owner-approved [17F.3B contract](./PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md) ก่อนแก้. ไม่มี reset/revert/amend หรือเขียนทับงานใหม่.

Implementation commit คือ commit `feat(phase-17f3): add family invitation QR transport` ที่เพิ่ม handoff นี้พร้อม runtime/tests; resolve immutable SHA ด้วย `git log --diff-filter=A --format=%H -- docs/phases/PHASE_17F3_FAMILY_INVITATION_QR_IMPLEMENTATION.md` (ไม่ฝัง self-referential commit hash ในเนื้อหาที่ใช้คำนวณ hash เอง).

**Phase 17F.3 QR transport IMPLEMENTED; P17F-L03 CLOSED / OWNER APPROVED; Q18–Q29 unchanged. L04 OPEN; L05 OPEN / FUTURE; real-data delegated Patient use GOVERNANCE BLOCKED under Q5.** 17F.0 CLOSED; 17F.1 IMPLEMENTED / CLOSED; 17F.2 family-appointment-read-v1 IMPLEMENTED synthetic/demo only. ไม่ปิด Family overall ไม่รับรอง production readiness, real-device QR UAT หรือ universal mobile compatibility.

## Delivered QR / presentation

[FamilyInvitationQr](../../app/app/family/family-invitation-qr.tsx) เป็น purpose-specific client component ใน [Family creation SUCCESS panel](../../app/app/family/family-management-workspace.tsx). รับ **exact existing invitationLink string** เดียวกับ input/copy button โดยไม่สร้าง URL อีกชุด:

`<current-origin>/app/family/invitations#<43-char-token>`

Existing construction remains `${origin}/app/family/invitations#${encodeURIComponent(state.token)}`. Token alphabet ไม่มีอักขระที่ต้องเปลี่ยนโดย encoding. ไม่มี short URL, wrapper, JSON, signed claim, identifier, Patient/National-ID/HN/caregiver/Hospital/grant/role/capability information ใน QR. Current origin ไม่ enforce HTTPS เอง; L04 ต้องตรวจ deployed approved reachable HTTPS origin.

ใช้ installed qrcode 1.5.4 client-side `toDataURL(invitationLink, options)` ใน effect เท่านั้น; ไม่ generate บน server ไม่ส่งไป remote service ไม่สร้าง endpoint/dependency/lockfile change. Options: M, margin 4 modules, width 240, dark `#000000ff`, light `#ffffffff`. Plain black/opaque white QR รวม quiet zone; ไม่มี overlay/decorative modules. Display square 240px (`w-60`, max-width full) responsive stack mobile / QR beside details ตั้งแต่ sm; narrow containers can shrink without overflow. No Next image optimizer fetch/cache: local transient data URL ใช้ native img. No reliability certification.

Initial loading มีข้อความและ aria-busy; generation failure แสดง `ไม่สามารถสร้างคิวอาร์โค้ดได้ กรุณาใช้ลิงก์คำเชิญแทน` โดยไม่ expose/log exception. URL-bound result ซ่อนภาพเก่าทันทีเมื่อ prop เปลี่ยน แม้ effect ใหม่ยังไม่ทำงาน; cleanup ทำให้ stale/unmounted promise ทั้ง success/failure ไม่อัปเดต state. ไม่มี retry/network/extra server mutation. Alt `คิวอาร์โค้ดคำเชิญผู้ดูแล DEMI` ไม่มี secret/PII.

QR อยู่เฉพาะ issuance SUCCESS state ที่มี plaintext link. Fresh reload/new state/normal unmount ไม่ recover token/QR จาก management/database; ไม่ใช้ localStorage/sessionStorage/IndexedDB/cookie/service worker/storage. In-memory data URL ไม่ persisted. Browser back/BFCache/retained memory เป็น L04 ไม่รับรองการ recall ภาพหรือ memory ทุก browser. ไม่มี show-QR-again. Lost/exposed PENDING invitation ใช้ existing revoke แล้ว issue NEW secret/hash/DB-clock issuance/24h lifecycle.

Existing copy link ยังใช้งานได้ทั้ง loading และ QR failure; input read-only, selectable, expiry เดิม visible, keyboard button ใช้ shared default min-h-12 (48px). QR ไม่แทน text link. ไม่มี download/print/PDF/Web Share/OS share/sending integration. Warning:

> QR และลิงก์นี้ใช้สำหรับผู้รับที่ตั้งใจเชื่อมเท่านั้น
> ผู้ที่ได้รับภาพ QR หรือลิงก์สามารถเปิดหน้าคำเชิญได้
> แต่ต้องเข้าสู่ระบบด้วยบัญชีผู้รับที่ระบุไว้จึงจะตอบรับได้

ไม่อ้าง screenshot prevention/encryption/identity proof หรือ confidentiality หลังแชร์.

## Privacy-hardening / authentication

[Preview action](../../src/modules/family/transport/server-actions.ts) เปลี่ยนเฉพาะ FORBIDDEN preview mapping ให้เหมือน malformed/NOT_FOUND: `INVALID` + `ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน`. ลบ public NOT_RECIPIENT union/branch; ไม่แค่เปลี่ยน heading. Internal service errors ยังแยกได้. Infrastructure ERROR ยังคง safe generic failure; legitimate reachable unauthenticated path ยังคง NEEDS_LOGIN. ไม่มี Patient display name ใน failure/login results. ไม่เปลี่ยน mutation response semantics หรือ server authorization.

[Preview UI](../../app/app/family/invitations/family-invitation-preview.tsx) ใช้ unavailable เดียวกัน; malformed fragment ไม่แสดง loading ค้างพร้อม unavailable อีกต่อไป. Exact intended ACTIVE User/Person ยังได้ bounded name/status/expiry/family-delegation-v1 preview รวม terminal status ตาม contract เดิม. No anonymous Patient preview. Explicit accept/reject forms เดิม; rendering/preview/QR ไม่เรียก mutation.

## Unchanged security / lifecycle / data boundary

Token service/schema/relationship service/policies ไม่ถูกแก้: randomBytes(32), 256 bits, base64url 43-char, SHA-256 persisted only, issuance-only plaintext, DB clock + INTERVAL 24 hours unchanged. Mutation ยัง conditional PENDING/unexpired/exact caregiverUserId+caregiverPersonId; ACTIVE current account checked; explicit acceptance + Serializable transaction creates exact ACTIVE relationship. Reject/Patient pending revoke/expiry/accept remain terminal. Physical old QR image cannot reactivate terminal invitation; intended recipient may still view bounded terminal status.

family-delegation-v1 acceptance = relationship only, ZERO incremental Patient-resource authority. No CaregiverAppointmentGrant proposal/create/accept, PHR scope, appointment read or deployment-gate enablement. Existing separate family-appointment-read-v1 flow/eligibility/default-disabled server gate/Q5 remain unchanged. No CAREGIVER role, Patient impersonation, role/capability/SELF/OSM/Hospital/ADMIN change.

QR/link/token remains security-sensitive invitation credential / bearer locator, not authority/public identifier. No intentional logging/error-object/analytics/audit secret, no token/PII in alt. Fragment absent normal HTTP request target/Referer is not complete secrecy: DOM/client/action bodies/hidden login returnTo/clipboard/scanners/extensions/screenshots/history remain exposure surfaces. Existing no-referrer/noindex/nofollow retained; first hydration strictly validates and strips fragment with replaceState. No query/path/cookie token or server-rendered token/static QR cache.

No durable render/scan/page/preview-view audit or tracking table. Existing invitation created/accepted/rejected/revoked/expired and relationship activated audits remain unchanged; expiry reconciliation is lifecycle audit, not scan tracking.

## Login / fragment findings — no containment correction made

อ่าน installed Next.js 16.3.0 guides `01-app/03-api-reference/04-functions/redirect.md` และ `01-app/01-getting-started/05-server-and-client-components.md`. Redirect can be HTTP 307, streaming meta redirect or client navigation; source unit tests cannot certify browser fragment inheritance across these paths.

Protected /app layout redirects anonymous/denied request to /login before invitation child hydration; server cannot read initial fragment. Authorized /login request redirects /app before login client strips fragment. Focused page test proves that server destination only. Browser may inherit fragment; no deterministic real-browser disclosure reproduced in this task, so **ไม่มี login/protected-layout runtime change หรือ narrow containment correction**. ไม่ invent redirect architecture หรือ loosen returnTo. Login form retains strict Family fragment destination in mounted memory/hidden form and strips login fragment; action revalidates exact route, otherwise /app. Refresh after strip can lose memory; original valid shared QR/link can be reopened.

Existing caveat remains containment/continuity, not authority bypass. Do not claim QR rendering solves it. L04 must verify anonymous scan/login return, already-authorized /login#token, wrong account, actual redirect target/hash, reload/back/BFCache and LINE/Facebook/iOS/Android cookies/navigation. If real evidence requires architecture beyond approved narrow containment correction, STOP/report requirement gap.

## Tests / verification actually executed

Node/SSR test environment has no DOM renderer or QR decoder. Component tests drive mocked hooks/effects and qrcode boundary explicitly; prove exact generator input/options, loading/success/error/safe alt, stale URL hiding, discarded stale/unmounted result. Parent SUCCESS tests prove identical copy value/callback, warning/expiry, failure fallback, new token/fresh IDLE/ERROR behavior. These are deterministic source/component-boundary checks, not camera/real-device navigation or decoded screenshot evidence.

Preview action/UI tests prove identical malformed/unknown/wrong-recipient unavailable output, no Patient preview on failure/login, READY bounded success/terminal preview and no render/preview mutation. Login schema tests cover exact fragment route and reject unrelated/query/path/absolute/malformed/extra token destinations; existing action tests already prove validated returnTo and /app fallback. Added authorized login page server-redirect test.

Small actual relationship-service test with mocked transaction proves intended User AND Person binding, non-PATIENT caregiver acceptance, terminal replay/expiry denial, relationship-only create, no appointment grant write/read and lifecycle audits only. Existing PostgreSQL foundation tests for DB-clock 24h, revoke/reject/concurrency/transactional activation were source-reviewed; not rerun because service/schema unchanged. Mock database expiry case verifies handling of DB conditional-write failure, not live PostgreSQL clock/constraints.

Executed:

- Initial QR/Family/action/login focused run: 6 files / 50 tests passed.
- Expanded `npm run test -- src/modules/family app/app/family src/modules/auth/schemas/login-schema.test.ts src/modules/auth/transport/server-actions.test.ts app/login/login-page.test.tsx`: 15 files / 91 tests passed.
- Added preview client focused run: 1 file / 10 tests passed.
- `npm run lint -- --max-warnings=0`: passed, zero warnings/errors. No lint:strict script exists.
- `npm run typecheck`: passed.
- No architecture:check script exists; focused source import/security review passed: client QR imports no DB/service/audit/auth mutation; unchanged service/policy boundaries.
- Impeccable context + harden/craft-floor guidance applied; detector once on changed UI: one advisory for literal black outside DESIGN palette. Deliberately retained owner-required black/white QR configuration; not a UI palette redesign. No other finding. No screenshots/computed visual/browser UAT performed.
- Complete runtime/test diff reviewed before broad checks.
- One final `npm run test`: **180 files / 1,285 tests passed**.
- One final `npm run build`: **passed**, Next.js 16.3.0; /app/family and /app/family/invitations remain dynamic on-demand routes; no new route.
- Final strict UTF-8/Thai/no replacement characters, Markdown local targets, intended-file manifest, git diff --check and staged diff checks recorded through Git delivery verification.

No PostgreSQL integration, Prisma validate/generate/migrate or dev server run. After full suite/build, only documentation changed; no redundant broad rerun.

## Exact changed-file manifest

Runtime:

- [family-invitation-qr.tsx](../../app/app/family/family-invitation-qr.tsx) — new local transient presentation component.
- [family-management-workspace.tsx](../../app/app/family/family-management-workspace.tsx) — SUCCESS QR/link/expiry/warning layout.
- [family-invitation-preview.tsx](../../app/app/family/invitations/family-invitation-preview.tsx) — generic unavailable / malformed-loading presentation.
- [action-state.ts](../../src/modules/family/transport/action-state.ts) — removes public NOT_RECIPIENT.
- [server-actions.ts](../../src/modules/family/transport/server-actions.ts) — preview mapping only.

Tests:

- [family-invitation-qr.test.tsx](../../app/app/family/family-invitation-qr.test.tsx)
- [family-invitation-success.test.tsx](../../app/app/family/family-invitation-success.test.tsx)
- [family-invitation-preview.test.tsx](../../app/app/family/invitations/family-invitation-preview.test.tsx)
- [caregiver-relationship-qr-boundary.test.ts](../../src/modules/family/services/caregiver-relationship-qr-boundary.test.ts)
- [Family server-actions.test.ts](../../src/modules/family/transport/server-actions.test.ts)
- [login-schema.test.ts](../../src/modules/auth/schemas/login-schema.test.ts)
- [login-page.test.tsx](../../app/login/login-page.test.tsx)

Documentation:

- This implementation handoff.
- [CONTEXT.md](../CONTEXT.md)
- [PHASE_17_UAT_BACKLOG.md](./PHASE_17_UAT_BACKLOG.md)
- [PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md](./PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md)
- [PHASE_17F3_FAMILY_INVITATION_QR_DECISION_PACK.md](./PHASE_17F3_FAMILY_INVITATION_QR_DECISION_PACK.md)

## Final re-audit / architecture / remaining gates

Source/diff confirms exact URL only, client/transient/no backend/storage/logging/scan audit/new secret/TTL/JSON/PII/grant/auto-accept; exact current intended User/Person still authoritative. No schema/migration/model/enum/dependency/lockfile/generator change. No ADR required: no identity/role/capability/authorization/token lifecycle/persistence/Patient-data scope/native architecture change. No new authority or LIFF/native integration approved.

**L04 OPEN** owns real browser/device implementation re-audit: iOS/Android camera/browser, LINE/Facebook in-app browser, anonymous/authenticated/wrong-account/multi-role/non-PATIENT flows, revoke/reject/expiry/replay, back/reload/BFCache, fragment strip/redirect targets, deployed HTTPS origin, effective QR size/quiet zone/contrast/brightness, copy/screenshot warning, failure fallback and keyboard/screen-reader behavior. No universal compatibility or screenshot/scanner privacy guarantee.

**L05 OPEN / FUTURE** for expiry/renewal expansion. **Q5 real-data delegated use GOVERNANCE BLOCKED** unchanged; synthetic/demo implementation does not approve real Patient data. Family overall remains open, no production-ready claim.
