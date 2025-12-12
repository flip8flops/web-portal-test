-- Migration: Create view in public schema for campaign_status_updates
-- This allows Supabase PostgREST to query the table via public schema
-- Schema: public (for Supabase API access)
-- Date: 2025-12-10

-- Create view in public schema that points to citia_mora_datamart.campaign_status_updates
CREATE OR REPLACE VIEW public.campaign_status_updates AS
SELECT 
  id,
  campaign_id,
  execution_id,
  agent_name,
  status,
  message,
  progress,
  error_message,
  metadata,
  created_at,
  updated_at
FROM citia_mora_datamart.campaign_status_updates;

-- Grant permissions for authenticated users
GRANT SELECT ON public.campaign_status_updates TO authenticated;
GRANT SELECT ON public.campaign_status_updates TO anon;

-- Add comment
COMMENT ON VIEW public.campaign_status_updates IS 'View for campaign status updates from citia_mora_datamart schema, accessible via Supabase PostgREST API';

