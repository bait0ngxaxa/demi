-- DEMI accesses application data through Prisma and server-side services, so Supabase
-- Data API roles must not inherit access to current or future objects in public.
-- Plain PostgreSQL databases without those roles intentionally skip this hardening.

DO $$
DECLARE
    data_api_role NAME;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    ) THEN
        FOR data_api_role IN
            SELECT rolname
            FROM pg_roles
            WHERE rolname IN ('anon', 'authenticated', 'service_role')
        LOOP
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
                data_api_role
            );
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
                data_api_role
            );
            EXECUTE format(
                'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I',
                data_api_role
            );

            -- Omitting FOR ROLE binds these defaults to the role running Prisma migrations.
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
                data_api_role
            );
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
                data_api_role
            );
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',
                data_api_role
            );
        END LOOP;

        -- Functions grant EXECUTE to PUBLIC by default; the global default must be revoked
        -- because a schema-scoped default cannot override PostgreSQL's global default grant.
        REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
        ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    END IF;
END
$$;
