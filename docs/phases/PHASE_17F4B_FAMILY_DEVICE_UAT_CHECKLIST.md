# Phase 17F.4B — Family / Caregiver Real-device UAT Checklist

เอกสารนี้เป็นแบบบันทึกหลักฐานด้วยอุปกรณ์และเบราว์เซอร์จริงสำหรับ `bait0ngxaxa/demi` ไม่ใช่ผลการทดสอบที่ดำเนินการแล้ว สถานะ scenario และ readiness ต้องบันทึกตามสิ่งที่ตรวจได้; PASS/FAIL ใช้เฉพาะ scenario ที่ execute จริง ส่วนกรณีที่ยังไม่ทำต้องระบุ NOT EXECUTED. ดูผล readiness ใน Section 8. ผล Node/unit/PostgreSQL integration ใช้แทนหลักฐาน camera, redirect, fragment, in-app browser หรือ scan reliability ไม่ได้

สถานะตั้งต้น: **P17F-L04 OPEN — REAL-DEVICE UAT PENDING; Phase 17F overall NOT CLOSED**. P17F-L05 OPEN / FUTURE; Q5 real Patient delegated-data use GOVERNANCE BLOCKED. ใช้ synthetic/demo data เท่านั้น ไม่ใส่รหัสผ่าน credentials token จริง National ID HN หรือ Patient PII ในเอกสาร/ภาพหลักฐาน ไม่เปิดใช้ข้อมูลจริงเพียงเพราะ automated re-audit ผ่านหรือ feature flag เปิดอยู่

อ้างอิง: [17F.4A re-audit](./PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md), [17F.2B contract](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md), [17F.3 implementation](./PHASE_17F3_FAMILY_INVITATION_QR_IMPLEMENTATION.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md).

## 1. รอบทดสอบและความปลอดภัยของข้อมูล

| รายการ | ผู้ทดสอบกรอก |
| --- | --- |
| Tested immutable commit SHA | NONE — DEPLOYMENT SHA UNVERIFIED; local source HEAD ไม่ถือเป็น deployed/tested SHA |
| Environment HTTPS URL / hostname | NOT PROVIDED / NOT VERIFIED |
| วันที่/เวลาพร้อม timezone | ประเมินความพร้อม 2026-10-02 11:47 Asia/Bangkok; ไม่มี scenario execution |
| ผู้ทดสอบ / evidence owner | Codex ทำ readiness assessment เท่านั้น; ไม่มี scenario tester/evidence owner |
| ยืนยัน synthetic/demo data only (UAT-DATA-01) | ไม่มีการเข้าถึง environment/data; ไม่ใช้ Patient data จริง; synthetic actors ยังไม่ verified |
| ยืนยัน actors/roles ตาม UAT-ACTOR-01; ไม่มี credentials ในเอกสาร | NOT EXECUTED — ไม่มี synthetic deployment/account ให้ตรวจ; ไม่บันทึก credentials |
| Feature flag `FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED` ในรอบนี้ | UNKNOWN — ไม่ทราบค่าที่ deploy; .env.example ไม่ใช่หลักฐาน deployment |
| ขอบเขต browser support ที่ตกลงใช้กับ UAT รอบนี้ | Desktop Chrome, physical iOS Safari, physical Android Chrome, LINE in-app browser; Facebook ไม่อยู่ใน minimum target รอบนี้ |
| Evidence storage ที่จำกัดสิทธิ์และลบ token/PII จากภาพแล้ว | ไม่มี screenshot/video/network artifact; ไม่มี token หรือ PII ถูกเก็บ |

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
| IOS | iPhone camera → iOS Safari | ไม่มีอุปกรณ์/OS/browser version ให้ตรวจ | NOT EXECUTED — DEPLOYMENT SHA UNVERIFIED |
| AND | Android camera → Chrome | ไม่มีอุปกรณ์/OS/browser version ให้ตรวจ | NOT EXECUTED — DEPLOYMENT SHA UNVERIFIED |
| LINE | LINE in-app browser บน iOS หรือ Android; ระบุ OS และ LINE version | ไม่มีอุปกรณ์/OS/LINE version ให้ตรวจ | NOT EXECUTED — DEPLOYMENT SHA UNVERIFIED |
| DESK | Desktop Chrome control; QR แสดงบนอีกอุปกรณ์เมื่อทดสอบ camera | Chrome เห็นเฉพาะ ChatGPT tab; version ไม่ทราบ | NOT EXECUTED — ไม่มี UAT URL/SHA หรือ second device |
| FB | Facebook in-app browser เฉพาะเมื่ออยู่ใน declared support target; ถ้าไม่รองรับให้บันทึก NOT IN TARGET พร้อมเหตุผล | ไม่ประกาศเป็น target ใน minimum scope นี้ | NOT IN TARGET for this UAT: declared minimum คือ Desktop Chrome, iOS Safari, Android Chrome และ LINE; ไม่อ้าง Facebook support |

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
| J1 Relationship happy path | A issue → C1 opens → exact preview → explicit accept | ACTIVE exact relationship; no auto appointment grant; S01/S02 | NOT EXECUTED — ดู Section 8 |
| J2 Wrong recipient | A issue to C1 → W1 opens/attempts accept | generic unavailable/no identity/no acceptance; S03 | NOT EXECUTED — ดู Section 8 |
| J3 Pending invite revoke | A issue → A revoke → C1 old link/QR | cannot activate; S08 | NOT EXECUTED — ดู Section 8 |
| J4 Rejection | C1 reject → reopen/attempt accept | terminal; S07 | NOT EXECUTED — ดู Section 8 |
| J5 Parent revoke | ACTIVE parent + grant → A revoke relationship → C1 fresh list/detail | all children denied after commit; previous rendering limitation recorded | NOT EXECUTED — ดู Section 8 |
| J6 Caregiver withdrawal | ACTIVE parent + grant → C1 withdraw → fresh list/detail | exact parent terminal/all children denied; A account/data unchanged | NOT EXECUTED — ดู Section 8 |
| J7 Appointment sharing | ACTIVE parent → A proposes A-H1 → C1 explicit grant accept → list/detail | exactly six disclosed fields; no notes/HN/staff/clinical payload | NOT EXECUTED — ดู Section 8 |
| J8 Cross-Hospital | A-H1 accepted grant only → try A-H2 list/detail/cursor | foreign PHR denied; no Hospital inheritance | NOT EXECUTED — ดู Section 8 |
| J9 Future appointment | add eligible synthetic same A-H1 appointment → C1 fresh list | enters feed without reacceptance; same six fields | NOT EXECUTED — ดู Section 8 |
| J10 New Hospital | create A-H3 → try appointment without separate grant | denied until new exact proposal+acceptance | NOT EXECUTED — ดู Section 8 |
| J11 Grant revoke | ACTIVE grant → A revoke → C1 refresh/list/detail/old continuation | immediate fresh-read deny; parent/other grants unaffected | NOT EXECUTED — ดู Section 8 |
| J12 Temporary eligibility | suspend Hospital/User or remove Patient PATIENT role in isolated fixture → fresh read → restore same identity/entity | deny then unchanged unrevoked scope resumes; terminal grants never resume | NOT EXECUTED — ดู Section 8 |
| J13 Parent replacement | revoke/withdraw old parent → new invitation+accept → use old grant URL | old grant not inherited; new sharing needs separate acceptance | NOT EXECUTED — ดู Section 8 |
| J14 Feature gate | flag disabled deployment → relationship workflow → grant operations/read; enabled separate round | Family relationship still works; all delegated operations deny while disabled | NOT EXECUTED — ดู Section 8 |
| J15 QR transport | compare copy URL/decoded QR in redacted observation → scan/open → inspect state before explicit accept | identical existing link; ZERO authority from scan/render; S02/S13/S14/S21 | NOT EXECUTED — ดู Section 8 |

## 7. L04 closure evidence gate

ผู้ทบทวนต้องประเมิน BOTH: automated/security/database re-audit ผ่านโดยไม่มี unresolved P0/P1 และ required actual device/browser evidence ครบ ห้ามปิดจาก automated PASS เพียงอย่างเดียว

| Minimum required actual evidence | Record/evidence reference | Reviewer conclusion |
| --- | --- | --- |
| Physical iOS หรือ Android camera → deployed HTTPS invitation flow | | NOT EXECUTED — ไม่มีอุปกรณ์จริงและ deployment ที่ตรวจ SHA ได้ |
| Anonymous login handoff พร้อม actual destination/fragment behavior | | NOT EXECUTED — ไม่พบ deployed URL/SHA |
| Exact recipient explicit acceptance | | NOT EXECUTED — ไม่มี synthetic actor/environment |
| Wrong recipient generic unavailable/no acceptance | | NOT EXECUTED — ไม่มี synthetic actor/environment |
| Terminal QR replay: accepted/rejected/revoked/expired | | NOT EXECUTED — ไม่มี invitation test fixtures/environment |
| Fragment containment/removal; authenticated `/login#token`; redirect-before-hydration cases | | NOT EXECUTED — actual browser navigation ไม่ได้ตรวจ |
| อย่างน้อยหนึ่ง in-app browser ใน declared support target | | NOT EXECUTED — ไม่มี physical device/LINE session |
| Deployed approved HTTPS hostname และ QR scan reliability observation | | NOT EXECUTED — hostname/QR/device ไม่พร้อมตรวจ |
| Refresh/back/BFCache, login retry, copy/warning, QR failure fallback ตาม support matrix | | NOT EXECUTED — S20 controlled failure injection ก็ไม่ได้เตรียม |
| Automated re-audit report / commit และ unresolved defect review | [17F.4A re-audit](./PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md), source HEAD 12c63c933e5a0d7de6e65a24621c123f35f17a49 | PASS เป็น prerequisite เท่านั้น; ไม่มี unresolved P0/P1/P2 ตามรายงาน |

Closure decision / reviewer / timestamp: **P17F-L04 OPEN — BLOCKED BEFORE SCENARIO EXECUTION; DEPLOYMENT SHA UNVERIFIED.** Codex readiness assessment / 2026-10-02 11:47 Asia/Bangkok.

หากยังไม่มีหลักฐานจริงครบ ให้รายงาน **P17F-L04 = OPEN — REAL-DEVICE UAT PENDING; Phase 17F overall = NOT CLOSED** ต่อไป แม้ 17F.4A automated re-audit = PASS. Device evidence นี้ไม่ปิด Q5 ไม่อนุมัติ real-data use และไม่ปิด L05. Distributed/shared abuse protection ยังคงเป็น deployment hardening gate; in-process throttling/uniqueness ไม่ใช่หลักฐาน production abuse protection

## 8. ผล readiness assessment และสถานะการดำเนินการ

บันทึกนี้เป็นผลการตรวจความพร้อม ไม่ใช่การอ้างว่าได้รัน S/J แล้ว หยุดก่อน scenario ตามเงื่อนไขที่กำหนด เพราะไม่พบ HTTPS UAT URL หรือหลักฐาน deployed SHA ในเอกสาร/config ที่ตรวจ และไม่มี target device/browser session สำหรับการทดสอบอุปกรณ์จริงในเครื่องมือนี้ สถานะต้องเป็น BLOCKED จนกว่าจะยืนยัน deployment และมีอุปกรณ์จริง

| รายการ | ผลที่ตรวจได้ |
| --- | --- |
| Starting HEAD | 12c63c933e5a0d7de6e65a24621c123f35f17a49 — ตรง expected baseline; working tree สะอาดก่อนจัดทำเอกสาร |
| Tested/deployed commit SHA | ไม่มี — **DEPLOYMENT SHA UNVERIFIED**; ห้ามอนุมานจาก local HEAD |
| HTTPS URL / deployment ID / deployment timestamp | ไม่มีข้อมูลที่ระบุ deployment สำหรับ synthetic UAT |
| Browser inventory | CUA พบ Chrome หนึ่ง tab ไป ChatGPT; ไม่พบ UAT site หรือ session ของ product; browser/app version ไม่ทราบ |
| Physical devices | ไม่มี physical iPhone/Android/camera/LINE device session ให้ทดสอบผ่านเครื่องมือนี้ |
| Synthetic/demo actors | ไม่มีการ login, สร้าง actor, เปิด invitation หรือแก้ lifecycle; actor/role setup ยังไม่ verified |
| Patient data | ไม่มีการเข้าถึงข้อมูล; ไม่มี real Patient data ใช้ |
| Feature flag | UNKNOWN; .env.example มีค่า default false แต่ไม่ยืนยันค่าของ deployment |
| Evidence artifacts | ไม่มี screenshot/video/network trace หรือ scenario evidence; ไม่มี token/credentials/PII ถูกเก็บ |

### สถานะ S01–S21

ทุกกรณีด้านล่างเป็น **NOT EXECUTED** ด้วยเหตุผลร่วม: deployment HTTPS และ SHA ยังยืนยันไม่ได้ และไม่มี synthetic UAT environment/device พร้อมทดสอบ รายละเอียดขั้นตอนและ expected result ยังคงตาม scenario matrix ใน Section 4

| Scenario | สถานะ | หมายเหตุ |
| --- | --- | --- |
| S01 Anonymous QR scan | NOT EXECUTED | ไม่เห็น redirect, login handoff หรือ post-login state จริง |
| S02 Authenticated exact recipient scan | NOT EXECUTED | ไม่มี C1/session/invitation |
| S03 Authenticated wrong-account scan | NOT EXECUTED | ไม่มี W1/session/invitation |
| S04 Caregiver without PATIENT | NOT EXECUTED | ไม่มี C2 account ให้ตรวจ |
| S05 Multi-role caregiver | NOT EXECUTED | ไม่มี C3/C4 หรือ grant |
| S06 Accepted QR reopened | NOT EXECUTED | ไม่มี accepted QR |
| S07 Rejected QR reopened | NOT EXECUTED | ไม่มี rejected QR |
| S08 Revoked QR reopened | NOT EXECUTED | ไม่มี revoked QR |
| S09 Expired QR | NOT EXECUTED | ไม่มี synthetic fixture/DB-clock lifecycle |
| S10 Browser refresh | NOT EXECUTED | ไม่มี UAT page/session |
| S11 Back navigation | NOT EXECUTED | ไม่มี UAT page หรือ revoke round |
| S12 BFCache/back-forward restoration | NOT EXECUTED | ไม่มี device/browser authority-revoke round |
| S13 Same-device copy link | NOT EXECUTED | ไม่มี issuance SUCCESS state |
| S14 Second-device QR scan | NOT EXECUTED | ไม่มี QR หรือ physical second device |
| S15 Login failure then retry | NOT EXECUTED | ไม่มี UAT login flow; ไม่มี credentials ถูกกรอก |
| S16 Already-authenticated /login#token | NOT EXECUTED | redirect, fragment และ destination จริงไม่ทราบ |
| S17 Fragment removal / invalid transport | NOT EXECUTED | fragment/query/path/returnTo behavior จริงไม่ทราบ |
| S18 Redirect destination / bounded returnTo | NOT EXECUTED | ไม่มี deployed redirect chain |
| S19 Screenshot/clipboard warning | NOT EXECUTED | ไม่มี issuance UI; ไม่มี screenshot/clipboard evidence |
| S20 QR generation failure fallback | NOT EXECUTED — controlled failure injection unavailable | ไม่มี controlled synthetic UAT build/environment สำหรับฉีด failure; ไม่ได้อ้าง PASS |
| S21 Physical QR scan reliability / HTTPS | NOT EXECUTED | ไม่มี deployed QR, hostname หรือ physical camera |

### สถานะ J1–J15 และ closure gate

J1–J15 ทุก journey เป็น **NOT EXECUTED**: J1 relationship happy path, J2 wrong recipient, J3 pending invite revoke, J4 rejection, J5 parent revoke, J6 caregiver withdrawal, J7 appointment sharing, J8 cross-Hospital, J9 future appointment, J10 new Hospital, J11 grant revoke, J12 temporary eligibility, J13 parent replacement, J14 feature gate, J15 QR transport — ไม่มีข้อใดเริ่มรัน

| กลุ่มผล | PASS | FAIL | NOT EXECUTED |
| --- | ---: | ---: | ---: |
| S01–S21 scenarios | 0 | 0 | 21 |
| J1–J15 journeys | 0 | 0 | 15 |
| รวม planned manual cases | 0 | 0 | 36 |

FAIL = 0 หมายถึงไม่มี scenario ที่ถูกรันแล้วล้มเหลว; ไม่ใช่ผลผ่านหรือการล้าง defect จาก UAT. Closure gate ที่ยังขาด: physical iOS/Android camera→HTTPS, anonymous login handoff, exact acceptance, wrong-account generic result, C2, accepted/rejected/revoked/expired replay, fragment removal/containment และ /login#token, bounded redirect, LINE, second-device QR, QR reliability, revoke/withdraw fresh-read denial, appointment grant/read, cross-Hospital isolation, field minimization และ feature gate state.

P17F.4A automated/security/PostgreSQL re-audit ยังคงเป็น **PASS** ตามรายงานที่ HEAD ข้างต้น รวมถึงไม่มี unresolved P0/P1/P2 ในรายงานนั้น แต่ไม่ทดแทน closure evidence จริง. P17F-L04 = **OPEN**; Phase 17F.4B = **BLOCKED**; Phase 17F overall = **NOT CLOSED**. Q5 = **GOVERNANCE BLOCKED**; P17F-L05 = **OPEN / FUTURE**. ไม่มี runtime defect ที่สังเกตจาก UAT เพราะไม่มี UAT scenario ถูก execute; ไม่มี fix หรือ retest commit.
