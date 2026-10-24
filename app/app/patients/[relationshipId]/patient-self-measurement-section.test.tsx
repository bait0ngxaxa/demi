import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
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
