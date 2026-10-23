-- Runtime event keys use Date.getTime() (epoch milliseconds). The original AF-3
-- backfill used EXTRACT(EPOCH) seconds, so normalize the three original event kinds.
-- Abort before changing data if either notification uniqueness rule would be violated.
DO $$
BEGIN
  IF EXISTS (
    WITH normalized AS (
      SELECT
        "id",
        "recipientUserId",
        "recipientKind",
        "eventKind"::TEXT || ':' || "appointmentId"::TEXT || ':' ||
          ((EXTRACT(EPOCH FROM "sourceUpdatedAt") * 1000)::BIGINT)::TEXT AS "targetEventKey"
      FROM "AppointmentLineNotification"
      WHERE "eventKind" IN ('CREATED', 'RESCHEDULED', 'CANCELLED')
    )
    SELECT 1
    FROM normalized
    WHERE "recipientUserId" IS NOT NULL
    GROUP BY "targetEventKey", "recipientUserId"
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    WITH normalized AS (
      SELECT
        "id",
        "recipientUserId",
        "recipientKind",
        "eventKind"::TEXT || ':' || "appointmentId"::TEXT || ':' ||
          ((EXTRACT(EPOCH FROM "sourceUpdatedAt") * 1000)::BIGINT)::TEXT AS "targetEventKey"
      FROM "AppointmentLineNotification"
      WHERE "eventKind" IN ('CREATED', 'RESCHEDULED', 'CANCELLED')
    )
    SELECT 1
    FROM normalized AS candidate
    JOIN "AppointmentLineNotification" AS existing
      ON existing."eventKey" = candidate."targetEventKey"
      AND existing."id" NOT IN (SELECT "id" FROM normalized)
      AND (
        (candidate."recipientUserId" IS NOT NULL AND existing."recipientUserId" = candidate."recipientUserId")
        OR (candidate."recipientKind" = 'PATIENT' AND existing."recipientKind" = 'PATIENT')
      )
  ) OR EXISTS (
    WITH normalized AS (
      SELECT
        "id",
        "recipientKind",
        "eventKind"::TEXT || ':' || "appointmentId"::TEXT || ':' ||
          ((EXTRACT(EPOCH FROM "sourceUpdatedAt") * 1000)::BIGINT)::TEXT AS "targetEventKey"
      FROM "AppointmentLineNotification"
      WHERE "eventKind" IN ('CREATED', 'RESCHEDULED', 'CANCELLED')
        AND "recipientKind" = 'PATIENT'
    )
    SELECT 1
    FROM normalized
    GROUP BY "targetEventKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'FIX-2 eventKey normalization would violate appointment notification uniqueness';
  END IF;
END $$;

UPDATE "AppointmentLineNotification"
SET "eventKey" = "eventKind"::TEXT || ':' || "appointmentId"::TEXT || ':' ||
  ((EXTRACT(EPOCH FROM "sourceUpdatedAt") * 1000)::BIGINT)::TEXT
WHERE "eventKind" IN ('CREATED', 'RESCHEDULED', 'CANCELLED');
