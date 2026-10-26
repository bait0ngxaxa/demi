import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const integrationDatabaseUrl = process.env.DEMI_TEST_DATABASE_URL;

if (!databaseUrl || !integrationDatabaseUrl || databaseUrl !== integrationDatabaseUrl) {
  throw new Error("Integration tests require DATABASE_URL to equal DEMI_TEST_DATABASE_URL");
}

const integrationDatabase = new URL(integrationDatabaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(integrationDatabase.hostname)) {
  throw new Error("Integration database isolation only runs against local PostgreSQL");
}

const prisma = new PrismaClient({ datasources: { db: { url: integrationDatabaseUrl } } });

try {
  await prisma.$executeRaw`
    DO $demi_integration_reset$
    DECLARE
      tables_to_truncate text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO tables_to_truncate
      FROM pg_tables
      WHERE schemaname = current_schema()
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
  await Promise.all([
    prisma.appointmentLineNotificationWorkerState.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { lastInvocationAt: new Date(0) },
    }),
    prisma.medicationLineReminderWorkerState.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { lastInvocationAt: new Date(0) },
    }),
    prisma.notificationSchedulerState.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { lastTickCompletedAt: null, lastTickStatus: null },
    }),
  ]);
} finally {
  await prisma.$disconnect();
}
