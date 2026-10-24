import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { loadAssignedOsmPhone } from "./assigned-osm-phone";

function fixture(record: { hospitalId: string; osmAssignments: { osmUserId: string }[] } | null) {
  const relationship = vi.fn().mockResolvedValue(record);
  const osm = vi.fn().mockResolvedValue({ contactPhone: "0812345678" });
  const database = { patientHospitalRelationship: { findFirst: relationship }, osmHospitalRelationship: { findFirst: osm } } as unknown as PrismaClient;
  return { database, relationship, osm };
}

describe("current assigned OSM contact phone", () => {
  it("binds the phone to the live assignment and exact ACTIVE hospital relationship", async () => {
    const f = fixture({ hospitalId: "hospital-a", osmAssignments: [{ osmUserId: "current-osm" }] });
    expect(await loadAssignedOsmPhone(f.database, "patient-relationship")).toBe("0812345678");
    expect(f.relationship).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "patient-relationship", endedAt: null, hospital: { status: "ACTIVE" } } }));
    expect(f.osm).toHaveBeenCalledWith({ where: { userId: "current-osm", hospitalId: "hospital-a", status: "ACTIVE", hospital: { status: "ACTIVE" }, user: { status: "ACTIVE", roles: { some: { role: "OSM" } } } }, select: { contactPhone: true } });
  });
  it.each([null, { hospitalId: "hospital-a", osmAssignments: [] }])("has no phone for ended/inactive/missing or unassigned relationships", async (record) => {
    const f = fixture(record);
    expect(await loadAssignedOsmPhone(f.database, "patient-relationship")).toBeNull();
    expect(f.osm).not.toHaveBeenCalled();
  });
  it("keeps a displayed assignee's phone bound to that same User during reassignment", async () => {
    const f = fixture({ hospitalId: "hospital-a", osmAssignments: [] });
    expect(await loadAssignedOsmPhone(f.database, "patient-relationship", "displayed-osm")).toBeNull();
    expect(f.relationship).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ osmAssignments: expect.objectContaining({ where: expect.objectContaining({ osmUserId: "displayed-osm" }) }) }) }));
    expect(f.osm).not.toHaveBeenCalled();
  });
  it("withholds a suspended or removed OSM's phone", async () => {
    const f = fixture({ hospitalId: "hospital-a", osmAssignments: [{ osmUserId: "suspended-osm" }] });
    f.osm.mockResolvedValue(null);
    expect(await loadAssignedOsmPhone(f.database, "patient-relationship")).toBeNull();
  });
});
