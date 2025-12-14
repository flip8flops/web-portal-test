-- Migration: Grant permissions for citia_mora_datamart schema access
-- This allows anon and authenticated roles to query campaign_status_updates table
-- Date: 2025-12-10

-- Grant USAGE on schema (required to access schema)
-- Without this, even if schema is exposed in Data API, roles cannot access it
GRANT USAGE ON SCHEMA citia_mora_datamart TO authenticated;
GRANT USAGE ON SCHEMA citia_mora_datamart TO anon;

-- Grant SELECT on campaign_status_updates table
-- Web portal only needs read access (SELECT)
-- INSERT will be done by n8n workflow using service role key
GRANT SELECT ON citia_mora_datamart.campaign_status_updates TO authenticated;
GRANT SELECT ON citia_mora_datamart.campaign_status_updates TO anon;

-- Verify permissions (run this query to check)
-- SELECT 
--   grantee, 
--   privilege_type,
--   table_schema,
--   table_name
-- FROM information_schema.role_table_grants 
-- WHERE table_schema = 'citia_mora_datamart' 
--   AND table_name = 'campaign_status_updates'
--   AND grantee IN ('authenticated', 'anon')
-- ORDER BY grantee, privilege_type;

-- Comments
COMMENT ON SCHEMA citia_mora_datamart IS 'Schema for Citia MORA datamart - permissions granted to authenticated and anon roles for campaign_status_updates table';

