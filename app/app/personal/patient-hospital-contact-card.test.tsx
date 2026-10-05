import { HospitalStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PatientPersonalHomePageContext } from "@/modules/patient-self/transport/patient-self-page-context";

import { PatientSelfRelationshipList } from "./patient-self-relationship-list";

type Relationship = PatientPersonalHomePageContext["hospitalRelationships"][number];

const hospitalName = "โรงพยาบาลตัวอย่างภาษาไทย";

function relationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    relationshipId: "11111111-1111-4111-8111-111111111111",
    hospitalCode: "H-001",
    hospitalName,
    hospitalNumber: null,
    hospitalStatus: HospitalStatus.ACTIVE,
    hospitalContact: {
      status: "AVAILABLE",
      contact: {
        hospital: { hospitalCode: "H-001", name: hospitalName },
        addressText: null,
        phoneNumber: null,
      },
    },
    ...overrides,
  };
}

describe("Patient Hospital Contact relationship card", () => {
  it("shows an empty state for a successful active relationship with no Contact row or values", () => {
    const html = renderToStaticMarkup(<PatientSelfRelationshipList relationships={[relationship()]} />);

    expect(html).toContain("ยังไม่มีข้อมูลติดต่อ");
    expect(html).toContain(hospitalName);
    expect(html).toContain("H-001");
  });

  it("renders full or partial Contact as wrapped plain text without tel-link conversion", () => {
    const addressText = `ที่อยู่ <ข้อความ>\n  บรรทัดภาษาไทย${" ต่อไป".repeat(24)}`;
    const full = renderToStaticMarkup(
      <PatientSelfRelationshipList
        relationships={[
          relationship({
            hospitalContact: {
              status: "AVAILABLE",
              contact: {
                hospital: { hospitalCode: "H-001", name: hospitalName },
                addressText,
                phoneNumber: "02-123-4567 ต่อ 123",
              },
            },
          }),
        ]}
      />,
    );

    expect(full).toContain("ที่อยู่ &lt;ข้อความ&gt;");
    expect(full).toContain("whitespace-pre-wrap");
    expect(full).toContain("break-words");
    expect(full).toContain("02-123-4567 ต่อ 123");
    expect(full).not.toContain('href="tel:');
    expect(full).not.toContain("dangerouslySetInnerHTML");

    const partial = renderToStaticMarkup(
      <PatientSelfRelationshipList
        relationships={[
          relationship({
            hospitalContact: {
              status: "AVAILABLE",
              contact: {
                hospital: { hospitalCode: "H-001", name: hospitalName },
                addressText: null,
                phoneNumber: "02-123-4567",
              },
            },
          }),
        ]}
      />,
    );
    expect(partial).toContain("หมายเลขโทรศัพท์");
    expect(partial).not.toContain("ที่อยู่</dt>");
  });

  it("distinguishes unavailable and non-ACTIVE Hospital Contact from confirmed empty data", () => {
    const unavailable = renderToStaticMarkup(
      <PatientSelfRelationshipList
        relationships={[
          relationship({ hospitalContact: { status: "UNAVAILABLE" } }),
        ]}
      />,
    );
    expect(unavailable).toContain("ข้อมูลติดต่อยังไม่พร้อมแสดง");
    expect(unavailable).not.toContain("ยังไม่มีข้อมูลติดต่อ");

    const inactive = renderToStaticMarkup(
      <PatientSelfRelationshipList
        relationships={[
          relationship({
            hospitalStatus: HospitalStatus.SUSPENDED,
            hospitalContact: { status: "UNAVAILABLE" },
          }),
        ]}
      />,
    );
    expect(inactive).toContain("ยังไม่แสดงข้อมูลติดต่อ");
    expect(inactive).not.toContain("ยังไม่มีข้อมูลติดต่อ");
  });
});
