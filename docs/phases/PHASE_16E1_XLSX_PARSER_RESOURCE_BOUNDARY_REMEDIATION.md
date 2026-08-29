# Phase 16E.1 — XLSX Parser Resource Boundary Remediation

วันที่ดำเนินการ: 2026-08-28

สถานะ: parser-resource blocker remediated / ready for re-audit

สถานะ release gate รวม: **FIX REQUIRED** — เอกสารนี้ไม่ปิดและไม่เปลี่ยน
`EXTERNAL PRIVACY RELEASE BLOCKER` จาก Phase 16E

## Starting point and scope

- Starting HEAD: `404e937a93d8465e7df0d3956ecb7c1ee9856630`
- `origin/main` ณ จุดเริ่มงาน: `404e937a93d8465e7df0d3956ecb7c1ee9856630`
- Scope: bound XLSX ZIP/XML work before the uploaded buffer reaches ExcelJS.
- Out of scope: historical Patient workbook/blob, GitHub cache/unreachable cleanup,
  Phase 16E.2, Patient business semantics, Prisma schema, migrations and generic
  import infrastructure.

## Root cause and threat model

ก่อน remediation adapter ตรวจ extension และ compressed `Buffer` ไม่เกิน
`5 * 1024 * 1024` แล้วสร้าง `ExcelJS.Workbook` และเรียก
`workbook.xlsx.load(buffer)` ทันที ขณะที่ row, column, worksheet และ header limits
ทำงานหลังจาก ExcelJS อ่านและ materialize package แล้ว

XLSX เป็น ZIP/OPC package ดังนั้น compressed upload ขนาดเล็กอาจมี XML ที่
decompress แล้วใหญ่กว่าหลายเท่า นอกจากนี้ XML ขนาดเล็กอาจระบุ row/cell/merge
coordinates ที่ไกลมาก ทำให้ parser สร้าง object หรือ range จำนวนมากได้ Threat model
จึงครอบคลุม ZIP entry metadata, decompression output, worksheet XML structure และ
การส่งงานต่อเข้า ExcelJS ทั้งใน Preview และ Confirm

`MAX_PATIENT_IMPORT_BYTES` ยังคงเป็น compressed request limit เดิมที่ 5 MiB และ
ไม่ใช่ตัวแทนของ decompressed resource envelope

## Dependencies and parsing strategy

เพิ่ม direct runtime dependencies ดังนี้:

- `yauzl@3.4.0`: mature lazy ZIP reader สำหรับอ่าน central-directory metadata,
  เปิด entry แบบ bounded stream และ validate entry sizes โดยไม่ใช้ private/internal
  ZIP implementation ของ ExcelJS
- `saxes@6.0.0`: streaming SAX-style XML tokenizer/parser ไม่มี DOM และไม่มีการ
  materialize XML ทั้ง part ใน memory

เพิ่ม `@types/yauzl@3.4.0` เป็น dev dependency เพื่อ type-safe integration; ไม่มี
  ZIP-writing dependency หรือ binary attack fixture เพิ่มเข้าระบบ

การเปิด ZIP ใช้ public Promise/async-iterator APIs ของ `yauzl` พร้อม
`lazyEntries: true`, `validateEntrySizes: true` และ `strictFileNames: true`.
การอ่าน worksheet ใช้ default decoded/decompressed stream ของ `openReadStreamPromise`
และนับ bytes ที่ไหลผ่าน stream จริงทีละ chunk. XML ใช้ `SaxesParser` แบบ strict,
อ่านผ่าน `StringDecoder`, ไม่เปิด external entity/network resolution และ reject
`DOCTYPE` ก่อน parser จะได้รับงานต่อ

## Selected security resource envelope

ค่าทั้งหมดอยู่ใน
`src/modules/patient-provisioning/import/patient-import-xlsx-resource-preflight.ts`
ที่เดียว:

| Control | Limit |
|---|---:|
| ZIP entries | 256 |
| Cumulative declared uncompressed package bytes | 33,554,432 (32 MiB) |
| Individual declared uncompressed entry bytes | 16,777,216 (16 MiB) |
| Worksheet XML package parts | 12 |
| Worksheet `<c>` cell elements | 65,536 |
| Worksheet `<row>` elements | 2,048 |
| Maximum worksheet row coordinate | 10,000 |
| Maximum worksheet column coordinate | 256 |
| Merge declarations | 64 |
| Single merge area | 4,096 cells |
| Total merge area | 16,384 cells |
| Single `<dimension>` area | 65,536 cells |
| XML nesting depth | 64 |

ค่าดังกล่าวเป็น security limits ไม่ใช่ business limits. ตัวอย่างเช่น semantic
maximum ยังเป็น 500 Patient records และ 64 supported columns; resource row/column
ceilings สูงกว่าเพื่อให้มี operational headroom โดยไม่เปิดถึง Excel worksheet
maximum (`1,048,576` rows / `16,384` columns)

Envelope นี้เลือกจาก fixture measurements ไม่ใช่ compression ratio. ไม่มี ratio
guard เพราะ repetitive legitimate XML อาจ compress ได้ดี และ absolute total/per-entry
limits เป็น controls หลัก

## Legitimate fixture measurements

วัดด้วย payload ที่ปลอดภัย ไม่มีข้อมูล Patient จริง และนับ metadata/worksheet XML
ผ่านแนวทางเดียวกับ preflight:

| Fixture | Compressed | ZIP entries | Total uncompressed | Largest entry | Worksheet parts | Worksheet XML | Cells | Rows | Max row | Max col | Merges | Max merge area | Total merge area |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Official blank Canonical Template v1 | 37,611 B | 16 | 314,273 B | 296,719 B | 1 | 296,719 B | 14,056 | 502 | 502 | 28 | 27 | 2 | 54 |
| Synthetic Canonical Template, exactly 500 populated rows | 44,938 B | 16 | 563,693 B | 546,111 B | 1 | 546,111 B | 14,056 | 502 | 502 | 28 | 27 | 2 | 54 |
| Synthetic compatibility workbook, 34 columns × 2 rows | 6,916 B | 16 | 18,860 B | 7,961 B | 1 | 2,838 B | 68 | 2 | 2 | 34 | 0 | 0 | 0 |

The populated 500-row fixture is the upper legitimate shape relevant to the current
Patient contract. The selected limits leave material headroom over it while keeping
all controls finite. The official Template's 27 vertically merged two-row headers
therefore remain well below both merge limits.

The table above records the initial Phase 16E.1 handoff measurements. The follow-up
re-audit added an actual-stream summary metric; its current fixture measurements are
recorded in the follow-up section below.

The worksheet-part limit intentionally hardens the previous scan-first-12 behavior:
a package with more than 12 worksheet parts is rejected before ExcelJS rather than
materializing an additional unbounded tail. Canonical production input contains one
Patient worksheet.

## ZIP central-directory and package controls

The preflight performs these checks before any ExcelJS workbook is constructed:

1. Open the already compressed-size-bounded `Buffer` with `yauzl` and reject a
   non-ZIP/malformed package safely.
2. Reject a non-safe or negative central-directory entry count; reject counts above
   256 before iterating entries.
3. Iterate lazily. For every entry, validate safe non-negative compressed size,
   uncompressed size and local-header offset; reject per-entry and cumulative
   uncompressed limits immediately. Accumulation uses subtraction-before-addition
   checks and never relies on an unsafe integer.
4. Read each local header with the public minimal-header API to verify the local
   header signature and file-data bounds without reading entry contents.
5. Reject exact duplicate names and duplicate normalized package names. Reject NUL,
   backslash, absolute/drive-qualified and `..` traversal names. No extraction to
   disk is performed.
6. Reject encrypted entries, strong-encryption flags and compression methods other
   than stored (0) or deflate (8). Unsupported or ambiguous structures fail closed.

The preflight does not attempt full OPC conformance validation. ExcelJS remains the
semantic reader after the resource boundary, but it only receives a package that has
passed these finite package checks.

## Worksheet structural amplification controls

Every non-directory ZIP file entry is opened once through a bounded decompressed
stream before ExcelJS. Worksheet XML parts additionally feed the incremental SAX
inspector; non-worksheet XML, relationship, metadata, theme and binary/media entries
are drained only for byte accounting and are never parsed or retained in memory.
Known zero-length directory entries are checked as metadata and are not opened.
The SAX pass counts and validates:

- `<dimension ref>` ranges and safe area multiplication;
- row coordinates, row count and `spans` column ranges;
- cell coordinates and actual `<c>` element count;
- column min/max ranges;
- merge references, coordinates, single-range area, total area and declaration count.

Coordinates above the resource policy reject before ExcelJS. Area arithmetic rejects
unsafe values before multiplication and uses the resource ceilings independently of
the 500-row/64-column semantic contract. XML nesting is bounded at depth 64.

The actual decompressed stream for every file entry is counted in addition to
central-directory metadata. Each stream is rejected if actual bytes exceed its
individual limit or the package-wide actual limit, and the final actual byte count
must equal the declared entry size. `yauzl`'s `validateEntrySizes` check and the
application counter are complementary; a forged declared size may therefore fail
closed as a malformed ZIP before the application counter sees the extra bytes.
`worksheetXmlBytes` remains only the worksheet-subset metric and is not reused as
the package budget. SAX/parser failures, DTDs and incomplete XML are malformed-input
failures; no XML is buffered into a DOM.

## Integration and error behavior

`readPatientImportCandidates()` now performs:

```text
extension / 5 MiB compressed checks
        ↓
assertSafePatientImportXlsxResourceEnvelope(buffer)
        ↓
new ExcelJS.Workbook() + workbook.xlsx.load(buffer)
        ↓
existing canonical/compatibility semantic parser
```

The mode branch remains after the shared preflight, so `CANONICAL` and
`COMPATIBILITY` cannot bypass the resource boundary. Preview and Confirm both call
the same adapter path. A focused adapter loader seam proves that resource rejection
occurs before `workbook.xlsx.load()` is invoked.

Resource-envelope rejection uses the safe ValidationError message:

> ไฟล์ Excel มีโครงสร้างภายในเกินขนาดที่ระบบรองรับ กรุณาใช้ Template ของระบบและตรวจสอบไฟล์อีกครั้ง

Malformed ZIP/XML and ordinary ExcelJS parse failures continue to use:

> ไฟล์ Excel ไม่ถูกต้องหรือไม่สามารถอ่านได้

The browser receives neither entry names, thresholds, ratios, raw XML, library
exceptions nor stack traces. The implementation emits no workbook/XML/Patient-data
diagnostic logs. Read streams are destroyed in `finally` blocks and the Buffer-backed
ZIP reader is closed in its `finally` block on success, limit rejection and parse
failure.

## Test evidence

The synthetic preflight suite constructs compact ZIPs at runtime and covers:

- official blank Template pass;
- exactly 500-row Canonical Template pass;
- normal 34-column compatibility fixture pass;
- malformed ZIP/local header, too many entries, cumulative and per-entry limits;
- small compressed / over-limit decompressed payload;
- duplicate exact/normalized names, suspicious names, unsupported method and
  encrypted entry rejection;
- actual streamed-byte mismatch validation;
- extreme dimension, cell/row coordinate and merge range rejection;
- excessive merge declarations/cells, worksheet parts and DTD/entity rejection;
- proof that adapter preflight rejection does not invoke the ExcelJS loader;
- package-wide actual-byte accounting for non-worksheet entries, directory handling,
  non-worksheet amplification/mismatch, non-worksheet cumulative limits and mixed
  worksheet/non-worksheet totals.

Existing Canonical adapter/template tests continue to cover merged headers, exact
500-row source row 502, and semantic 501-record rejection. Existing compatibility,
roster service, Classification, OSM and Phase 16D.6 presentation tests are retained.
All attack fixtures are synthetic and no test allocates a large ZIP bomb or uses real
Patient data.

Verification results for this implementation: the focused 7-file parser/adapter
suite passed with 104 tests; `npm test` passed with 138 files/958 tests; and
`npm run test:integration` passed with 23 files/204 tests. `npm run lint`,
`npm run typecheck`, `npx prisma validate`, `npx prisma generate` and
`npm run generate:patient-import-template` all passed. The generated Template was
verified and restored to the tracked sanitized artifact; no schema or migration
change was produced.

## Performance, compatibility and non-regression

The preflight adds one lazy central-directory pass and decompresses every bounded
non-directory file entry once before ExcelJS. Worksheet XML is inspected
incrementally; binary/media entries are drained without buffering or parsing. The
same uploaded buffer is then passed to ExcelJS, so ExcelJS decompresses the package a
second time. This intentional double-decompression tradeoff keeps the security
boundary independent of ExcelJS internals while the 5 MiB compressed, 32 MiB actual,
16 MiB per-entry and 256-entry limits keep the work finite.

No Patient business rule, Canonical Template version, contract version, row atomicity,
Baseline, Classification, OSM, Hospital authority, summary, preview or confirm
behavior was changed. No Prisma schema, migration, ImportBatch, queue, Redis,
background job or worker isolation was added.

## Remaining gate and recommendation

The XLSX parser resource blocker recorded in Phase 16E is addressed and is ready for
independent re-audit. The overall Phase 16E release gate remains **FIX REQUIRED**.
The separate **EXTERNAL PRIVACY RELEASE BLOCKER** concerning GitHub historical
sensitive-workbook cached/unreachable cleanup remains open and is not addressed here.

Recommended next action: re-audit this focused parser boundary and its evidence,
then handle the separately authorized Phase 16E.2 external privacy evidence. Do not
infer overall release-gate closure from this remediation.

## Follow-up re-audit remediation — package-wide actual decompression budget

วันที่ดำเนินการ: 2026-08-29

การ re-audit พบ gap ใน remediation เดิม: actual-byte guard ครอบคลุมเฉพาะ worksheet
XML ขณะที่ `xl/sharedStrings.xml`, `xl/styles.xml`, workbook/rels, docProps,
theme และ binary/media parts ยังถูกตรวจหลัก ๆ จาก central-directory metadata ก่อน
ExcelJS จะประมวลผล package ทั้งหมด

Follow-up นี้แก้ที่ preflight boundary เดิมเท่านั้น:

- ทุก non-directory file entry เปิด decoded/decompressed stream ผ่าน `yauzl` หนึ่งครั้ง
  ก่อน ExcelJS; non-worksheet entries ถูก drain แบบ incremental โดยไม่รวม contents
  ทั้งก้อนใน memory และ binary/media ไม่ถูก parse
- `actualEntryBytes` ถูกตรวจต่อ chunk กับ limit 16 MiB และ
  `actualTotalUncompressedBytes` ถูกตรวจต่อ chunk กับ package limit 32 MiB
  ครอบคลุม worksheet และ non-worksheet bytes ใน counter เดียวกัน
- การตรวจ central-directory แบบ declared ต่อ entry/ต่อ package ยังคงอยู่เป็น early
  rejection; `validateEntrySizes: true` ยังคงบังคับ actual-vs-declared ของ `yauzl`
  และ preflight ตรวจซ้ำเมื่อ stream จบ หากไม่เท่ากันให้ fail closed เป็น malformed
- worksheet ใช้ stream เดียวกับ actual-byte counter, `StringDecoder` และ
  `SaxesParser`; ไม่มีการเปิด worksheet ซ้ำใน preflight. Structural controls เดิม
  ทั้งหมดคงอยู่. Directory ที่ลงท้าย `/` และประกาศ uncompressed size เป็นศูนย์จะไม่
  เปิด content stream; directory ที่ประกาศ content ไม่เป็นศูนย์ถูก reject
- summary เพิ่ม `actualTotalUncompressedBytes` เพื่อยืนยัน fixture measurements และ
  แยกจาก `worksheetXmlBytes` ซึ่งยังเป็น worksheet-subset metric เท่านั้น

ค่าที่วัดจาก valid fixtures หลัง follow-up (declared และ actual เท่ากัน) คือ:

| Fixture | `actualTotalUncompressedBytes` |
|---|---:|
| Official blank Canonical Template v1 | 314,273 B |
| Synthetic Canonical Template, exactly 500 populated rows | 1,029,351 B |
| Synthetic compatibility workbook, 34 columns × 2 rows | 18,860 B |

เพิ่ม regressions สำหรับ non-worksheet per-entry amplification, cumulative
non-worksheet package budget, mixed worksheet/non-worksheet cumulative budget,
declared/actual mismatch, zero-length directories และ proof ว่า ExcelJS ไม่ถูกเรียก
หลัง non-worksheet rejection. เมื่อ `yauzl` ตรวจพบ forged size mismatch ก่อน
application counter จะจัดเป็น fail-closed malformed rejection ตาม contract; valid
metadata-consistent fixtures ยืนยัน package-wide actual total โดยตรง.

การเปลี่ยนแปลงนี้ intentionally ยอมรับ double decompression: preflight drain/inspect
package หนึ่งรอบเพื่อสร้าง security boundary แล้ว ExcelJS อ่าน buffer เดิมอีกครั้ง
เพื่อ semantic parsing. ไม่เพิ่ม ZIP/XML dependency, cache ภายใน ExcelJS, worker,
queue หรือ domain behavior.

สถานะ parser-resource blocker ของ Phase 16E.1 ยังคงเป็น **REMEDIATED / READY FOR
RE-AUDIT**. เอกสารนี้ไม่ประกาศ overall Phase 16E release gate เป็น PASS; external
privacy evidence ของ Phase 16E.2 ยังคงเป็น blocker แยกต่างหาก.
