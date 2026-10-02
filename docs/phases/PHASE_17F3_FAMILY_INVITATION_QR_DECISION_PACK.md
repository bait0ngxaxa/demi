# Phase 17F.3A — Family Invitation QR Transport Decision Pack

วันที่: 2026-10-02 · Repository: `bait0ngxaxa/demi`

**REQUIREMENT ANALYSIS + SECURITY / PRIVACY TRANSPORT REVIEW + OWNER DECISION PACK เท่านั้น**

**Current status — 17F.3B: P17F-L03 CLOSED / OWNER APPROVED · Q18–Q29 = A, CLOSED / OWNER APPROVED · 17F.3 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**

Owner อนุมัติอย่างชัดเจนในคำสั่ง Phase 17F.3B วันที่ 2026-10-02; ไม่ใช่การอนุมานจาก recommendations. ดู [implementation contract](./PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md). ส่วน baseline, D1–D12, threat table และ verification ของ 17F.3A ด้านล่างเป็น historical source analysis; ถ้อยคำ NOT OWNER APPROVED / NOT CLEARED ในส่วนประวัติถูก supersede เฉพาะขอบเขตที่ contract ระบุ. ไม่มี runtime เปลี่ยนและยังไม่มี QR UAT evidence.

## 1. Historical 17F.3A baseline และขอบเขต

Actual starting HEAD: `f47e9d3def920f4160896f185a703a6529d90a06` — `feat(phase-17f2): implement delegated appointment read grants`; ตรง expected baseline และ working tree สะอาดก่อนเริ่ม ไม่มี reset/revert/amend หรือเขียนทับงานใหม่

17F.0 CLOSED; 17F.1 IMPLEMENTED / CLOSED; 17F.2 `family-appointment-read-v1` IMPLEMENTED เฉพาะ synthetic/demo; real-data delegated use **GOVERNANCE BLOCKED ตาม Q5**. L01/L02/L06 CLOSED / OWNER APPROVED; **L03 OPEN**, **L04 OPEN** post-delivery re-audit/UAT, **L05 OPEN / FUTURE**. การตัดสินใจ QR ไม่ปิด Family overall และไม่เปลี่ยน authority ของ 17F.1/17F.2

เอกสารนี้ไม่เพิ่ม UI, runtime, route, token, schema, migration, native/custom deep link, LIFF, Universal/App Links, permission payload, delegated-data QR หรือ scan audit และไม่รับรอง compatibility/device UAT

## 2. Source evidence

ตรวจ source ที่ HEAD ข้างต้น; ชื่อ symbol เป็นจุดตรวจที่คงอ่านได้แม้เลขบรรทัดเปลี่ยน

| Evidence | สิ่งที่ตรวจพบ |
| --- | --- |
| [AGENTS.md](../../AGENTS.md), [Context](../CONTEXT.md) | เปลี่ยนเฉพาะ docs, รักษา Thai UTF-8, source authoritative, staged verification |
| [17F.0 contract](./PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md), [17F.1 handoff](./PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md) | G01–G08 foundation, bounded preview, ZERO-data relationship; L03/L04/L05 แยก gate |
| [17F.2B contract](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md), [17F.2 implementation](./PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md), [Backlog](./PHASE_17_UAT_BACKLOG.md) | Separate immutable exact-PHR grant + separate acceptance, default-disabled gate, Q5 ยังอยู่ |
| [Token service](../../src/modules/family/services/caregiver-invitation-token-service.ts) | `randomBytes(32).toString("base64url")`, SHA-256 digest, plaintext คืนจาก issuance เท่านั้น |
| [Schemas](../../src/modules/family/schemas/caregiver-relationship-schemas.ts) | Token regex `^[A-Za-z0-9_-]{43}$`; National-ID creation input แบบ strict |
| [Relationship service](../../src/modules/family/services/caregiver-relationship-service.ts) | `assertPatientSelf`, ACTIVE persisted User/PATIENT/Profile; server identity hash locator; exact ACTIVE existing recipient User/Person/authSubject; self-delegation deny; DB `clock_timestamp()` + `INTERVAL '24 hours'`; exact recipient preview/accept/reject; conditional terminal transition + transactional audit |
| [Policy](../../src/modules/family/policies/caregiver-relationship-policy.ts), [management query](../../src/modules/family/services/caregiver-relationship-query-service.ts) | Creator PATIENT SELF; recipient ไม่ต้อง PATIENT; management selectors ไม่มี tokenHash/plaintext; participant names เป็น management metadata |
| [Family actions](../../src/modules/family/transport/server-actions.ts), [action state](../../src/modules/family/transport/action-state.ts) | Creation SUCCESS มี token/expiry; preview DTO มีเพียง name/status/expiry/version; safe messages ไม่ echo secret |
| [Family workspace](../../app/app/family/family-management-workspace.tsx) | Browser `window.location.origin` + `/app/family/invitations#` + token; creation-success state, one-time copy-link UI; ไม่ enforce HTTPS เอง; no Family QR |
| [Invitation page](../../app/app/family/invitations/page.tsx), [preview client](../../app/app/family/invitations/family-invitation-preview.tsx) | no-referrer/noindex/nofollow; client decode/validate/replaceState ใน hydration effect; server preview; explicit accept/reject forms; SSR snapshot ไม่มี token |
| [Login form](../../app/login/login-form.tsx), [login schema](../../src/modules/auth/schemas/login-schema.ts), [login action](../../src/modules/auth/transport/server-actions.ts) | Fragment → bounded hidden returnTo; strip fragment; server regex ยอมรับเฉพาะ `/app/family/invitations#<43-char>`; successful authentication redirect, otherwise `/app` |
| [Protected layout](../../app/app/layout.tsx), [login page](../../app/login/page.tsx), [access service](../../src/modules/auth/services/application-access-service.ts), [proxy](../../proxy.ts), [session proxy](../../src/lib/auth/supabase-proxy.ts) | Layout redirects unauthenticated/denied to `/login`; login already-AUTHORIZED redirects `/app` ก่อน form hydrate; proxy refreshes session ไม่มี Family handoff เพิ่ม |
| [Workforce QR](../../app/app/workforce/workforce-workspace.tsx), [Patient activation QR](../../app/app/patients/activation/patient-activation-handoff.tsx) | Client `QRCode.toDataURL`, M/margin 2/width 240; CSS `h-52 w-52` + padding ทำให้ display ไม่เท่ากับ generated 240; Patient pattern ผูก generated image กับ URL เพื่อกันภาพ stale |
| [package.json](../../package.json), [lockfile](../../package-lock.json) | `qrcode ^1.5.4`, lock resolves 1.5.4; `@types/qrcode ^1.5.5`, lock 1.5.6; ไม่เพิ่ม dependency |
| [Family action tests](../../src/modules/family/transport/server-actions.test.ts), [Family page tests](../../app/app/family/family-pages.test.tsx), [login action tests](../../src/modules/auth/transport/server-actions.test.ts) | อ่าน assertions เรื่อง bounded results/no render-time acceptance/strict returnTo; ไม่ได้รัน และไม่ใช่ real-device handoff proof |

External technical references ตรวจเมื่อ 2026-10-02: [RFC 9110 §10.2.2 Location / §17.11](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.2), [RFC 9110 §10.1.3 Referer](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.1.3), [URI fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment), [node-qrcode official options](https://github.com/soldair/node-qrcode#options). ไม่อ้าง external docs เป็น owner approval

## 3. Current secure invitation flow และข้อแตกต่างที่ต้องไม่ปิดบัง

1. Patient SELF ส่ง National ID เป็น server-side recipient locator; ไม่เก็บเลขนั้นใน Family payload/audit และไม่ใช้เป็น proof/authority
2. Server bind invitation กับ exact existing ACTIVE caregiver User + Person; ต้องมี authSubject และไม่ใช่ผู้สร้าง/Patient คนเดียวกัน
3. Generate 256-bit random secret, base64url 43 characters; persist SHA-256 digest เท่านั้น. DB-clock issuance + 24h expiry; plaintext กลับใน creation result
4. Creator browser ประกอบ current-origin fragment URL และแสดง link ครั้งเดียวใน SUCCESS state; clipboard errors เป็นข้อความทั่วไป
5. เมื่อ preview client mount จะอ่าน/validate fragment แล้ว `history.replaceState` ลบทันทีใน hydration; token ยังอยู่ใน client memory/DOM form เพื่อเรียก authenticated server actions
6. Server preview ตรวจ ACTIVE current User และ exact caregiverUserId + caregiverPersonId ก่อนคืน Patient display name, status, expiry, `family-delegation-v1`. ไม่มี anonymous Patient identity disclosure ที่พบ
7. Explicit accept ใช้ conditional DB-clock check ว่ายัง PENDING/unexpired/ตรง User+Person; atomic ACCEPTED + exact ACTIVE relationship + audits. Reject/revoke/expiry เป็น terminal; scan/open/login/preview ไม่ activate

**ข้อจำกัดจาก source:**

- Preview ใช้ application `getNow()` เพื่อแสดง EXPIRED; mutation ใช้ DB clock เป็น authoritative boundary. Preview ไม่เปลี่ยน persisted status หรือเขียน view audit; expiry reconciliation บาง lifecycle operation อาจเขียน existing `.expired` event
- Exact recipient ยัง preview bounded name/status ของ ACCEPTED/REJECTED/REVOKED/EXPIRED ได้; terminal token ถูก deny สำหรับ accept/reject/activation ไม่ใช่ deny ทุกการเปิดดู. อย่าอ้างว่า QR ที่หมดอายุไม่มี preview ใด ๆ โดยเปลี่ยน 17F.1 semantics
- Wrong account ไม่ได้รับ Patient name แต่ action คืน `NOT_RECIPIENT` ต่างจาก `INVALID` ของ unknown token. ปลอดภัยด้าน identity projection แต่ยังแยก token-exists/not-recipient ได้ จึง **ไม่ใช่ non-enumerating อย่างสมบูรณ์**. เป็น existing privacy discrepancy ต่อถ้อยคำ D2; owner ต้องรับรู้ และถ้าต้องการ response indistinguishability ให้จัด corrective scope แยกก่อนอ้างว่าผ่าน ไม่แก้ runtime ใน task นี้
- UI บังคับ preview ก่อนแสดง accept button แต่ service ไม่เก็บ proof ว่าเคย preview: authenticated exact recipient สามารถ submit action โดยตรงได้ โดยยังต้องผ่าน lifecycle checks. Explicit action เป็น boundary; QR ไม่เพิ่ม mandatory preview receipt
- Protected parent layout อาจ redirect ก่อน invitation client hydrate; `NEEDS_LOGIN` client branch จึงไม่ใช่หลักฐานว่าทุก anonymous initial load ใช้ branch นี้ ดู section 6

## 4. Historical D1–D12 analysis — approved disposition in section 10

### D1 — QR content / payload

**RECOMMENDATION — NOT OWNER APPROVED:** QR encode **exact existing URL** `https://<current-origin>/app/family/invitations#<43-char-plaintext-token>`, ไม่มี wrapping/shortener/redirect service เพิ่มและไม่มี token format ใหม่. Production/UAT origin ต้องเป็น HTTPS ที่ผู้ใช้เข้าถึงได้; source ปัจจุบันใช้ current origin แม้เป็น HTTP/local development ได้ จึงอย่าอ้างว่า source enforce HTTPS

ห้าม payload มี National ID, identityKeyHash, invitation DB ID, Patient ID, caregiver User/Person ID, Patient/caregiver name, Hospital, appointment grant, capability, role, relationship state, JSON, signed permission claims หรือ Patient-resource data

| Alternative | ผลต่อ security / simplicity |
| --- | --- |
| Existing opaque URL | Reuse entropy/hash/recipient binding/expiry/revoke; ไม่มี second lifecycle |
| QR-specific token | เพิ่ม issuance/hash/rotation/purpose separation ที่ต้องพิสูจน์ใหม่โดยไม่มีความจำเป็น |
| Encoded JSON | Encoding ไม่ encrypt; เพิ่ม identity leakage/parser/version contracts |
| Signed QR authorization blob | Signature ไม่ปกปิดข้อมูล; เพิ่ม key/claim/revoke consistency และเสี่ยงให้ transport กลายเป็น authority |
| Database locator QR | ID ไม่ใช่ proof; lookup/enumeration surface เพิ่มและยังต้อง exact-recipient authorization |

### D2 — Authority

**RECOMMENDATION — NOT OWNER APPROVED:** QR possession alone grants **ZERO authority** เทียบเท่า possession ของ existing invitation URL เท่านั้น. ก่อน activate ต้อง valid token → PENDING → unexpired → authenticate ACTIVE account → exact caregiverUserId → exact caregiverPersonId → bounded preview → explicit caregiver accept. Authentication อาจเกิดก่อน token lookup ตาม current source; ลำดับนี้เป็น required conditions ไม่ใช่คำสั่ง rewrite service

Forwarded QR ไม่ transfer identity; scan/open/auth/preview ไม่ auto-accept. Wrong account ต้องได้ safe unavailable/non-enumerating response และไม่มี Patient name; source enforce identity/accept deny แล้ว แต่ response distinction ข้างต้นยังเป็นข้อจำกัด. Alternative “scan = proof/authorization” เปลี่ยน authority และอยู่นอก approved foundation; ไม่เสนอ implement

### D3 — Lifetime

**RECOMMENDATION — NOT OWNER APPROVED:** ไม่มี QR lifetime แยก; ใช้ invitation 24h ตั้งแต่ DB issuance. ACCEPTED/REJECTED/REVOKED/EXPIRED ไม่ usable เพื่อ activate; rendering/scanning/login ไม่ reset/extend TTL และไม่สร้าง post-accept reusable QR. **image existence != valid invitation authority**; bounded terminal preview ของ exact recipient คงเดิม

Alternative separate QR TTL ทำให้มีสอง clock/lifecycle และอาจสร้างความเข้าใจผิดเรื่อง revoke; ไม่มี source need สำหรับ qrExpiresAt

### D4 — Generation location

**RECOMMENDATION — NOT OWNER APPROVED:** A client-side generation จาก one-time URL โดย existing `qrcode`. Secret มีอยู่ใน creator browser อยู่แล้ว; ไม่ส่งไป QR endpoint/third party เพิ่ม ไม่ persist image/log access/storage lifecycle

B server-generated image เพิ่ม secret transmission/cache/logging surfaces แม้ทำได้อย่างปลอดภัยหากมี contract; C persisted artifact เพิ่ม retention/access/deletion lifecycle. ไม่มี requirement ที่คุ้มเพิ่มทั้งสองทาง. Client generation **ไม่ทำให้ token non-sensitive**; QR เป็น bearer-secret-equivalent transport แต่ secret นี้ยังไม่ใช่ bearer authorization

### D5 — Presentation availability

**RECOMMENDATION — NOT OWNER APPROVED:** QR อยู่เฉพาะ creation SUCCESS state เดียวกับ plaintext link. “ครั้งเดียว” หมายถึง response/state ที่ไม่ recover หลัง reload/navigation ไม่ใช่ render ได้หนึ่ง frame หรือ screenshot prevention; browser back/BFCache อาจ retain state ต้อง UAT

ไม่ reconstruct จาก tokenHash, ไม่เก็บ plaintext DB/localStorage/sessionStorage, ไม่ให้ management query คืน plaintext, ไม่ persist QR. Lost link/QR → revoke pending → create NEW invitation; expired invitation ใช้ existing expiry reconciliation ก่อน reissue. Alternative later redisplay ต้อง plaintext storage/recovery ใหม่ จึงไม่ใช่ cosmetic change

### D6 — Copy / download / screenshot

**RECOMMENDATION — NOT OWNER APPROVED:** on-screen QR + existing copy link เท่านั้น; ไม่มี explicit download, generated print/PDF หรือ Web Share API requirement. Copy link เป็นทางเลือกบนอุปกรณ์เดียวกันและ accessibility fallback. Download/print/share sheet เพิ่ม durable copies/platform flows ที่ยังไม่จำเป็น; ไม่สามารถป้องกัน camera/screenshot/manual print/browser save ได้และไม่รับรอง confidentiality หลังแชร์

ข้อความเสนอ (ยังไม่แก้ UI):

> QR/ลิงก์นี้ใช้สำหรับผู้รับที่ตั้งใจเชื่อมเท่านั้น
> ผู้ที่ได้รับภาพ QR หรือลิงก์สามารถเปิดหน้าคำเชิญได้
> แต่ต้องเข้าสู่ระบบด้วยบัญชีผู้รับที่ถูกระบุไว้จึงจะตอบรับได้

### D7 — URL placement / leakage controls

**RECOMMENDATION — NOT OWNER APPROVED:** retain fragment, strict 43-char validation, strip ใน first client hydration, no-referrer/noindex/nofollow invitation metadata, ไม่มี server-rendered token/analytics/console/domain log/audit payload. Query/path alternative เพิ่ม normal request/access-log exposure. Fragment ไม่อยู่ใน normal HTTP request target หรือ Referer; ไม่ใช่ complete secrecy และไม่กัน scripts/extensions/scanner history หรือ redirect inheritance

Token ถูกส่งใน server-action request body สำหรับ preview/accept/reject และ login hidden returnTo; creation response มี secret ตามที่อนุมัติแล้ว. ดังนั้น “fragment ไม่เข้า server” ใช้ได้เฉพาะ initial URL request ไม่ใช่ทั้ง flow. ไม่พบ intentional token logging/error-report hooks ใน Family/login/auth/shared app shell ที่ค้น; ไม่รับรอง hosting/APM/network capture ทุกชั้น. QR data URL, DOM input, React state, clipboard ต้องถือ sensitive เท่ากัน; proposed generation errors ให้ generic message ไม่ใส่ URL/token/error object

### D8 — Preview before authentication

**RECOMMENDATION — NOT OWNER APPROVED:** anonymous generic login prompt เท่านั้น. หลัง auth + exact intended ACTIVE User/Person match อนุญาตเฉพาะ existing Patient display name/status/expiry/acceptance explanation/version. No National ID/HN/phone/email/Hospital history/data grants/appointments/clinical data; QR ไม่ขยาย projection

Source ไม่คืน name ก่อน match แม้ DB query เลือก name ก่อนตรวจ recipient ภายใน server; ไม่พบ client identity disclosure blocker. Anonymous-preview alternative จะเป็น new disclosure และต้อง requirement/privacy approval แยก

### D9 — Login / mobile handoff

**RECOMMENDATION — NOT OWNER APPROVED:** standard HTTPS/browser + existing bounded Family login return เท่านั้น. No custom scheme/native scanner/app bridge/LIFF/LINE login/Universal Links/Android App Links. Login handoff ไม่ยืด TTL และไม่ accept invitation. Native alternative เพิ่ม architecture/platform support ที่ไม่มี requirement นี้

Existing client link ใช้ `/login#token`; login form strips fragment, retains bounded destination in memory/hidden field; server revalidates exact path + 43-char token แล้ว redirects หลัง password auth. ไม่ส่ง token ให้ arbitrary route ผ่าน returnTo. Initial anonymous scan, already-authenticated login race, back/refresh และ in-app navigation ยังมีข้อจำกัด section 6; **ไม่ได้พิสูจน์ survives login exactly once สำหรับทุก browser**

### D10 — QR vs appointment-data grant

**RECOMMENDATION — NOT OWNER APPROVED:** QR transports `CaregiverInvitation / family-delegation-v1` เท่านั้น. Accepted relationship = ACTIVE; **incremental Patient-resource authority = ZERO**. Existing independent Hospital/OSM/SELF roles หรือ separately accepted grants ไม่ถูกลบและไม่ถูกขยายโดย QR

`family-appointment-read-v1` ต้อง Patient propose exact separate grant/one exact selected PHR + caregiver explicitly accept data grant. ห้าม QR มี grant proposal/acceptance, PHR scope, appointment capability หรือ data-sharing scope; no automatic grant on scan/relationship acceptance. Deployment gate enabled/disabled เป็นอิสระจาก invitation; Q5 real-data governance คงเดิม. Combined-data QR alternative เปลี่ยน consent/authority contract และไม่อยู่ใน first slice

### D11 — Reissue / revocation

**RECOMMENDATION — NOT OWNER APPROVED:** exposed/lost PENDING invitation → Patient revoke → issue NEW random secret/hash/DB-clock 24h lifecycle. Expired old invite reconcile ผ่าน existing service; ไม่ต้องทำ expired row กลับ PENDING. Accepted/rejected/revoked/expired never return to PENDING; accepted relationship termination ใช้ existing relationship revoke/withdraw แยก

Old QR cannot activate; exact recipient may see terminal bounded status. No hash recovery/refresh same secret/extend old TTL/recreate lost token. Reuse alternative ต้องเปลี่ยน secret retention/lifecycle และไม่อนุมัติ

### D12 — QR visual configuration / UX

**RECOMMENDATION — NOT OWNER APPROVED:** fixed M, generated/display target ประมาณ 240px (bounded 220–260px เมื่อ responsive), black modules on opaque white, ไม่มี logo overlay/decorative styling; recommend quiet-zone `margin: 4` ตาม official package default แทน blindly copying activation `margin: 2`. Existing CSS activation แสดงเล็กกว่า output จึงต้องกำหนด effective display ให้ชัดในการ implement หลัง approval. Visual settings ไม่ใช่ authorization

ใช้ Impeccable planning guidance และ existing PRODUCT/DESIGN: Operate flow, existing Panel/Alert/Button/tokens, QR + text/link เป็นกลุ่มเดียว responsive stack, meaningful alt ไม่ใส่ secret/name, keyboard copy control ≥44px touch target, status text ไม่พึ่งสี. แสดง loading/generic QR failure โดย link ยัง copy ได้; reset/stale-generation guard ผูก image กับ exact current URL ตาม Patient activation pattern. ไม่เพิ่ม UI library และไม่สร้าง reusable abstraction จนพบความรับผิดชอบซ้ำจริง. L04 ทดสอบ effective quiet zone, long deployed URL, screen zoom/brightness/camera distance; ไม่มี scan-reliability certification จาก source

## 5. Threat / failure table

“L04” คือ future real-device/browser UAT ที่ยังไม่ได้ทำ; ไม่แทน server authorization tests

| Threat / failure | Current mitigation | Proposed 17F.3 mitigation | Residual risk | L04 device UAT |
| --- | --- | --- | --- | --- |
| Unintended person photographs QR | Exact recipient binding/24h; ยังไม่มี QR | Same URL, warning, no extra payload | Photo persists; stolen intended account/session ยังเสี่ยง | ใช่ |
| Forwarded QR | Forwarded link cannot transfer identity | Preserve exact User+Person check | Social confusion; not full confidentiality | ใช่ |
| Token copied from QR | Hash at rest; high entropy; not authority | No new format, no external generator | Scanner/clipboard stores secret | ใช่ |
| Wrong account scans | No name/accept; NOT_RECIPIENT response | Safe unavailable; resolve documented response-discrimination gap if required | Existing INVALID vs NOT_RECIPIENT distinction | ใช่ + focused action checks หลัง approval |
| Unauthenticated scan | Protected layout login; no identity returned | HTTPS bounded handoff, generic prompt | Fragment transfer depends actual redirect path | ใช่ |
| Token after expiry | DB conditional mutation deny; exact recipient terminal preview | Same 24h, no QR TTL | Clock difference affects preview; retained image/name | ใช่; boundary checks server-side |
| Patient revokes after sending | Terminal pending revoke transaction | Old QR remains non-actionable | Previously rendered preview cannot be recalled | ใช่; concurrency verification |
| Accepted QR scanned again | ACCEPTED terminal; no repeat activation | Same lifecycle | Exact recipient can see bounded terminal preview | ใช่ |
| Recipient logs in another device | Binding is account/person, not device | Reopen original QR/link there | Login state/token not auto-transfer between browsers | ใช่ |
| Browser history / back | replaceState after hydrate | Preserve stripping; no app persistence | Original navigation/scanner/BFCache may retain secret or preview | ใช่ |
| Referrer leakage | Fragment excluded; invitation no-referrer | Retain metadata/fragment | Script/redirect/scanner not controlled by Referer policy | ใช่ + deployed headers review |
| Analytics / logging leakage | No intentional token logging found; lifecycle metadata bounded | No QR analytics/error payload | Hosting/APM/session replay outside source guarantee | Device + environment review |
| Screenshot persistence | Link display already screenshot-able | No download/print feature; honest warning | Cannot delete shared image | ใช่ |
| Malicious QR replacement / phishing | Real service checks identity only after reaching DEMI | Visible known HTTPS origin/link, standard QR | Fake site can steal credentials; no anti-phishing guarantee | ใช่ |
| In-app browser opens scan | Standard web route/login | No native integration; copy-link fallback | Cookies/fragments/redirect/refresh may differ | ใช่ LINE/Facebook explicitly |
| QR pasted in website/message | Intended-recipient auth still required | No shortener/wrapper added by DEMI | Third party can decode/archive URL/image; cross-site redirect inheritance | ใช่ |
| Recipient has multiple roles | User+Person match; no role substitute | Preserve separate authority paths | Other roles keep their own rights; UI confusion | ใช่ cross-role |
| Recipient is not PATIENT | ACTIVE exact account accepted; no caregiver PATIENT prerequisite | No new role/provisioning | New-account onboarding still unsupported | ใช่ OSM/HOSPITAL-only |
| Appointment feature on/off independently | Server gate/default disabled; separate grants | QR never creates grant | Existing valid independent grants may authorize on enablement, subject Q5 | ใช่ both gate states |

## 6. Mobile / browser handoff review

Intended flow: camera/scanner/LINE browser → HTTPS invitation → login if needed → bounded return → exact-recipient server preview → explicit accept/reject

Source-supported paths and limits:

- Already authenticated direct invitation: client validates/strips fragment, preview service verifies intended recipient. Hydration guard reads once per mounted store, ไม่ใช่ global single-use token; server lifecycle governs consumption
- Anonymous initial direct visit: `/app` parent layout redirects `/login` ก่อน child hydrate. HTTP 3xx Location ไม่มี fragment สามารถ inherit original fragment ตาม RFC 9110 §10.2.2; **เป็น standards-based inference ไม่ใช่ browser PASS**. Next streaming/client redirect path อาจต่างจาก ordinary 3xx ต้อง L04. ไม่กล่าวว่าการ redirect นี้ทำ token หายเสมอ หรือรอดเสมอ
- Mounted invitation loses session: NEEDS_LOGIN → explicit `/login#token` เป็น intended client handoff; login removes hash, holds returnTo through same mounted form/errors, validates server-side แล้วส่งคืน route. Secret อยู่ใน request body/redirect response ไม่ใช่ query
- Refresh หลัง strip: invitation และ login stores ถูกสร้างใหม่ ไม่มี hash → ไม่มี token/returnTo; reopen original shared link/QR หากยัง valid. Copying clean address bar หลัง strip ไม่ carry invitation. Browser switch ไม่มี automatic transfer
- Already-authorized `/login#token`: login page redirects `/app` ก่อน form strip/restore. Standard redirect อาจ inherit hash ไป **unrelated `/app`**; strict returnTo ไม่คุม branch นี้. เป็น existing containment/continuity edge ไม่ใช่ authorization bypass. ต้อง reproduce ใน L04 และแก้ใน separately authorized corrective scope ถ้ายืนยัน ไม่รับรอง “unrelated routes cannot receive fragment” ทั้งระบบจาก regex อย่างเดียว
- Back/BFCache/history อาจ restore mounted state/preview หรือ empty state; ไม่มี source proof ว่าทุก entry ถูก scrub หรือ stale view ถูกลบทันที. Mutation always rechecks current lifecycle
- Login page/root ไม่ได้ระบุ no-referrer/noindex แบบ invitation; fragment ยังไม่เข้า normal Referer แต่ไม่มี explicit route-level parity. Deployment headers/third-party scanners/extensions/session replay ต้องตรวจ environment จริง
- Source ไม่ enforce approved public HTTPS hostname; current-origin link ที่ localhost ใช้จากมือถืออีกเครื่องไม่ได้. L04 ต้องใช้ approved reachable non-production HTTPS origin, synthetic participants/data

L04 matrix: iOS/Android camera + browsers, LINE/Facebook in-app browsers, same-device copy vs other-device scan; anonymous/authenticated/wrong/non-PATIENT/multi-role; login failure/retry/session changed in another tab; reload/back/BFCache; original link reopened; expiry/revoke/accept replay/races; HTTPS origin/fragment stripping/redirect targets; screenshot/clipboard warning and QR loading/failure/scan size. ไม่มี broad compatibility claim จนมี device/version/evidence จริง

## 7. Privacy / leakage classification

QR contains **opaque invitation secret embedded in URL only**; ไม่ embed Patient identity/health data. Classify เป็น **security-sensitive invitation credential / bearer locator**, ไม่ใช่ public identifier และไม่ใช่ proof of identity/authorization. Token possession อาจพาไป auth handoff; exact recipient authentication จึงได้ bounded preview. ไม่เรียก QR ว่า Patient data ในความหมายกฎหมายโดยไม่มี repository/legal evidence และไม่สร้าง legal claim

Exposure surfaces: creator action response/client state/link field; local QR data URI/image/DOM; clipboard/screenshots/scanner/messages; invitation memory/hidden forms/server-action bodies; login memory/hidden returnTo/redirect response; scripts/extensions/history/BFCache. Fragment ลด normal HTTP URL/referrer exposure แต่ไม่ลบ surfaces เหล่านี้. `replaceState` ทำหลัง hydration ไม่ใช่ก่อน browser/scanner เห็น URL; robots metadata ไม่ใช่ access control

No deliberate console/analytics token logging found in reviewed paths; existing audit metadata ไม่มี secret/National-ID/names. ไม่ส่ง QR URL/data URI ไป telemetry, remote QR API, analytics metadata หรือ error object. ไม่เสนอ scan tracking; operational logs ต้องไม่ capture sensitive request bodies. User แชร์ภาพแล้ว confidentiality ไม่อยู่ในการควบคุมของ UI

## 8. Relationship vs data; schema / audit / ADR assessment

`family-delegation-v1` acceptance สร้าง relationship เท่านั้น ไม่ใช่ `family-appointment-read-v1` acceptance. Separate immutable grant ต้อง exact Patient/caregiver/ACTIVE parent/one Patient-selected PHR และ current server eligibility + independently enabled gate; QR ไม่เปลี่ยน six-field projection/rolling 90-day feed/no-independent-grant-expiry หรือ Q5 real-data gate

**RECOMMENDATION — NOT OWNER APPROVED:** **NO schema/migration required** สำหรับ transport representation. Reuse CaregiverInvitation/tokenHash/24h/recipient/lifecycle; no qrCode table, qrToken, qrPayload JSON, qrIssuedAt, qrExpiresAt, qrScanEvent. ไม่มี source evidence ว่าต้อง persist QR

**RECOMMENDATION — NOT OWNER APPROVED:** **No durable business AuditEvent for QR rendered/scanned/page viewed**. Existing `caregiver_invitation.created/accepted/rejected/revoked/expired` และ `caregiver_relationship.activated` authoritative; existing relationship revoked/withdrawn คงเดิม. เพิ่ม view/scan events สร้าง tracking/retention/access/noise และยังไม่ใช่ acceptance evidence; expiry lifecycle audit อาจเกิดระหว่าง existing reconciliation ไม่ใช่ scan event ใหม่

**RECOMMENDATION — NOT OWNER APPROVED:** **NO new ADR** หากใช้ exact URL presentation เท่านั้น: identity/auth/token lifecycle/route authority/persistence/mobile architecture/delegation scope ไม่เปลี่ยน. New native handoff, bearer authorization blob, anonymous disclosure หรือ persistent QR จะเป็น architectural change ที่ต้องประเมินใหม่ก่อน implement; ไม่สร้าง ADR อัตโนมัติ

## 9. Implementation impact map — after approval only

| Surface | Likely impact / exclusion |
| --- | --- |
| `app/app/family/family-management-workspace.tsx` | Add local QR to existing SUCCESS state, generic status/warning/accessibility; retain copy link |
| Small presentation component | Optional only if existing responsibility warrants it; do not extract activation services/security |
| `qrcode` | Reuse installed dependency; no upgrade/lockfile change required |
| Family UI tests | Exact same URL, no extra payload, one-time/no persistence, loading/failure/stale async guards |
| Login/invitation route tests | QR-equivalent URL and auth/recipient/lifecycle checks; deployed/device handoff under L04 |
| Documentation | Approved answers + implementation evidence later |
| Schema/migrations/token service/TTL/relationship authorization | **NO expected change** |
| Appointment grant schema/policy/roles/audit domain | **NO expected change** |

Current handoff/response caveats ไม่ถูก silently folded เข้า QR patch. หาก strict non-enumeration หรือ login race ต้อง corrective runtime changes ให้กำหนด narrow separate scope หลัง owner decision; ไม่ถือว่า approval ของ QR อนุมัติ authority changes

## 10. Owner-approved Q18–Q29 closeout — 17F.3B

ทุกข้อ Q18–Q29 owner เลือก **A — CLOSED / OWNER APPROVED** ในคำสั่ง 17F.3B. Alternatives คงไว้เป็นประวัติการวิเคราะห์ ไม่ได้รับอนุมัติ. ขอบเขตบังคับตาม [17F.3B contract](./PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md); ไม่มี new authority.

| Question | Owner choices | Evidence / security-privacy consequence | Owner decision |
| --- | --- | --- | --- |
| Q18 Payload | A exact existing URL + fragment token; B new QR payload/token; C Other | Token/schema/workspace; A preserves hash/binding, B adds lifecycle/disclosure contracts | **A — CLOSED / OWNER APPROVED** (D1) |
| Q19 Authority | A transport only, exact login + explicit acceptance; B Other | Service exact User/Person + conditional accept; scan-authority would weaken binding | **A — CLOSED / OWNER APPROVED**; response distinction caveat D2 |
| Q20 Lifetime | A same 24h/terminal lifecycle; B separate QR lifetime; C Other | DB clock/terminal writes; second TTL creates ambiguity | **A — CLOSED / OWNER APPROVED** (D3); terminal preview unchanged |
| Q21 Generation | A client one-time URL; B server image; C persisted artifact | qrcode installed/browser patterns; B/C expand secret/cache/retention surfaces | **A — CLOSED / OWNER APPROVED** (D4) |
| Q22 Availability | A creation-success only; B later redisplay somehow; C Other | Only issuance returns plaintext; B needs new storage/recovery contract | **A — CLOSED / OWNER APPROVED** (D5) |
| Q23 Sharing | A screen QR + copy link, no download/print/share API; B download; C Other | Existing copy fallback; durable copies cannot be recalled | **A — CLOSED / OWNER APPROVED** (D6) |
| Q24 URL | A fragment + immediate client strip; B query/path; C Other | Preview/login hydration; B expands request/log exposure; A still client-sensitive | **A — CLOSED / OWNER APPROVED** (D7) |
| Q25 Anonymous preview | A no identity before auth + exact match; B limited anonymous preview; C Other | Server checks before DTO; B new disclosure | **A — CLOSED / OWNER APPROVED** (D8) |
| Q26 Mobile | A HTTPS/browser + existing bounded login return; B LIFF/custom/native now; C Other | Login regex safe; layout/race/refresh/device continuity unverified | **A — CLOSED / OWNER APPROVED** (D9), subject L04 caveats |
| Q27 Relationship/data | A relationship-only, ZERO data grant; B include data grant; C Other | 17F.1 vs separate 17F.2 immutable grant; B changes authority/acceptance | **A — CLOSED / OWNER APPROVED** (D10) |
| Q28 Lost/exposed | A revoke old + new token; B redisplay/reuse same; C Other | Hash-only + terminal lifecycle; B needs retention or altered TTL | **A — CLOSED / OWNER APPROVED** (D11) |
| Q29 Scan/render audit | A no durable scan/render event; B durable scan/view audit; C Other | Existing lifecycle audit; B new tracking/retention requirement | **A — CLOSED / OWNER APPROVED** (section 8) |

D12 implementation direction ยืนยันแล้ว: M, black/opaque white, margin 4 เว้นแต่ scan evidence รองรับค่าเทียบเท่า, target 240px/responsive 220–260px, no branding over modules; loading/generic failure/copy fallback/accessibility. เป็น engineering/UX configuration ไม่ใช่ authority และยังไม่ผ่าน L04 scan certification.

## 11. Historical 17F.3A verification / remaining gates

Documentation-only source review: ตรวจ actual HEAD/clean start; token 43-char + randomBytes(32)/SHA-256; DB-clock 24h unchanged; exact recipient mandatory; bounded preview/terminal replay; one-time hash-only boundary; no Family QR; existing QR version/settings; strict login return; parent layout/login redirect caveats; separate grant/Q5; schema/audit/ADR exclusions

ก่อน commit ตรวจ full documentation diff, intended four files, UTF-8/Thai/encoding and preserved existing newlines, local Markdown link targets, `git diff --check`. ไม่มี runtime check PASS claim. ไม่รัน migration/generate/integration/full tests/build/dev server/lint/typecheck เพราะไม่มี runtime change. Device UAT ยังไม่ทำ; deployment/APM/scanner behavior และ strict indistinguishable error requirement ยังไม่ verified

**P17F-L03 remains OPEN until explicit final owner approval. 17F.3 NOT IMPLEMENTED / NOT CLEARED. L04 OPEN; L05 OPEN / FUTURE; Q5 real-data GOVERNANCE BLOCKED unchanged. No new authority approved.**

## 12. Historical proposed package — implementation cleared by 17F.3B

**PROPOSED / RECOMMENDED · NOT OWNER APPROVED · DO NOT IMPLEMENT YET**

Patient creates existing caregiver invitation → SUCCESS shows existing copyable HTTPS link → client renders exact same URL as on-screen QR → share to intended existing-account recipient → scan opens existing Family invitation route → fragment validated/stripped on first client hydration (anonymous parent redirect caveat remains) → login if needed → existing bounded return restores invitation in supported flow → exact recipient server check → existing bounded preview → explicit accept/reject → unchanged 17F.1 lifecycle

No new DB model, token, authority, data grant, QR scan audit, route or native/mobile integration. Rendering success, QR possession และ owner อ่านเอกสารนี้ไม่ใช่ acceptance/approval. Owner decisions Q18–Q29 และ L04 evidence ยังต้องเกิดจริง

## 13. 17F.3B implementation handoff / current gates

P17F-L03 **CLOSED / OWNER APPROVED** สำหรับ QR transport เท่านั้น; 17F.3 **CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**. L04 OPEN, L05 OPEN / FUTURE, Q5 real-data GOVERNANCE BLOCKED. [17F.3B contract](./PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md) supersedes earlier need-to-decide wording: narrow unknown/unavailable/wrong-recipient preview response hardening เป็น implementation scope; internal errors/authorization/lifecycle ไม่เปลี่ยน. Login redirect fragment containment/continuity caveat ยังไม่ solved; focused source tests และ L04 device evidence ต้องตามมา. No schema/migration/new token/new authority/data grant/native integration/scan audit; no new ADR required.
