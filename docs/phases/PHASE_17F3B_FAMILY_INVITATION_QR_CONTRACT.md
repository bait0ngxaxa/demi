# Phase 17F.3B — Family Invitation QR Transport Contract

วันที่: 2026-10-02 · Repository: `bait0ngxaxa/demi`

**Current implementation status — Phase 17F.3 QR transport IMPLEMENTED** ตาม [implementation handoff](./PHASE_17F3_FAMILY_INVITATION_QR_IMPLEMENTATION.md). P17F-L03 CLOSED / OWNER APPROVED; Q18–Q29 unchanged. L04 OPEN; L05 OPEN / FUTURE; Q5 real-data delegated use GOVERNANCE BLOCKED. ไม่มี schema/migration/new authority/native integration. Contract/planning และ source-review evidence ด้านล่างเก็บเป็นประวัติ ณ baseline เดิม; current delivery evidence อยู่ใน handoff. QR UAT ยังไม่ผ่านการตรวจบนอุปกรณ์จริง.

## 1. Baseline / status / approval provenance

Actual starting HEAD: `2c178e0446495af537e6deed1a3ee80c6c9be1c2` — `docs(phase-17f3a): add family invitation QR decision pack`; ตรง expected baseline, working tree สะอาด. อ่าน AGENTS.md ก่อนแก้; ไม่มี reset/revert/amend หรือเขียนทับงานใหม่. งานนี้ DOCUMENTATION + OWNER-DECISION CLOSEOUT + IMPLEMENTATION CONTRACT PREPARATION เท่านั้น.

Owner approval คือคำสั่ง Phase 17F.3B ที่ระบุ Q18–Q29 ชัดเจน ไม่ใช่การอนุมานจากคำแนะนำ. **P17F-L03 CLOSED / OWNER APPROVED; 17F.3 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED** สำหรับ bounded transport slice นี้เท่านั้น. 17F.0 CLOSED; 17F.1 IMPLEMENTED / CLOSED; 17F.2 IMPLEMENTED synthetic/demo only; L01/L02/L06 CLOSED / OWNER APPROVED. **L04 OPEN; L05 OPEN / FUTURE; real Patient-data delegated use GOVERNANCE BLOCKED under Q5**. ไม่ปิด Family overall ไม่รับรอง production readiness หรือ QR UAT.

Sources: [17F.3A evidence/history](./PHASE_17F3_FAMILY_INVITATION_QR_DECISION_PACK.md), [17F.0](./PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md), [17F.1](./PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md), [17F.2B](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md), [17F.2 handoff](./PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md), [Context](../CONTEXT.md), [Backlog](./PHASE_17_UAT_BACKLOG.md). Source recheck at starting HEAD: [token service](../../src/modules/family/services/caregiver-invitation-token-service.ts), [relationship service](../../src/modules/family/services/caregiver-relationship-service.ts), [preview actions](../../src/modules/family/transport/server-actions.ts), [login schema](../../src/modules/auth/schemas/login-schema.ts), [login form](../../app/login/login-form.tsx), [invitation page](../../app/app/family/invitations/page.tsx). Existing QR/package evidence remains in 17F.3A; no dependency change approved.

## 2. Owner-approved decisions Q18–Q29

Every row: **A — CLOSED / OWNER APPROVED**. No B/C/Other alternative approved.

| Decision | Exact bounded approval |
| --- | --- |
| Q18 | Exact existing HTTPS invitation URL + fragment token; no new payload/token, shortener or redirect wrapper. |
| Q19 | Transport only; possession/scan grants ZERO authority; exact ACTIVE recipient + explicit acceptance + successful transaction required. |
| Q20 | Same invitation 24h/terminal lifecycle, no QR TTL or lifetime reset. |
| Q21 | Client generation with installed qrcode from already-returned URL; no remote service/backend/storage. |
| Q22 | Same one-time creation SUCCESS state only; no later recovery/redisplay/persistence. |
| Q23 | On-screen QR + existing copy link only; no download/generated print/PDF/Web Share/sending integration. |
| Q24 | Existing URL fragment + strict validation + immediate first-client-hydration strip; no query/path/cookie/storage payload. |
| Q25 | No Patient identity before authentication + exact recipient match; existing bounded preview only. |
| Q26 | Standard HTTPS/browser and existing bounded Family login return only; no LIFF/native/custom/app links. |
| Q27 | CaregiverInvitation / family-delegation-v1 only; ZERO incremental Patient-resource rights, no data grant. |
| Q28 | Lost/exposed PENDING invitation: Patient revokes old and creates new invitation/secret/hash/issuance/24h TTL. |
| Q29 | No durable QR render/scan/page/preview view business AuditEvent or tracking table. |

L03 closes final secure-link wrapping, QR presentation/leakage/preview and mobile transport decisions only. It does not mean runtime delivery, device compatibility, anonymous disclosure, scan tracking, native integration or real-data governance approval.

## 3. Payload / token / lifecycle invariants

Encode the **exact existing invitationLink string**, identical to copy-link value:

`https://<approved-origin>/app/family/invitations#<43-char-plaintext-token>`

Current source constructs current-origin links; it does not enforce HTTPS/public hostname. L04 must verify approved reachable deployed HTTPS origin. Do not introduce a shortener, redirect wrapper, JSON, signed authorization claim, token encryption/wrapping, QR-specific token or metadata. QR MUST NOT contain National ID, identityKeyHash, invitation DB id, Patient id/name, caregiver User/Person id/name, Hospital information, PatientHospitalRelationship, appointment grant, capability, role, relationship state or Patient-resource data.

Preserve `randomBytes(32)`, 256-bit secret, base64url 43-char schema, SHA-256/hash-at-rest, plaintext issuance-only return, DB-clock 24 hours and existing terminal lifecycle. QR render/scan/login never reset/extend/start TTL. No qrIssuedAt/qrExpiresAt/cleanup lifecycle or reusable post-accept QR. ACCEPTED/REJECTED/REVOKED/EXPIRED cannot return to PENDING or activate again. **Image existence != valid invitation authority**. Existing exact-recipient bounded terminal preview remains unchanged; terminal denial concerns actionable transitions, not a new blanket preview denial.

## 4. Authority / preview boundary

Patient SELF creates the existing purpose-specific invitation; National ID remains server-only locator for an existing ACTIVE User + Person, never proof. Self-delegation remains denied. Relationship activation requires valid PENDING unexpired invitation, authenticated ACTIVE account, exact caregiverUserId and caregiverPersonId, bounded preview, explicit caregiver acceptance and successful server transaction. Scan/open/authentication/preview never accept automatically. Forwarding cannot transfer recipient identity. Recipient need not be PATIENT; multi-role accounts retain independent authority without Patient impersonation or a CAREGIVER role.

Before authenticated exact match, show generic login/unavailable state only. After match, preserve only Patient display name, lifecycle state, expiry and acceptance explanation/version. No National ID/HN/contact information/Hospital history/grants/appointments/clinical or other Patient resources. Current UI previews before acceptance; service has no persisted preview-receipt proof. Do not invent one or weaken server checks.

QR transports only family-delegation-v1. Acceptance creates ACTIVE Family relationship and **ZERO incremental Patient-resource authority**. Appointment reads remain separate: ACTIVE relationship + Patient proposes exact family-appointment-read-v1/one selected PHR + caregiver explicitly accepts that separate grant + current eligibility/independent server feature gate. No QR proposal/acceptance/scope/grant creation or appointment read. Q5 is unchanged.

## 5. Exact presentation / generation flow

Patient creates existing CaregiverInvitation → issuance returns one-time plaintext URL → SUCCESS panel shows local QR generated from exact same URL, existing copy link, expiry and warning → Patient manually shares either.

Recipient scans/opens same URL → fragment validation/strip on supported flow → authentication if necessary → exact intended User/Person server verification → bounded preview → explicit accept/reject → unchanged 17F.1 lifecycle. No new routes or automatic acceptance.

Use installed `qrcode` client-side. No QR endpoint/remote service/upload/cache/persisted artifact. In-memory image/data URL is sensitive transient presentation state, not permission. Bind async generation result to the current URL and discard stale results. QR exists only while the same creation SUCCESS plaintext state is available. After reload/navigation/state loss, no reconstruction or later management projection. No plaintext DB/localStorage/sessionStorage persistence, tokenHash recovery, persisted QR/data URL or management-query plaintext return. Back/BFCache retained-state behavior needs L04 verification; do not claim it already meets navigation removal requirements.

Lost/exposed PENDING QR/link → revoke existing invitation + create NEW secret/hash/issuance/24h lifecycle. No same-secret refresh/redisplay/recovery/TTL extension; old QR terminal/non-actionable. Accepted relationship termination uses existing relationship revoke/withdraw, not invitation reset.

Only on-screen QR and existing copy link. No QR download/generated print/PDF/Web Share/OS share sheet/email/SMS/LINE sending integration. Screenshots/camera/manual sharing cannot be prevented. Warning meaning:

> QR/ลิงก์นี้ใช้สำหรับผู้รับที่ตั้งใจเชื่อมเท่านั้น
> ผู้ที่ได้รับภาพ QR หรือลิงก์สามารถเปิดหน้าคำเชิญได้
> แต่ต้องเข้าสู่ระบบด้วยบัญชีผู้รับที่ถูกระบุไว้จึงจะตอบรับได้

## 6. Visual / accessibility engineering direction

M error correction; standard black modules on opaque white; visible quiet zone, margin 4 unless actual scan/testing evidence supports an equivalent reliable value; generated/display target about 240px, responsive bounded 220–260px. Preserve reliability over decoration/sizing conventions. No logo/module overlays, decorative shapes/colors or custom branded encoding. Apply existing UI design system and Impeccable during implementation.

Meaningful alt without token or identity: `คิวอาร์โค้ดคำเชิญผู้ดูแล DEMI`. Loading and generic generation failure state; copy link remains available on failure. Practical control touch targets ≥44px, keyboard accessible, text state without reliance on color. No scan reliability certification until L04.

## 7. Privacy / fragment controls / audit

QR contains only opaque invitation secret embedded in URL, not embedded Patient identity/health data. Classify as **security-sensitive invitation credential / bearer locator**, not public identifier or authority; no unsupported legal classification. No intentional secret/QR/image in audit metadata, analytics, console/server logs, error text, Patient-management DTO or persistent browser storage. Alt contains no Patient/caregiver identity/National ID/token. Generic QR errors must not expose URL/error objects.

Retain fragment, strict 43-char validation, first-client-hydration read and immediate history.replaceState strip, invitation no-referrer/noindex/nofollow, no server-rendered token. No query/path/cookie/storage substitution. Fragment is absent from normal HTTP request target/Referer but not complete secrecy: request bodies/hidden login returnTo/client memory/DOM/redirect responses/clipboard/screenshots/extensions/scanners/history/BFCache remain sensitive. No screenshot protection, scanner privacy or messenger confidentiality guarantee.

No new durable QR rendered/scanned/page viewed/preview viewed business audit. Existing caregiver_invitation.created/accepted/rejected/revoked/expired and caregiver_relationship.activated remain authoritative; relationship revoke/withdraw audit unchanged. Existing expiry reconciliation may emit lifecycle expiry, not scan audit. No tracking table; avoids unnecessary viewing/scan retention and noise. Operational logs must not intentionally include secrets.

## 8. Narrow corrective preview response hardening — future implementation only

Source currently returns INVALID for unknown token and NOT_RECIPIENT for a valid token used by another authenticated account. No Patient name leaks and acceptance is denied, but token existence is distinguishable. Existing 17F.1 privacy-hardening gap, not QR authority failure.

Next implementation MUST collapse externally/client-visible unknown token, unavailable token and wrong intended recipient preview into the **same generic unavailable result/presentation**, including externally visible status/message rather than merely sharing a UI heading. Internal typed errors may remain distinct server-side. Preserve exact recipient checks, successful bounded recipient preview, lifecycle/audit and authorization. No runtime correction made in this closeout. This narrow hardening is authorized implementation scope, not a new product authority decision.

## 9. Login / mobile handoff evidence caveat

HTTPS/browser only; existing strict `/app/family/invitations#[A-Za-z0-9_-]{43}` returnTo and login fragment strip. No arbitrary route, extra redirect, native scanner/bridge, custom URI, Universal Links/Android App Links, LIFF or LINE login.

Protected /app layout may redirect anonymous invitation requests to /login before invitation hydration; server never receives initial fragment. Standards-based redirect fragment inheritance may preserve it, but source review is not browser/device UAT. Already-authorized /login#token can server-redirect to /app before login strip; browser-dependent fragment inheritance may carry secret to unrelated destination. This is **secret-containment / continuity risk, not authorization bypass**. Login refresh after strip can lose in-memory returnTo; back/BFCache are unverified. Rendering QR does not solve these edges.

Add focused source-level tests where feasible; preserve safe fragment handling and strict returnTo; avoid introducing new redirects. If implementation finds a deterministic reproducible disclosure outside bounded Family/login routes and a narrow containment correction fits existing semantics, implement the smallest correction and document evidence. If correction needs new transport/persistence/redirect architecture, **STOP and report requirement gap**. Never silently move token to query/path or invent native handoff. Actual iOS/Android/LINE/Facebook behavior remains L04.

## 10. Impact map / prohibited changes / ADR

| Surface | Bounded future impact |
| --- | --- |
| app/app/family/family-management-workspace.tsx | Local QR in issuance SUCCESS, expiry/warning/status/copy fallback. |
| Small QR presentation component | Only if responsibility warrants extraction; existing installed qrcode reused. |
| Family invitation transport/action-state/UI | Narrow generic preview error hardening; no authorization rule change. |
| Family UI and invitation/login tests | Exact URL, transient presentation, error fallback, strict returnTo/recipient/lifecycle; source-level containment checks where feasible. |
| Existing login/invitation handling | Only demonstrated narrow containment correction under section 9; architecture gap requires STOP. |
| Documentation | Implementation evidence and unresolved L04 checks. |

NO schema/migration/new model/enum/QR field/JSON/issuance or expiry timestamps/scan or QR audit table expected. Reuse CaregiverInvitation/tokenHash/24h/lifecycle/recipient. If persistence seems necessary, STOP and report.

NO token-service semantic change; NO Role/capability maps/Patient SELF/caregiver relationship or appointment grant authorization/relationship or data grant lifecycle/Hospital or PHR scope/OSM authority/ADMIN fallback/CAREGIVER role changes. No additional data authority, routes or native integrations.

**NO new ADR required**: no identity, role/capability, authorization, token semantics, persistence, grant or native/mobile architecture change; QR represents existing URL. If evidence contradicts this, report exact architectural conflict instead of inventing an ADR.

## 11. Implementation acceptance criteria

These are future checks, not claims of delivery or tests passed:

1. Generate QR from exact existing invitationLink string.
2. Decoding yields exact copy-link URL.
3. No alternate token/payload.
4. QR only in creation SUCCESS state.
5. Reload/new render without plaintext cannot reconstruct QR.
6. No plaintext persistence.
7. No schema/migration.
8. Existing DB-clock 24h unchanged.
9. Render/scan does not alter lifecycle.
10. Possession alone grants nothing.
11. Explicit acceptance required.
12. Wrong account sees no Patient identity.
13. Wrong account cannot accept.
14. Unknown/wrong-recipient/unavailable preview has same generic client result/presentation.
15. Exact recipient receives existing bounded preview.
16. Terminal invitations cannot activate again.
17. Patient revoke operationally invalidates old QR.
18. Reissue uses new invitation/token/issuance/TTL.
19. QR creates no family-appointment-read-v1 grant.
20. QR reads no appointments.
21. Appointment gate independent.
22. No durable scan/view audit.
23. No download/print/Web Share control.
24. Copy link remains available.
25. Generation failure retains copy-link fallback.
26. Quiet zone/contrast/size follow section 6, scan evidence under L04.
27. Alt has no secret/PII.
28. Fragment stripped on supported invitation flow.
29. No query/path token.
30. Strict login returnTo retained.
31. No arbitrary return route.
32. No CAREGIVER role.
33. No Patient impersonation.
34. No Patient-resource authority change.
35. No LIFF/native/deep-link integration.
36. L04 remains OPEN after implementation.

## 12. Remaining gates / documentation validation

L04 OPEN owns implementation re-audit and actual iOS/Android camera/browser, LINE/Facebook in-app browser, anonymous login return/authenticated/wrong-account/multi-role/non-PATIENT caregiver, expiry/revoke/replay, back/reload/BFCache, fragment stripping/redirect targets, effective scan size/quiet zone, deployed HTTPS origin, screenshot/clipboard warning and generation-failure fallback. Record devices/versions/evidence; no universal compatibility claim. L05 OPEN / FUTURE expiry/renewal expansion. Q5 real-data governance blocked remains separate from synthetic/demo implementation permission.

Closeout validation: actual HEAD/clean start and AGENTS read; relevant source invariants rechecked; complete documentation diff, intended documentation-only paths, Q18–Q29 A approvals/status/gates, Thai strict UTF-8 and Markdown links checked; git diff --check. No runtime/schema/migration/QR implementation/new authority/LIFF/native integration. No Prisma validate/generate/migrate, integration/full unit suite/build/dev server run because this task is documentation-only.
