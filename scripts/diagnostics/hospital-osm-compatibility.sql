-- Authorized review only. No identity, credential, Patient or provider fields are selected.
-- Run the whole file with psql -X --set=ON_ERROR_STOP=1 --file=... using a read-only database role.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH workforce AS (
  SELECT m."userId", 'HOSPITAL'::text AS category, m.id AS relationship_id,
         m."hospitalId", m.status::text AS status,
         m."membershipType"::text AS membership_type, m.profession::text AS profession
  FROM "HospitalMembership" AS m
  UNION ALL
  SELECT o."userId", 'OSM'::text AS category, o.id AS relationship_id,
         o."hospitalId", o.status::text AS status,
         NULL::text AS membership_type, NULL::text AS profession
  FROM "OsmHospitalRelationship" AS o
), status_counts AS (
  SELECT "userId", category, status, count(*) AS relationship_count
  FROM workforce
  GROUP BY "userId", category, status
), breakdown AS (
  SELECT "userId", jsonb_agg(jsonb_build_object(
    'category', category, 'status', status, 'count', relationship_count
  ) ORDER BY category, status) AS status_breakdown
  FROM status_counts
  GROUP BY "userId"
), summary AS (
  SELECT w."userId",
         count(*) FILTER (WHERE w.category = 'HOSPITAL' AND w.status <> 'ENDED') AS hospital_non_ended,
         count(*) FILTER (WHERE w.category = 'OSM' AND w.status <> 'ENDED') AS osm_non_ended,
         jsonb_agg(jsonb_build_object(
           'category', w.category, 'relationshipId', w.relationship_id,
           'hospitalId', w."hospitalId", 'hospitalCode', h."hospitalCode",
           'hospitalStatus', h.status, 'status', w.status,
           'membershipType', w.membership_type, 'profession', w.profession
         ) ORDER BY w.category, w."hospitalId", w.relationship_id) AS hospital_scopes
  FROM workforce AS w
  JOIN "Hospital" AS h ON h.id = w."hospitalId"
  GROUP BY w."userId"
  HAVING bool_or(w.category = 'HOSPITAL') AND bool_or(w.category = 'OSM')
)
SELECT u.id AS user_id, u.status AS account_status,
       CASE WHEN s.hospital_non_ended > 0 AND s.osm_non_ended > 0 THEN 'CURRENT_CONFLICT'
            WHEN s.hospital_non_ended = 0 AND s.osm_non_ended = 0 THEN 'ENDED_ONLY_HISTORY'
            ELSE 'HISTORICAL_CATEGORY_OVERLAP' END AS review_outcome,
       s.hospital_non_ended, s.osm_non_ended, b.status_breakdown, s.hospital_scopes
FROM summary AS s
JOIN "User" AS u ON u.id = s."userId"
JOIN breakdown AS b ON b."userId" = s."userId"
ORDER BY review_outcome, u.id;

COMMIT;
