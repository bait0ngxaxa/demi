import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// DESIGN.md COPY-DISTILL (2026-11-19): user copy on patient, family and LINE surfaces never explains
// system guarantees (R1), implementation details (R2) or inline medical/legal disclaimers (R7).
const GUARDED_DIRECTORIES = ["app/app/personal", "app/app/family", "app/line"] as const;
// PR 2 (OSM and hospital staff daily flows): implementation terms only (R2).
const STAFF_DIRECTORIES = [
  "app/app/patients/[relationshipId]",
  "app/app/patients/assigned",
  "app/app/patients/service-requests",
  "app/app/services",
] as const;
const STAFF_FILES = ["app/app/patients/patient-directory-view.tsx", "app/app/appointments/new/patient-picker-view.tsx"] as const;
// PR 3 (admin, onboarding, provisioning, workforce, hospital settings/content, public auth): implementation terms only (R2).
const OPERATOR_DIRECTORIES = [
  "app/app/admin",
  "app/app/hospitals",
  "app/app/workforce",
  "app/app/users",
  "app/app/patients/provision",
  "app/app/patients/activation",
  "app/activate",
  "app/recover",
  "app/register",
  "app/login",
  "app/hospital/onboarding",
] as const;

type BannedPhrase = { phrase: string; rule: string; pattern: RegExp; thaiOnly: boolean };
const isImplementationRule = ({ rule }: BannedPhrase): boolean => rule.startsWith("R2");

const THAI = /[฀-๿]/u;
const BANNED: readonly BannedPhrase[] = [
  { phrase: "Asia/Bangkok", rule: "R2 implementation term", pattern: /Asia\/Bangkok/u, thaiOnly: true },
  { phrase: "OSM", rule: "R2 use อสม. in Thai copy", pattern: /(?<![A-Za-z_])OSM(?![A-Za-z_])/u, thaiOnly: true },
  { phrase: "หลังตัดช่องว่าง", rule: "R2 length rule in prose", pattern: /หลังตัดช่องว่าง/u, thaiOnly: false },
  { phrase: "ป้องกันการบันทึกซ้ำ", rule: "R1 idempotency", pattern: /ป้องกันการบันทึกซ้ำ/u, thaiOnly: false },
  { phrase: "จะถูกบันทึกเมื่อคุณกดปุ่ม", rule: "R1 save-only", pattern: /จะถูกบันทึกเมื่อคุณกดปุ่ม/u, thaiOnly: false },
  { phrase: "ไม่เปิดสิทธิ์", rule: "R1 authorization scope", pattern: /ไม่(?:ได้)?เปิดสิทธิ์/u, thaiOnly: false },
  { phrase: "สิทธิ์แบบเดิม", rule: "R2 consent contract version", pattern: /สิทธิ์แบบเดิม/u, thaiOnly: false },
  { phrase: "สิทธิ์แบบใหม่", rule: "R2 consent contract version", pattern: /สิทธิ์แบบใหม่/u, thaiOnly: false },
  { phrase: "ไม่ใช่คำแนะนำทางการแพทย์", rule: "R7 medical disclaimer", pattern: /ไม่ใช่คำแนะนำทางการแพทย์/u, thaiOnly: false },
  { phrase: "ไม่มีการคำนวณหรือแปลผล", rule: "R7 clinical disclaimer", pattern: /ไม่มีการคำนวณหรือแปลผล/u, thaiOnly: false },
  { phrase: "ฝั่งเซิร์ฟเวอร์", rule: "R2 implementation term", pattern: /ฝั่งเซิร์ฟเวอร์/u, thaiOnly: false },
];

/**
 * Deliberate exceptions, each with its reason. Nothing is allowed silently: an entry here is the
 * only way a banned phrase may ship in a guarded folder.
 */
const ALLOWED: readonly { file: string; phrase: string; reason: string }[] = [];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name) && !/\.(?:test|spec)\./u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Text the user can see: string/template literals and JSX text. Comments and identifiers are skipped. */
function copyFragments(source: string, filename: string): { text: string; line: number }[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const fragments: { text: string; line: number }[] = [];
  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      fragments.push({ text: node.text, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return fragments;
}

function violations(source: string, filename: string, banned: readonly BannedPhrase[] = BANNED): string[] {
  return copyFragments(source, filename).flatMap(({ text, line }) => banned
    .filter(({ pattern, thaiOnly }) => pattern.test(text) && (!thaiOnly || THAI.test(text)))
    .filter(({ phrase }) => !ALLOWED.some((entry) => entry.file === filename && entry.phrase === phrase))
    .map(({ phrase, rule }) => `${filename}:${line} "${phrase}" (${rule})`));
}

describe("COPY-DISTILL copy guard", () => {
  it("finds a banned phrase in Thai copy but not in comments, identifiers or non-Thai configuration", () => {
    const fixture = [
      "// Asia/Bangkok in a comment is fine; ป้องกันการบันทึกซ้ำ too.",
      'const formatter = { timeZone: "Asia/Bangkok" };',
      'const osmId = "OSM_ROLE";',
      'export const help = "วันนี้ตามเวลาไทย (Asia/Bangkok)";',
      "export const view = <p>การตรวจสอบจะส่งข้อมูลเดิมอีกครั้งและป้องกันการบันทึกซ้ำ</p>;",
      'export const label = `ผู้ดูแล ${name} OSM ประจำบ้าน`;',
    ].join("\n");
    expect(violations(fixture, "fixture.tsx")).toEqual([
      'fixture.tsx:4 "Asia/Bangkok" (R2 implementation term)',
      'fixture.tsx:5 "ป้องกันการบันทึกซ้ำ" (R1 idempotency)',
      'fixture.tsx:6 "OSM" (R2 use อสม. in Thai copy)',
    ]);
  });

  it("keeps the patient, family and LINE folders free of policy and implementation copy", () => {
    const found = GUARDED_DIRECTORIES.flatMap((directory) => sourceFiles(directory)).flatMap((path) => {
      const filename = relative(process.cwd(), path).replaceAll("\\", "/");
      return violations(readFileSync(path, "utf8"), filename);
    });
    expect(found).toEqual([]);
  });

  it("keeps staff, operator and public auth flows free of implementation terms", () => {
    const paths = [
      ...STAFF_DIRECTORIES.flatMap((directory) => sourceFiles(directory)),
      ...STAFF_FILES,
      ...OPERATOR_DIRECTORIES.flatMap((directory) => sourceFiles(directory)),
    ];
    const found = paths.flatMap((path) => {
      const filename = relative(process.cwd(), path).replaceAll("\\", "/");
      return violations(readFileSync(path, "utf8"), filename, BANNED.filter(isImplementationRule));
    });
    expect(found).toEqual([]);
  });

  it("lists every exception with a reason", () => {
    for (const entry of ALLOWED) expect(entry.reason.trim()).not.toBe("");
  });
});
