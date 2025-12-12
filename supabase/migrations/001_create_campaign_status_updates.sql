-- Migration: Create campaign_status_updates table for real-time status tracking
-- Schema: citia_mora_datamart
-- Date: 2025-12-10

-- Create campaign_status_updates table
CREATE TABLE IF NOT EXISTS citia_mora_datamart.campaign_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES citia_mora_datamart.campaign(id) ON DELETE CASCADE,
  execution_id TEXT, -- n8n execution ID untuk tracking
  agent_name TEXT NOT NULL, -- 'guardrails', 'research_agent', 'matchmaker_agent'
  status TEXT NOT NULL, -- 'thinking', 'processing', 'completed', 'error', 'rejected'
  message TEXT, -- Human-readable message (e.g., "Research Agent sedang menganalisis campaign...")
  progress INTEGER DEFAULT 0, -- 0-100 untuk progress bar (optional)
  error_message TEXT, -- Error message jika status = 'error'
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes untuk performance
CREATE INDEX IF NOT EXISTS idx_campaign_status_updates_campaign_id 
  ON citia_mora_datamart.campaign_status_updates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_status_updates_created_at 
  ON citia_mora_datamart.campaign_status_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_status_updates_agent_status 
  ON citia_mora_datamart.campaign_status_updates(campaign_id, agent_name, created_at DESC);

-- Create function untuk update updated_at automatically
CREATE OR REPLACE FUNCTION citia_mora_datamart.update_campaign_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger untuk auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_campaign_status_updated_at 
  ON citia_mora_datamart.campaign_status_updates;
CREATE TRIGGER trigger_update_campaign_status_updated_at
  BEFORE UPDATE ON citia_mora_datamart.campaign_status_updates
  FOR EACH ROW
  EXECUTE FUNCTION citia_mora_datamart.update_campaign_status_updated_at();

-- Create function untuk get latest status per agent untuk campaign
CREATE OR REPLACE FUNCTION citia_mora_datamart.get_latest_campaign_status(
  p_campaign_id UUID
)
RETURNS TABLE (
  agent_name TEXT,
  status TEXT,
  message TEXT,
  progress INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (csu.agent_name)
    csu.agent_name,
    csu.status,
    csu.message,
    csu.progress,
    csu.updated_at
  FROM citia_mora_datamart.campaign_status_updates csu
  WHERE csu.campaign_id = p_campaign_id
  ORDER BY csu.agent_name, csu.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (optional, bisa diaktifkan later untuk user isolation)
-- ALTER TABLE citia_mora_datamart.campaign_status_updates ENABLE ROW LEVEL SECURITY;

-- Grant permissions (adjust sesuai kebutuhan)
-- GRANT SELECT, INSERT, UPDATE ON citia_mora_datamart.campaign_status_updates TO authenticated;
-- GRANT SELECT, INSERT, UPDATE ON citia_mora_datamart.campaign_status_updates TO anon;

-- Comments untuk dokumentasi
COMMENT ON TABLE citia_mora_datamart.campaign_status_updates IS 'Real-time status updates untuk Broadcast Team Agent workflow';
COMMENT ON COLUMN citia_mora_datamart.campaign_status_updates.campaign_id IS 'Reference ke campaign table';
COMMENT ON COLUMN citia_mora_datamart.campaign_status_updates.execution_id IS 'n8n execution ID untuk tracking';
COMMENT ON COLUMN citia_mora_datamart.campaign_status_updates.agent_name IS 'Nama agent: guardrails, research_agent, matchmaker_agent';
COMMENT ON COLUMN citia_mora_datamart.campaign_status_updates.status IS 'Status: thinking, processing, completed, error, rejected';
COMMENT ON COLUMN citia_mora_datamart.campaign_status_updates.message IS 'Human-readable status message untuk display di UI';

