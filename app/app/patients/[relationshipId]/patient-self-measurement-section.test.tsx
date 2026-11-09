import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Link from "next/link";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { Role } from "@prisma/client";

const listMeasurements = vi.hoisted(() => vi.fn());

vi.mock("@/modules/patient-self-measurements/services/patient-self-measurement-service", () => ({
  listPatientSelfMeasurementsForCareTeam: listMeasurements,
}));

import { PatientSelfMeasurementSection } from "./patient-self-measurement-section";

type LinkProps = { href?: string; children?: ReactNode };

function links(node: ReactNode): ReactElement<LinkProps>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<LinkProps>(child)) return [];
    const nested = links(child.props.children);
    return child.type === Link ? [child, ...nested] : nested;
  });
}

const actor: ActorContext = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("Patient self-measurement pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMeasurements.mockResolvedValue({ items: [], nextCursor: "older-cursor" });
  });

  it("keeps the profile tab on both the next and previous measurement pages", async () => {
    const firstPage = await PatientSelfMeasurementSection({
      actor,
      relationshipId: "22222222-2222-4222-8222-222222222222",
    });
    const olderPage = await PatientSelfMeasurementSection({
      actor,
      cursor: "current-cursor",
      relationshipId: "22222222-2222-4222-8222-222222222222",
    });

    expect(links(firstPage).map((link) => link.props.href)).toContain(
      "/app/patients/22222222-2222-4222-8222-222222222222?tab=profile&selfMeasurementCursor=older-cursor#patient-self-measurement-heading",
    );
    expect(links(olderPage).map((link) => link.props.href)).toContain(
      "/app/patients/22222222-2222-4222-8222-222222222222?tab=profile#patient-self-measurement-heading",
    );
  });
});

describe("care-team patient self-measurement readback", () => {
  const relationshipId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows every recorded value, Bangkok measurement time, note, and patient-reported source read-only", async () => {
    const measuredAt = new Date("2026-10-16T12:30:00.000Z");
    listMeasurements.mockResolvedValue({
      items: [{
        measurementId: "33333333-3333-4333-8333-333333333333",
        measuredAt,
        createdAt: measuredAt,
        weight: 67.5,
        bloodSugar: 110,
        systolicBloodPressure: 120,
        diastolicBloodPressure: 80,
        note: "วัดหลังพัก 5 นาที",
      }],
      nextCursor: null,
    });

    const view = await PatientSelfMeasurementSection({ actor, relationshipId });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("ผู้ป่วยบันทึกเอง");
    expect(html).toContain(`dateTime="${measuredAt.toISOString()}"`);
    for (const value of ["น้ำหนัก", "67.5", "กก.", "ระดับน้ำตาลในเลือด", "110", "mg/dL", "ความดันโลหิต (ตัวบน / ตัวล่าง)", "120 / 80", "mmHg", "วัดหลังพัก 5 นาที"]) {
      expect(html).toContain(value);
    }
    expect(html).not.toMatch(/<form|<button/u);
    expect(html).not.toContain("ลบรายการ");
    expect(listMeasurements).toHaveBeenCalledWith(actor, relationshipId, {});
  });

  it("shows only a recorded blood-pressure component when the other component is absent", async () => {
    const measuredAt = new Date("2026-10-16T12:30:00.000Z");
    listMeasurements.mockResolvedValue({
      items: [{
        measurementId: "44444444-4444-4444-8444-444444444444",
        measuredAt,
        createdAt: measuredAt,
        weight: null,
        bloodSugar: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: 82,
        note: null,
      }],
      nextCursor: null,
    });

    const view = await PatientSelfMeasurementSection({ actor, relationshipId });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("ความดันตัวล่าง");
    expect(html).toContain("82");
    expect(html).toContain("mmHg");
    expect(html).not.toContain("ความดันตัวบน");
    expect(html).not.toContain("น้ำหนัก");
    expect(html).not.toContain("mg/dL");
    expect(html).not.toMatch(/>\s*-\s*</u);
  });
});
