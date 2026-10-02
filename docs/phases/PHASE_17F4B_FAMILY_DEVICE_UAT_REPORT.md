# Phase 17F.4B — Family Real-device / Browser UAT Report

## ผลการประเมิน

**Phase 17F.4B = BLOCKED ก่อนเริ่ม scenario. P17F-L04 = OPEN.** Deployment SHA และ HTTPS URL สำหรับ synthetic UAT ยังยืนยันไม่ได้ จึงหยุดการประเมิน closure ตาม stop condition. ไม่มีการอ้างว่า scenario ใดผ่านหรือไม่ผ่าน และไม่มีผลจาก source review, unit/integration tests หรือ browser emulation ถูกนับเป็นหลักฐานอุปกรณ์จริง

## 1. Commit และ environment

| รายการ | ผล |
| --- | --- |
| Actual starting HEAD | 12c63c933e5a0d7de6e65a24621c123f35f17a49 — fix(phase-17f4a): preserve grant acceptance evidence |
| Tested commit SHA | ไม่มี — **DEPLOYMENT SHA UNVERIFIED** |
| Deployed commit SHA | ไม่มีข้อมูลยืนยัน; ห้ามสมมติว่า deployed SHA = local HEAD |
| Deployed HTTPS URL / hostname | NOT PROVIDED / NOT VERIFIED |
| Deployment ID / deployment timestamp | ไม่มีข้อมูล |
| Readiness assessment timestamp | 2026-10-02 11:47 Asia/Bangkok |
| Runtime code changes / fix / retest commits | ไม่มี |
| Repository state ก่อนแก้เอกสาร | main ตรง origin/main, working tree สะอาด |

การตรวจเฉพาะชื่อ configuration พบว่า .env.example ตั้งค่า FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED=false เป็น default เท่านั้น; ไม่ทราบค่าของ deployment และไม่มีการเปลี่ยน feature flag. ห้ามใช้ค่านี้แทนหลักฐาน runtime.

## 2. Synthetic-data statement และ actors

ไม่มีการเข้า environment, login, เปิด invitation, ใช้ actor, สร้าง/แก้ relationship หรือแตะข้อมูล Patient ในการประเมินครั้งนี้. **ไม่มี real Patient data ใช้.** เนื่องจากไม่มี UAT deployment ที่ยืนยันได้ synthetic/demo status และ actors Patient A/B, C1–C4 และ W1 จึงยังไม่ได้เตรียมหรือ verify. ไม่มี credentials, token, National ID, HN, session cookie หรือ PII ในเอกสารนี้.

## 3. Platform support target และอุปกรณ์

Declared minimum target สำหรับ UAT นี้อิงตาม requirement: Desktop Chrome control, physical iPhone/iOS Safari, physical Android/Chrome และ LINE in-app browser บน physical iOS หรือ Android. Facebook in-app browser = **NOT IN TARGET for this UAT** เพราะ declared minimum support target ระบุ LINE และไม่ได้ประกาศ Facebook; ไม่มี Facebook compatibility claim.

| Platform | Device / OS / browser-app version | ผล |
| --- | --- | --- |
| Desktop Chrome | Chrome tab ที่ inventory พบเปิด ChatGPT; version ไม่ทราบ | NOT EXECUTED — ไม่มี UAT URL/SHA |
| iPhone / iOS Safari | ไม่มีอุปกรณ์จริงให้ session นี้เข้าถึง; version ไม่ทราบ | NOT EXECUTED |
| Android / Chrome | ไม่มีอุปกรณ์จริงให้ session นี้เข้าถึง; version ไม่ทราบ | NOT EXECUTED |
| LINE in-app browser | ไม่มี physical LINE session; OS/app version ไม่ทราบ | NOT EXECUTED |
| Facebook in-app browser | ไม่มีการประกาศเป็น target | NOT IN TARGET ตามเหตุผลข้างต้น |

ไม่มี physical device ที่ทดสอบ, ไม่มี QR scan, ไม่มีภาพหรือวิดีโอ, ไม่มี network/redirect log และไม่มี version ที่ยืนยันได้. CUA inventory พบเพียง Chrome tab ของ ChatGPT; ข้อมูลนี้เป็น readiness observation เท่านั้น ไม่ใช่ browser UAT evidence.

## 4. Scenario execution summary S01–S21

ทุก scenario = **NOT EXECUTED** เพราะไม่มี deployed HTTPS URL/SHA ที่ verify ได้และไม่มี synthetic test environment/device session. ผลรวม S01–S21: PASS 0, FAIL 0, NOT EXECUTED 21.

| ID | Scenario | สถานะ / disposition |
| --- | --- | --- |
| S01 | Anonymous QR scan | NOT EXECUTED — redirect/login/acceptance จริงไม่สังเกต |
| S02 | Authenticated exact recipient scan | NOT EXECUTED — ไม่มี C1/session/invitation |
| S03 | Authenticated wrong-account scan | NOT EXECUTED — ไม่มี W1/session/invitation |
| S04 | Caregiver without PATIENT role | NOT EXECUTED — ไม่มี C2 ให้ตรวจ |
| S05 | Multi-role caregiver | NOT EXECUTED — ไม่มี C3/C4 หรือ exact grant |
| S06 | Accepted QR reopened | NOT EXECUTED — ไม่มี accepted QR |
| S07 | Rejected QR reopened | NOT EXECUTED — ไม่มี rejected QR |
| S08 | Revoked QR reopened | NOT EXECUTED — ไม่มี revoked QR |
| S09 | Expired QR | NOT EXECUTED — ไม่มี synthetic fixture/expiry state |
| S10 | Browser refresh | NOT EXECUTED — ไม่มี UAT session |
| S11 | Back navigation | NOT EXECUTED — ไม่มี UAT session/revocation round |
| S12 | BFCache/back-forward restoration | NOT EXECUTED — ไม่มี physical browser/revocation round |
| S13 | Same-device copy link | NOT EXECUTED — ไม่มี issuance UI |
| S14 | Second-device QR scan | NOT EXECUTED — ไม่มี physical second device/QR |
| S15 | Login failure then retry | NOT EXECUTED — ไม่มี deployed login flow; ไม่กรอก credentials |
| S16 | Already-authenticated /login#token | NOT EXECUTED — destination/fragment behavior จริงไม่ทราบ |
| S17 | Fragment removal / invalid transport | NOT EXECUTED — ไม่มี browser navigation จริง |
| S18 | Redirect destination / bounded returnTo | NOT EXECUTED — ไม่มี deployed redirect chain |
| S19 | Screenshot / clipboard warning | NOT EXECUTED — ไม่มี issuance success UI |
| S20 | QR generation failure fallback | NOT EXECUTED — controlled QR-generation failure injection unavailable |
| S21 | Physical QR scan reliability / HTTPS | NOT EXECUTED — ไม่มี deployed QR/hostname/camera |

สำหรับ S20 ไม่ได้ทำ failure injection และไม่ได้อ้าง PASS. การขาด S20 ไม่ใช่เหตุผลหลักของการเปิด L04; closure gate ยังขาดหลักฐานอุปกรณ์จริงบังคับหลายข้อ.

## 5. J1–J15 manual journey status

ทุก journey = **NOT EXECUTED**. ผลรวม J1–J15: PASS 0, FAIL 0, NOT EXECUTED 15.

| ID | Journey | สถานะ |
| --- | --- | --- |
| J1 | Relationship happy path | NOT EXECUTED |
| J2 | Wrong recipient | NOT EXECUTED |
| J3 | Pending invitation revoke | NOT EXECUTED |
| J4 | Rejection and replay | NOT EXECUTED |
| J5 | Patient revokes parent relationship | NOT EXECUTED |
| J6 | Caregiver withdraws relationship | NOT EXECUTED |
| J7 | Exact appointment grant and read | NOT EXECUTED |
| J8 | Cross-Hospital isolation | NOT EXECUTED |
| J9 | Future eligible appointment | NOT EXECUTED |
| J10 | New Hospital requires new grant | NOT EXECUTED |
| J11 | Exact appointment grant revoke | NOT EXECUTED |
| J12 | Temporary eligibility loss and restore | NOT EXECUTED |
| J13 | Parent relationship replacement | NOT EXECUTED |
| J14 | Feature gate OFF/ON | NOT EXECUTED |
| J15 | QR/copy transport equivalence | NOT EXECUTED |

## 6. Behavior findings required by the report

ไม่มีผล runtime ที่สังเกตได้สำหรับหัวข้อต่อไปนี้; แต่ละข้อยังเป็น NOT EXECUTED:

- Exact recipient: ยังไม่ยืนยัน preview หรือ explicit acceptance.
- Wrong recipient: ยังไม่ยืนยัน generic unavailable, ไม่มี Patient identity และไม่มี accept.
- Caregiver without PATIENT role: C2 ยังไม่ทดสอบ.
- Multi-role caregiver: C3 OSM+caregiver และ C4 Hospital member/owner+caregiver ยังไม่ทดสอบ.
- Accepted/rejected/revoked/expired QR replay: ทั้งสี่ lifecycle ยังไม่ทดสอบ.
- Anonymous login redirect: ไม่ทราบ redirect chain, fragment handoff หรือ post-login destination จริง.
- Already-authenticated /login#token: ไม่ได้เปิด; fragment/destination/authority behavior ไม่ทราบ.
- Fragment removal/containment และ invalid query/path/returnTo forms: ไม่ได้เปิดบน browser จริง.
- LINE in-app browser: ไม่ได้ทดสอบ.
- Second-device QR: ไม่ได้ทดสอบ.
- QR scan reliability: ไม่ได้ทดสอบ; ไม่มี model, OS, camera, display, distance, brightness หรือ scan-attempt data.
- Parent relationship revoke และ caregiver withdrawal: ไม่มี fresh-read attempt หลัง commit.
- Appointment grant proposal/acceptance/read: ไม่ได้ทดสอบ; ไม่มี UI field-minimization observation.
- Cross-Hospital isolation: ไม่มี H1/H2 list/detail/cursor/locator probe.
- Data minimization: ไม่ได้ตรวจ visible fields กับหก-field allowlist.
- Feature gate: deployment value ไม่ทราบและไม่ได้เปลี่ยน.

## 7. Redirect, fragment, in-app browser และ QR

ไม่มี actual redirect chain, address-bar URL, token-redacted browser trace, in-app browser result หรือ QR scan artifact. ผล S01/S16/S17/S18/S21 จึงเป็น NOT EXECUTED. เอกสาร 17F.4A ระบุว่า unit/source evidence ไม่พิสูจน์ fragment inheritance; finding F4A-03 ยังคงเป็น browser containment/continuity evidence gap ภายใต้ L04.

ไม่มีการบันทึก secret, URL token, credentials, screenshot หรือ clipboard contents.

## 8. Appointment authority, revocation และ cross-Hospital

Parent revoke, caregiver withdrawal, exact grant revoke, temporary eligibility restore, exact appointment disclosure, foreign Hospital denial และ feature-gate behavior ไม่ได้ทดสอบด้วย manual journey. ไม่สามารถรายงาน fresh server request denial หรือแยก browser-retained content จาก response ใหม่ได้. ผลทั้งหมด = NOT EXECUTED; ไม่มีการอนุมาน PASS จาก automated evidence.

Automated prerequisite: 17F.4A re-audit ที่ source HEAD เริ่มต้นนี้รายงาน automated/security/PostgreSQL PASS และไม่มี unresolved P0/P1/P2; ดู [17F.4A report](./PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md). ขอบเขตนี้ไม่ใช่ physical UAT evidence.

## 9. PASS / FAIL / NOT EXECUTED counts

| ชุด | PASS | FAIL | NOT EXECUTED |
| --- | ---: | ---: | ---: |
| S01–S21 | 0 | 0 | 21 |
| J1–J15 | 0 | 0 | 15 |
| รวม manual cases | 0 | 0 | 36 |

ไม่มี UAT FAIL ที่ต้อง disposition เพราะไม่มี scenario ถูก execute. ทุก NOT EXECUTED มี disposition ว่า L04 คง OPEN จนกว่าจะ verify HTTPS deployment SHA และทำ physical/browser cases ที่บังคับ.

## 10. Defect triage

### P0

ไม่พบจาก UAT; ไม่มี UAT scenario execute จึงไม่ใช่ข้อสรุปว่าได้ทดสอบและตัด P0 ออก.

### P1

ไม่พบจาก UAT; ไม่มี UAT scenario execute จึงไม่ใช่ผลทดสอบการอนุญาตผ่านอุปกรณ์จริง.

### P2

ไม่มี P2 ที่สังเกตจาก UAT. 17F.4A ระบุว่า F4A-04 P2 ได้แก้ด้วย migration 20261002130000_family_grant_pending_revoke_evidence_guard; ไม่ได้เปลี่ยนหรือ retest runtime code ใน 17F.4B.

### P3

F4A-03 เป็น P3 browser containment/continuity evidence gap ที่บันทึกไว้ก่อนหน้านี้และยัง OPEN ภายใต้ L04. ไม่ได้ reproduce หรือ reclassify จาก manual UAT ในรอบนี้. ไม่มี defect ใหม่ที่สังเกตได้.

**Readiness blocker (ไม่ใช่ product defect): DEPLOYMENT SHA UNVERIFIED.** จึงหยุดก่อน execution ตามข้อกำหนด.

## 11. Fixes และ retests

ไม่มี runtime code fix, ไม่มี redeploy และไม่มี physical-device retest commit. เอกสารนี้ไม่ปิด defect และไม่เปลี่ยน semantics.

## 12. Evidence references

| Ref | เนื้อหา | ขอบเขต |
| --- | --- | --- |
| E00 | Readiness assessment ในรายงานนี้และ checklist Section 8 | ยืนยัน starting HEAD, สถานะการหา deployment reference และ CUA inventory ที่เห็น ChatGPT tab; ไม่ใช่ UAT scenario evidence |
| E01 | [17F.4A automated/security/PostgreSQL re-audit](./PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md) ที่ starting HEAD | Automated prerequisite เท่านั้น; ไม่ใช่ physical/browser evidence |
| E02 | [17F.4B execution checklist](./PHASE_17F4B_FAMILY_DEVICE_UAT_CHECKLIST.md) | ขั้นตอน/expected result/status NOT EXECUTED |

ไม่มี screenshot, video, network trace, QR image หรือ log artifact; ไม่มี sensitive data ถูกเก็บหรือ commit.

## 13. L04 closure assessment

| Minimum gate | ผล |
| --- | --- |
| Physical iOS หรือ Android camera → deployed HTTPS invitation | NOT EXECUTED |
| Anonymous login handoff + exact recipient explicit acceptance | NOT EXECUTED |
| Wrong recipient generic unavailable/no acceptance | NOT EXECUTED |
| Caregiver without PATIENT role | NOT EXECUTED |
| Accepted/rejected/revoked/expired terminal replay | NOT EXECUTED |
| Fragment containment/removal และ authenticated /login#token | NOT EXECUTED |
| Bounded redirect/returnTo | NOT EXECUTED |
| LINE in-app browser | NOT EXECUTED |
| Physical second-device QR scan | NOT EXECUTED |
| Verified deployed HTTPS hostname และ physical scan reliability | NOT EXECUTED |
| Parent revoke/caregiver withdrawal fresh-read denial | NOT EXECUTED |
| Exact appointment grant/read | NOT EXECUTED |
| Cross-Hospital isolation | NOT EXECUTED |
| No unresolved P0/P1 in automated re-audit | PASS ตาม 17F.4A report; ไม่ทดแทน manual gates |
| Remaining FAIL dispositions | 0 UAT FAIL; 36 manual cases NOT EXECUTED และคงเป็น closure blockers |

**P17F-L04 = OPEN — REAL-DEVICE UAT PENDING; Phase 17F.4B = BLOCKED.** Closure ห้ามอิง local HEAD หรือ automated pass. ขั้นตอนถัดไปต้องมี HTTPS synthetic/demo URL และ deployed SHA ที่ตรวจสอบได้ แล้วทดสอบ target physical iPhone/iOS Safari, Android/Chrome, LINE in-app browser และ desktop control; บันทึก actual S/J evidence ตาม checklist.

## 14. Independent status boundaries

- P17F-L05 = **OPEN / FUTURE**.
- Q5 real Patient delegated-data use = **GOVERNANCE BLOCKED**.
- Phase 17F overall = **NOT CLOSED**.
- 17F.1 = IMPLEMENTED / CLOSED; 17F.2 = IMPLEMENTED synthetic/demo only; 17F.3 = IMPLEMENTED; 17F.4A automated/security/PostgreSQL re-audit = PASS.
- L04 closure would validate the implemented synthetic/demo slice only; it would not approve real-data deployment or production hardening.
- Distributed/shared abuse protection remains a separate deployment-hardening item.
- No real Patient data was used.
