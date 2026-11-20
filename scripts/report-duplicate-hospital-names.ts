/**
 * Read-only report of Hospital names that are equal after `normalizeHospitalName`, globally and within each Parent's
 * network, so the owner can rename existing data before codes disappear from every screen. Nothing is written or
 * renamed. Run against the intended database:
 *
 *   npx jiti scripts/report-duplicate-hospital-names.ts
 */
import { PrismaClient } from "@prisma/client";

import {
  findDuplicateHospitalNames,
  type DuplicateNameHospital,
} from "../src/modules/hospital-governance/domain/duplicate-hospital-names";

const BATCH = 500;

async function loadHospitals(prisma: PrismaClient): Promise<DuplicateNameHospital[]> {
  const hospitals: DuplicateNameHospital[] = [];
  let afterId: string | undefined;
  for (;;) {
    const rows = await prisma.hospital.findMany({
      where: afterId ? { id: { gt: afterId } } : {},
      orderBy: { id: "asc" },
      take: BATCH,
      select: {
        id: true, hospitalCode: true, name: true, status: true, createdAt: true,
        registeredForParent: { select: { id: true, name: true } },
        serviceAreaAssignments: { where: { endedAt: null }, take: 1, select: { parent: { select: { id: true, name: true } } } },
      },
    });
    for (const row of rows) {
      const parent = row.serviceAreaAssignments[0]?.parent ?? row.registeredForParent;
      hospitals.push({
        id: row.id, hospitalCode: row.hospitalCode, name: row.name, status: row.status, createdAt: row.createdAt,
        parentId: parent?.id ?? null, parentName: parent?.name ?? null,
      });
    }
    if (rows.length < BATCH) return hospitals;
    afterId = rows.at(-1)?.id;
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const groups = findDuplicateHospitalNames(await loadHospitals(prisma));
    if (groups.length === 0) {
      console.log("ไม่พบชื่อโรงพยาบาลซ้ำ");
      return;
    }
    for (const group of groups) {
      console.log(group.scope === "GLOBAL" ? `\n[ทั้งระบบ] ${group.normalizedName}` : `\n[เครือข่ายของ ${group.parentName ?? "-"}] ${group.normalizedName}`);
      for (const hospital of group.hospitals) {
        console.log(`  ${hospital.hospitalCode}  ${hospital.name}  ${hospital.status}  ขึ้นทะเบียน ${hospital.createdAt.toISOString().slice(0, 10)}  id=${hospital.id}`);
      }
    }
    console.log(`\nพบ ${groups.length} กลุ่ม (ทั้งระบบ ${groups.filter(({ scope }) => scope === "GLOBAL").length}, ในเครือข่าย ${groups.filter(({ scope }) => scope === "NETWORK").length})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/gu, "/").endsWith("scripts/report-duplicate-hospital-names.ts")) {
  main().catch((error: unknown) => {
    console.error("รายงานชื่อซ้ำไม่สำเร็จ", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
