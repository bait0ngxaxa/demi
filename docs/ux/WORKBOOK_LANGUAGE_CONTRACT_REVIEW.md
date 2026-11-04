# Workbook Language Contract Review

**Date:** 2026-11-04

**Scope:** Customer-facing XLSX labels changed by `5c34674`.

The Product Owner designated [`Dashboard App Demi.xlsx`](../Dashboard%20App%20Demi.xlsx) as the reporting Definition of Done in [BF-GAP-WB-00](../phases/BF_GAP_WB_00_WORKBOOK_DOD_CLOSURE_PLAN.md). The workbook template uses the header **“จำนวนเคส”**. Its approved service-round and clinical mappings in [WB_ALIGNMENT_DECISIONS.md](../requirements/WB_ALIGNMENT_DECISIONS.md) do not approve general replacement wording for generated workbook labels.

The 2026-11-04 review restored the following generated XLSX output to the wording emitted before `5c34674`:

| Workbook output | Restored wording | Contract note |
| --- | --- | --- |
| Hospital report count header | `จำนวนเคส` | Matches the customer workbook template. The value remains a count of Patient–Hospital relationship records as before; it is not a count of distinct global patient identities. |
| Hospital report Program summary | `Program ทั้งหมด`, `Program ACTIVE / COMPLETED`, `ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program` | Preserves prior report terminology and keeps the relationship count's grain explicit. |
| Hospital report explanatory cells | `ไม่มี Baseline ที่เชื่อมกับ Program`, `ยังดำเนิน Program`, `ไม่มี Goal Plan ที่ผูกกับ Program นี้` | Restores output text; sources, values, formulas, and cell positions are unchanged. |
| Network report summary headers | `Program ทั้งหมด`, `ACTIVE`, `COMPLETED`, `ความสัมพันธ์ที่ยังไม่มี Program` | Preserves the existing network workbook contract. |
| Parent-to-Child summary fields | Prior labels such as `จำนวนความสัมพันธ์ผู้ป่วยกับโรงพยาบาล` and `Program ทั้งหมด` | Export labels are now mapped separately from the web projection labels. The nine values, order, and relationship/Program grains are unchanged. |

The natural Thai wording introduced in the application web UI remains in the shared Parent-to-Child summary projection. Generated workbook labels should change only after explicit Product Owner approval. No approval for the changed output labels was found in the reviewed workbook requirements or accepted decisions, so those labels remain a follow-up decision rather than an assumed copy correction.

No worksheet names, columns, cell addresses, types, formulas, metric definitions, cohort filters, patient/Program grain, authorization, or export scope changed in this correction.
