-- Migration: Enable Realtime for campaign_status_updates table
-- Schema: citia_mora_datamart
-- Date: 2025-12-10

-- Enable Realtime for campaign_status_updates table
-- This allows Supabase Realtime to send updates when rows are inserted/updated
ALTER PUBLICATION supabase_realtime ADD TABLE citia_mora_datamart.campaign_status_updates;

-- Verify Realtime is enabled
-- Run this query to check:
-- SELECT 
--   schemaname,
--   tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
--   AND schemaname = 'citia_mora_datamart'
--   AND tablename = 'campaign_status_updates';

-- Note: If table is already in publication, this will error but that's OK
-- The table will still be enabled for Realtime

