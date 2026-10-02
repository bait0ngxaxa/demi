# Phase 17F.4B — Family / Caregiver Real-device UAT Checklist

เอกสารนี้เป็นแบบบันทึกหลักฐานด้วยอุปกรณ์และเบราว์เซอร์จริงสำหรับ `bait0ngxaxa/demi` ไม่ใช่ผลการทดสอบที่ดำเนินการแล้ว ทุกช่องผลจริงและ PASS/FAIL เว้นว่างไว้ ผู้ทดสอบต้องกรอกหลังทำแต่ละกรณีจริงเท่านั้น ผล Node/unit/PostgreSQL integration ใช้แทนหลักฐาน camera, redirect, fragment, in-app browser หรือ scan reliability ไม่ได้

สถานะตั้งต้น: **P17F-L04 OPEN — REAL-DEVICE UAT PENDING; Phase 17F overall NOT CLOSED**. P17F-L05 OPEN / FUTURE; Q5 real Patient delegated-data use GOVERNANCE BLOCKED. ใช้ synthetic/demo data เท่านั้น ไม่ใส่รหัสผ่าน credentials token จริง National ID HN หรือ Patient PII ในเอกสาร/ภาพหลักฐาน ไม่เปิดใช้ข้อมูลจริงเพียงเพราะ automated re-audit ผ่านหรือ feature flag เปิดอยู่

อ้างอิง: [17F.4A re-audit](./PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md), [17F.2B contract](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md), [17F.3 implementation](./PHASE_17F3_FAMILY_INVITATION_QR_IMPLEMENTATION.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md).

## 1. รอบทดสอบและความปลอดภัยของข้อมูล

| รายการ | ผู้ทดสอบกรอก |
| --- | --- |
| Tested immutable commit SHA | |
| Environment HTTPS URL / hostname | |
| วันที่/เวลาพร้อม timezone | |
| ผู้ทดสอบ / evidence owner | |
| ยืนยัน synthetic/demo data only (UAT-DATA-01) | |
| ยืนยัน actors/roles ตาม UAT-ACTOR-01; ไม่มี credentials ในเอกสาร | |
| Feature flag `FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED` ในรอบนี้ | |
| ขอบเขต browser support ที่ตกลงใช้กับ UAT รอบนี้ | |
| Evidence storage ที่จำกัดสิทธิ์และลบ token/PII จากภาพแล้ว | |

ก่อนเริ่มให้ตรวจ commit ที่ deploy จริงและ hostname HTTPS ที่อุปกรณ์เข้าถึงได้ ใช้ข้อมูลที่สร้างขึ้นเพื่อทดสอบ ไม่คัดลอก production Patient records บันทึก account aliases ต่อไปนี้แทนตัวตนจริง ส่วน credentials เก็บนอก repository ตามช่องทาง UAT ที่ได้รับอนุญาต เมื่อหลักฐานอาจมี QR/URL fragment ให้ปิดบัง secret โดยไม่ปิดบังข้อสังเกตที่ต้องตรวจ ใช้ invitation ใหม่และ revoke secret ที่เผยในภาพ/clipboard หลังทดสอบ

## 2. Synthetic actors และขอบเขต

H1/H2/H3 เป็น Hospital ทดสอบคนละ entity; PHR A-H1, A-H2, A-H3, B-H1 เป็นคนละ persisted relationship ไม่ใช่ Hospital label ที่ใช้แทน ID ให้ตั้งแต่ละ scenario ด้วย invitation/relationship/grant ใหม่เมื่อ terminal state ของรอบก่อนขัดกับ setup

| Alias | Expected roles / Patient mapping | Hospital / Family / grant setup | Allowed / denied scope |
| --- | --- | --- | --- |
| Patient A | PATIENT; exact User↔Person↔PatientProfile A | own A-H1 และ A-H2; A-H3 สร้างภายหลัง; designate C1/C2/C3/C4 แยก relationships | SELF management/proposal/revoke ของ A เท่านั้น; B และ B-H1 denied |
| Patient B | PATIENT; exact profile B แยกจาก A | B-H1 ที่ Hospital H1 เดียวกัน; relationship กับ C1 ได้แยกจาก A | own B scope; A denied |
| C1 caregiver-only | ไม่มี PATIENT/OSM/HOSPITAL/ADMIN; ไม่มี PatientProfile | intended recipient ของ A; A-H1 grant เสนอแล้วรอ accept; อาจดูแล B ผ่านอีก relationship | invitation ของ C1 และ accepted exact grants เท่านั้น |
| C2 caregiver/non-PATIENT | ไม่มี PATIENT; existing ACTIVE User+Person | intended recipient invitation A อีกคู่; เริ่มไม่มี grant | relationship ได้โดยไม่เป็น Patient; relationship alone ให้ ZERO appointment access |
| C3 OSM+caregiver | OSM; ไม่มี PATIENT; ACTIVE OSM Hospital relationship ตาม test setup | intended caregiver A; accepted A-H1 grant แยกจาก OSM path | Family exact A-H1 only; OSM role ไม่ขยาย Family ไป A-H2/B |
| C4 Hospital staff+caregiver | HOSPITAL; ACTIVE H1 MEMBER หรือ OWNER ตามรอบที่รองรับ; ไม่มี PATIENT | intended caregiver A; accepted A-H1 grant แยกจาก staff path | Family exact A-H1 only; membership ไม่เพิ่ม Family authority |
| W1 wrong account | ACTIVE User+Person คนละคู่จาก intended caregiver; ไม่มี Family relationship/grant ของ target | เปิด invitation ที่ออกให้ C1/C2 | generic unavailable; preview Patient identity/accept/delegated reads denied |

สำหรับ Patient+OSM และ Patient+Hospital staff ให้ใช้ Patient A ในรอบแยกที่เพิ่ม persisted role/membership โดยไม่เปลี่ยน User/Person/profile ตรวจ SELF และ Family owner path ยัง exact A และไม่เข้าถึง B. ไม่สร้าง CAREGIVER role หรือ act-as-Patient context. บันทึก alias ที่ใช้จริงใน evidence record ทุกครั้ง

## 3. Platform coverage

| Platform code | Required surface | Device/browser/version field | Coverage/result field |
| --- | --- | --- | --- |
| IOS | iPhone camera → iOS Safari | | |
| AND | Android camera → Chrome | | |
| LINE | LINE in-app browser บน iOS หรือ Android; ระบุ OS และ LINE version | | |
| DESK | Desktop Chrome control; QR แสดงบนอีกอุปกรณ์เมื่อทดสอบ camera | | |
| FB | Facebook in-app browser เฉพาะเมื่ออยู่ใน declared support target; ถ้าไม่รองรับให้บันทึก NOT IN TARGET พร้อมเหตุผล | | |

กรณี S01–S21 ด้านล่างต้องมี record แยกต่อ platform ที่เกี่ยวข้องบน IOS/AND/LINE/DESK; FB ต้องทำเช่นเดียวกันเมื่อเป็น support target. กรณี camera ให้ desktop เป็น display/control แล้วใช้ physical IOS/AND camera ไม่ถือว่า desktop simulation พิสูจน์ camera ได้ หาก scenario ใช้ไม่ได้กับ platform ให้บันทึก NOT APPLICABLE พร้อมเหตุผลจริง ห้ามเปลี่ยนเป็น PASS

## 4. Scenario matrix

ทุกแถวกำหนด setup/actor/steps/expected/sensitive observation แล้วใช้แบบบันทึกในข้อ 5 ต่อ scenario × platform × lifecycle โดยอ้าง scenario ID ไม่ใส่ token จริง

| ID / scenario | Setup / actor | Exact steps | Expected result | Sensitive observation |
| --- | --- | --- | --- | --- |
| S01 Anonymous QR scan | A สร้าง PENDING invite ให้ C1; browser ไม่มี session | แสดง QR บนอีกอุปกรณ์ → camera scan → เปิด HTTPS → login C1 → ตรวจ destination → preview → explicit accept | login guidance ไม่เปิดเผย A ก่อน auth; หลัง login กลับ invitation flow ให้ C1 preview และ accept ได้; scan/login ไม่ auto-accept | จด redirect chain/path โดย redact token; fragment อาจถูก server redirect ก่อน child hydration ต้องตรวจผลจริง |
| S02 Authenticated exact recipient scan | C1 login อยู่; fresh PENDING invite | scan/open QR → อ่าน preview → ตรวจ DB state ก่อนกด → accept | bounded name/status/expiry/version; state ยัง PENDING จน explicit accept; ACTIVE relationship ไม่สร้าง appointment grant | token removal, no automatic mutation, preview fields |
| S03 Authenticated wrong account scan | W1 login อยู่; invite ให้ C1 | scan/open → preview → พยายาม accept ถ้ามี UI → กลับ/login intended account ตาม supported flow | generic unavailable เหมือน unknown/unavailable token; ไม่เปิดเผย A; W1 accept ไม่ได้ | ไม่บันทึก secret; ตรวจว่า error ไม่บอก account existence |
| S04 Caregiver without PATIENT | C2 ไม่มี PATIENT/profile | A issue invite → C2 scan/login → accept → management | exact C2 accept ได้; caregiver projection ผู้ที่คุณดูแล; relationship alone ไม่มี Patient-resource authority | role/profile ไม่ถูกสร้างหรือแก้จาก acceptance |
| S05 Multi-role caregiver | C3 และ C4 ใช้รอบแยก; A-H1 accepted grant, A-H2/B-H1 foreign | scan/accept relationship ถ้าจำเป็น → accept exact grant → เปิด list/detail → เปิด foreign locators | own exact grant only; OSM/Hospital role ไม่ขยาย Family authority | อย่าสับสน Family กับ independent Hospital/OSM routes; จด route ที่ทดสอบ |
| S06 Accepted QR reopened | invitation ACCEPTED | reopen old QR/link → refresh → back/forward | ไม่สร้าง relationship ซ้ำ; ไม่ auto-share appointment; terminal invitation cannot accept again | stale preview/UI ต้องไม่สร้าง authority |
| S07 Rejected QR reopened | C1 explicit reject | reopen QR/link → พยายาม accept | terminal REJECTED; activate ไม่ได้; no Patient-resource access | record terminal message โดยไม่เพิ่ม token evidence |
| S08 Revoked QR reopened | A revoke PENDING invite | reopen old QR/link → login C1 → พยายาม accept | terminal REVOKED; QR ไม่ revive invite | การเปิดจาก camera/clipboard ต้องได้ semantics เดียวกัน |
| S09 Expired QR | invitation อายุเกิน DB-clock 24h; setup disposable synthetic fixture | open/scan after expiry → preview/accept | unavailable/expired bounded behavior; ไม่ activate | บันทึก setup clock/expiry timestamp; ไม่แก้ production DB หรืออ้าง browser clock เป็น authority |
| S10 Browser refresh | fresh invite / accepted grant ในรอบแยก | refresh issuance SUCCESS, preview, list/detail; ตรวจ URL | issuance secret/QR ไม่ recover จาก storage; preview lifecycle rechecked; list/detail current authority | URL fragment, transient UI state, storage ไม่มี token persistence feature |
| S11 Back navigation | เปิด invitation แล้วไป management; grant ถูก revoke อีก session | browser back → forward → refresh protected page | fresh read หลัง commit denied; prior rendered content อาจค้าง browser memory ต้องบันทึก ไม่ถือว่า recall guarantee | แยก cached displayed content จาก fresh server response |
| S12 BFCache/back-forward restore | สอง tabs/sessions; authority active แล้ว terminate อีก tab | navigate away → revoke/withdraw → browser back/forward restore → interact/refresh | record restore behavior; fresh protected request denied; ไม่มี mutation/authority จาก restored UI | ตรวจ pageshow/back-forward behavior จริง; automation ไม่ใช้แทน device evidence |
| S13 Same-device copy link | fresh PENDING invite; warning visible | copy → เปิด link ใน browser เดียวกัน/อีก browser บนอุปกรณ์เดียวกัน → exact recipient login/preview | copy string = exact QR invitationLink; explicit accept required | clipboard เป็น secret; warning visible; redacted evidence only |
| S14 Second-device QR | desktop/mobile แสดง QR; physical second device เป็น C1 | scan จากอุปกรณ์ที่สอง → HTTPS/login/preview → accept | exact account-bound transport; forwarded QR ให้ W1 ไม่โอน authority | browser/open-app destination, deployed origin, fragment handling |
| S15 Login failure then retry | anonymous flow ให้ C1 | scan → login ด้วย credentials ทดสอบไม่ถูกต้อง → retry ด้วยบัญชี C1 → ตรวจ destination | safe login error; returnTo ถูกตรวจซ้ำ; valid retry ถึง intended flow หรือ record defect; no anonymous identity | ห้ามบันทึก password/fields; ระบุ fragment/return destination เมื่อ retry |
| S16 Already-authenticated `/login#token` | C1 มี session; fresh token | เปิด supported invitation fragment ที่ `/login#token` → ดู redirect และ address bar | ต้องตรวจผลจริง: server อาจ redirect `/app` ก่อน client strip; no silent assumption of token containment/handoff success | บันทึก destination และ fragment residue; ปัญหานี้คง L04 จนมี runtime evidence |
| S17 Fragment removal / invalid transport | exact recipient และ anonymous ในรอบแยก | เปิด valid fragment → hydration; เปิด malformed fragment/query-token/path-token/external return target | valid fragment removed on supported hydrated invitation path; invalid return/transport denied or safe fallback `/app`; no identity leakage | address bar, history, request URL/referrer; redact token; no-referrer/noindex expectation |
| S18 Redirect destination | anonymous C1 และ logged-in W1 | scan → login; ตรวจ destination/return target; ทดลอง bounded invalid return values | exact bounded Family handoff only; arbitrary/external return denied; fallback `/app` | source-level validation ไม่พิสูจน์ browser fragment inheritance; record actual chain |
| S19 Screenshot/clipboard warning | issuance SUCCESS panel | ดู warning ก่อน copy; screenshot UI โดย mask QR/token; keyboard/screen reader ถ้ารองรับรอบ UAT | warning อธิบาย secret/forwarding/recall limit; copy ยังใช้ได้; no download/print/share features | screenshot ไม่เผย live QR/token; ไม่มี claim ว่าป้องกัน OS screenshot ได้ |
| S20 QR generation failure fallback | controlled synthetic test build/environment ที่ fail local QR generator; ระบุวิธีจริง | trigger failure → ดู error → copy link → เปิด/preview | generic Thai fallback; copy link ยังใช้ได้; no secret/stacktrace logs; no authority mutation | ระบุ injected failure method/commit; ถ้าทำไม่ได้ให้ NOT EXECUTED ไม่ prefill PASS |
| S21 Physical scan reliability / HTTPS | fresh QR ที่ approved deployed HTTPS hostname | scan ที่ความสว่าง/zoom/distance ใช้งานปกติหลายครั้ง; จดค่าที่ใช้และ device; ตรวจ destination | plain black/white QR/quiet zone อ่านได้ในค่าที่บันทึก; exact HTTPS invitationLink; no Patient identity payload | effective QR size, ambient light, brightness, distance, focus; ผลเฉพาะ device/config ที่ทดสอบ ไม่ใช่ universal certification |

## 5. แบบบันทึกต่อการดำเนินการจริง

คัดลอก block นี้ต่อทุก scenario/platform และทุก variant ที่ทดสอบ เก็บผลล้มเหลวด้วย ไม่เลือกเฉพาะครั้งที่สำเร็จ ถ้าผลยังไม่ครบให้เว้น PASS/FAIL และระบุ NOT EXECUTED ใน notes; NOT APPLICABLE ต้องมีเหตุผล

| Execution field | Actual evidence entry |
| --- | --- |
| Record ID / scenario ID / variant | |
| Tested commit SHA (deploy และ test fixture ถ้าต่างกัน) | |
| Environment HTTPS URL | |
| Synthetic/demo-data confirmation | |
| Platform code / physical device model | |
| OS / browser / app version | |
| Actor alias / persisted expected roles | |
| Setup / invitation-parent-grant lifecycle before execution (opaque aliases only) | |
| Exact steps actually performed | |
| Expected result / sensitive observation from matrix | |
| Actual result / redirect destination / fragment removed or retained | |
| PASS / FAIL | |
| Screenshot/video/network/evidence reference (redacted) | |
| Notes / limitation / NOT EXECUTED or NOT APPLICABLE reason | |
| Timestamp with timezone | |
| Tester | |

## 6. J1–J15 synthetic end-to-end manual journeys

Automated/service/DB coverage ดูรายงาน 17F.4A; ตารางนี้ระบุเส้นทาง UI ที่ต้องบันทึกเพิ่ม ใช้แบบบันทึกข้อ 5 โดยเพิ่ม Journey ID และ device ไม่มีแถวใดเป็นผล PASS ที่ดำเนินการแล้ว

| Journey | Setup / actor / steps | Expected manual result / sensitive observation | Actual result / evidence record |
| --- | --- | --- | --- |
| J1 Relationship happy path | A issue → C1 opens → exact preview → explicit accept | ACTIVE exact relationship; no auto appointment grant; S01/S02 | |
| J2 Wrong recipient | A issue to C1 → W1 opens/attempts accept | generic unavailable/no identity/no acceptance; S03 | |
| J3 Pending invite revoke | A issue → A revoke → C1 old link/QR | cannot activate; S08 | |
| J4 Rejection | C1 reject → reopen/attempt accept | terminal; S07 | |
| J5 Parent revoke | ACTIVE parent + grant → A revoke relationship → C1 fresh list/detail | all children denied after commit; previous rendering limitation recorded | |
| J6 Caregiver withdrawal | ACTIVE parent + grant → C1 withdraw → fresh list/detail | exact parent terminal/all children denied; A account/data unchanged | |
| J7 Appointment sharing | ACTIVE parent → A proposes A-H1 → C1 explicit grant accept → list/detail | exactly six disclosed fields; no notes/HN/staff/clinical payload | |
| J8 Cross-Hospital | A-H1 accepted grant only → try A-H2 list/detail/cursor | foreign PHR denied; no Hospital inheritance | |
| J9 Future appointment | add eligible synthetic same A-H1 appointment → C1 fresh list | enters feed without reacceptance; same six fields | |
| J10 New Hospital | create A-H3 → try appointment without separate grant | denied until new exact proposal+acceptance | |
| J11 Grant revoke | ACTIVE grant → A revoke → C1 refresh/list/detail/old continuation | immediate fresh-read deny; parent/other grants unaffected | |
| J12 Temporary eligibility | suspend Hospital/User or remove Patient PATIENT role in isolated fixture → fresh read → restore same identity/entity | deny then unchanged unrevoked scope resumes; terminal grants never resume | |
| J13 Parent replacement | revoke/withdraw old parent → new invitation+accept → use old grant URL | old grant not inherited; new sharing needs separate acceptance | |
| J14 Feature gate | flag disabled deployment → relationship workflow → grant operations/read; enabled separate round | Family relationship still works; all delegated operations deny while disabled | |
| J15 QR transport | compare copy URL/decoded QR in redacted observation → scan/open → inspect state before explicit accept | identical existing link; ZERO authority from scan/render; S02/S13/S14/S21 | |

## 7. L04 closure evidence gate

ผู้ทบทวนต้องประเมิน BOTH: automated/security/database re-audit ผ่านโดยไม่มี unresolved P0/P1 และ required actual device/browser evidence ครบ ห้ามปิดจาก automated PASS เพียงอย่างเดียว

| Minimum required actual evidence | Record/evidence reference | Reviewer conclusion |
| --- | --- | --- |
| Physical iOS หรือ Android camera → deployed HTTPS invitation flow | | |
| Anonymous login handoff พร้อม actual destination/fragment behavior | | |
| Exact recipient explicit acceptance | | |
| Wrong recipient generic unavailable/no acceptance | | |
| Terminal QR replay: accepted/rejected/revoked/expired | | |
| Fragment containment/removal; authenticated `/login#token`; redirect-before-hydration cases | | |
| อย่างน้อยหนึ่ง in-app browser ใน declared support target | | |
| Deployed approved HTTPS hostname และ QR scan reliability observation | | |
| Refresh/back/BFCache, login retry, copy/warning, QR failure fallback ตาม support matrix | | |
| Automated re-audit report / commit และ unresolved defect review | | |

Closure decision / reviewer / timestamp: ____________________

หากยังไม่มีหลักฐานจริงครบ ให้รายงาน **P17F-L04 = OPEN — REAL-DEVICE UAT PENDING; Phase 17F overall = NOT CLOSED** ต่อไป แม้ 17F.4A automated re-audit = PASS. Device evidence นี้ไม่ปิด Q5 ไม่อนุมัติ real-data use และไม่ปิด L05. Distributed/shared abuse protection ยังคงเป็น deployment hardening gate; in-process throttling/uniqueness ไม่ใช่หลักฐาน production abuse protection
