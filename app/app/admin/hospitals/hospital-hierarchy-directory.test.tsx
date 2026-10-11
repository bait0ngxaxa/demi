import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HospitalStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import approvedSource from "../../../../prisma/seed/hospital-master-v2.json";
import {
  buildHospitalHierarchyDirectory,
  type HospitalHierarchyUnit,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import { validateHospitalMasterSource } from "@/modules/hospital-hierarchy/services/hospital-master-reconciliation-service";

import { HospitalHierarchyDirectory } from "./hospital-hierarchy-directory";

function render(records: readonly HospitalHierarchyUnit[]): string {
  const directory = buildHospitalHierarchyDirectory(records);
  return renderToStaticMarkup(createElement(HospitalHierarchyDirectory, { directory }));
}

describe("Platform Admin Hospital hierarchy directory", () => {
  it("renders all 43 main Hospitals and 35 subordinate facilities with accessible grouping and governance links", () => {
    const source = validateHospitalMasterSource(approvedSource);
    const idsByCode = new Map(source.map(({ canonicalCode }) => [canonicalCode, `hospital-${canonicalCode}`]));
    const records = source.map((record) => {
      const id = idsByCode.get(record.canonicalCode);
      const parentHospitalId = record.parentCanonicalCode === null
        ? null
        : idsByCode.get(record.parentCanonicalCode);
      if (!id || parentHospitalId === undefined) throw new Error("Approved source mapping is incomplete");
      return {
        id,
        hospitalCode: record.canonicalCode,
        name: record.nameTh,
        status: HospitalStatus.ACTIVE,
        parentHospitalId,
      };
    });
    const directory = buildHospitalHierarchyDirectory(records);
    const markup = renderToStaticMarkup(createElement(HospitalHierarchyDirectory, { directory }));

    expect(directory.mainHospitalCount).toBe(43);
    expect(directory.subordinateHospitalCount).toBe(35);
    expect(directory.groups).toHaveLength(43);
    expect(directory.groups.reduce((count, group) => count + group.directChildren.length, 0)).toBe(35);
    expect(markup).toContain("โครงสร้างโรงพยาบาล");
    expect(markup).toContain("โรงพยาบาลแม่ข่าย");
    expect(markup).toContain("รพ.สต. / หน่วยบริการในเครือ");
    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
    expect(markup).toContain("focus-visible:ring-focus-ring");
    expect(markup).toContain(`/app/admin/hospitals/${directory.groups[0]?.mainHospital.id}`);
    const groupWithChild = directory.groups.find(({ directChildren }) => directChildren.length > 0);
    if (!groupWithChild?.directChildren[0]) throw new Error("Approved source has no direct child facilities");
    expect(markup).toContain(`/app/admin/hospitals/${groupWithChild.directChildren[0].id}`);
    for (const group of directory.groups) {
      expect(markup).toContain(`โรงพยาบาลลูกข่ายโดยตรง ${group.directChildren.length.toLocaleString("th-TH")} แห่ง`);
    }
    expect(markup.match(/href="\/app\/admin\/hospitals\//gu)).toHaveLength(78);
  });

  it("keeps orphaned facilities visible in a diagnostic section with their status", () => {
    const root: HospitalHierarchyUnit = {
      id: "root-id",
      hospitalCode: "ROOT",
      name: "โรงพยาบาลแม่ข่าย",
      status: HospitalStatus.ACTIVE,
      parentHospitalId: null,
    };
    const orphan: HospitalHierarchyUnit = {
      id: "orphan-id",
      hospitalCode: "ORPHAN",
      name: "รพ.สต.ที่หาแม่ข่ายไม่พบ",
      status: HospitalStatus.PENDING_VERIFICATION,
      parentHospitalId: "deleted-parent",
    };
    const markup = render([root, orphan]);

    expect(markup).toContain("รายการที่ต้องตรวจสอบโครงสร้าง");
    expect(markup).toContain("รพ.สต.ที่หาแม่ข่ายไม่พบ");
    expect(markup).toContain("รอยืนยันการขึ้นทะเบียน");
    expect(markup).toContain("ไม่พบโรงพยาบาลแม่ข่ายที่อ้างอิง");
    expect(markup).toContain("/app/admin/hospitals/orphan-id");
  });
});
