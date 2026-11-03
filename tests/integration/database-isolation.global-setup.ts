import { PrismaClient } from "@prisma/client";

import { assertDisposableIntegrationDatabase, assertDisposableIntegrationEnvironment } from "../../scripts/integration-environment.mjs";
import { LEGAL_DOCUMENT_TITLES } from "../../src/modules/legal/domain/legal-documents";

// Once per Vitest run, before test modules (including their destructive cleanup) load.
export default async function setup(): Promise<void> {
  const integrationDatabaseUrl = assertDisposableIntegrationEnvironment(process.env);
  const prisma = new PrismaClient({ datasources: { db: { url: integrationDatabaseUrl } } });
  try {
    await prisma.$transaction(async (transaction) => {
      await assertDisposableIntegrationDatabase(transaction);
      await transaction.$executeRaw`
        DO $demi_integration_reset$
        DECLARE
          tables_to_truncate text;
        BEGIN
          SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
          INTO tables_to_truncate
          FROM pg_catalog.pg_tables
          WHERE schemaname = 'public'
            AND tablename NOT IN (
              '_prisma_migrations',
              'AppointmentLineNotificationWorkerState',
              'MedicationLineReminderWorkerState',
              'NotificationSchedulerState'
            );

          IF tables_to_truncate IS NOT NULL THEN
            EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate || ' RESTART IDENTITY CASCADE';
          END IF;
        END
        $demi_integration_reset$;
      `;
      await transaction.appointmentLineNotificationWorkerState.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: { lastInvocationAt: new Date(0) },
      });
      await transaction.medicationLineReminderWorkerState.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: { lastInvocationAt: new Date(0) },
      });
      await transaction.notificationSchedulerState.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: { lastTickCompletedAt: null, lastTickStatus: null },
      });
      // The TRUNCATE above also removes the PUBLISHED placeholder versions seeded by migration
      // 20261204100000_legal_documents_and_consents; restore them so every account-creation flow has a current version.
      await transaction.legalDocumentVersion.createMany({
        data: (Object.keys(LEGAL_DOCUMENT_TITLES) as Array<keyof typeof LEGAL_DOCUMENT_TITLES>).map((kind) => ({
          kind,
          versionLabel: "placeholder-1",
          title: LEGAL_DOCUMENT_TITLES[kind],
          body: `ร่าง — รอข้อความจากหน่วยงาน\n\n${LEGAL_DOCUMENT_TITLES[kind]} (ฉบับชั่วคราวสำหรับการทดสอบ)`,
          isPlaceholder: true,
          status: "PUBLISHED" as const,
          publishedAt: new Date("2026-11-01T00:00:00.000Z"),
        })),
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}
