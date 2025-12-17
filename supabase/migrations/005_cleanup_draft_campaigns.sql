-- Migration: Cleanup multiple draft campaigns
-- Keep only the latest campaign with status 'content_drafted'
-- Update older ones to 'rejected' status

-- Step 1: Find all campaigns with status 'content_drafted' and their update times
-- Step 2: Keep the latest one (by updated_at DESC)
-- Step 3: Update older ones to 'rejected'

DO $$
DECLARE
    latest_campaign_id UUID;
    older_campaign_ids UUID[];
BEGIN
    -- Get the latest campaign with status 'content_drafted'
    SELECT id INTO latest_campaign_id
    FROM citia_mora_datamart.campaign
    WHERE status = 'content_drafted'
    ORDER BY updated_at DESC
    LIMIT 1;

    -- If no draft campaign found, exit
    IF latest_campaign_id IS NULL THEN
        RAISE NOTICE 'No campaigns with status "content_drafted" found. Nothing to cleanup.';
        RETURN;
    END IF;

    -- Get all older campaign IDs (excluding the latest)
    SELECT ARRAY_AGG(id) INTO older_campaign_ids
    FROM citia_mora_datamart.campaign
    WHERE status = 'content_drafted'
      AND id != latest_campaign_id;

    -- If no older campaigns, exit
    IF older_campaign_ids IS NULL OR array_length(older_campaign_ids, 1) IS NULL THEN
        RAISE NOTICE 'Only one draft campaign found. No cleanup needed.';
        RETURN;
    END IF;

    -- Update older campaigns to 'rejected'
    UPDATE citia_mora_datamart.campaign
    SET 
        status = 'rejected',
        updated_at = NOW()
    WHERE id = ANY(older_campaign_ids);

    RAISE NOTICE 'Updated % campaign(s) to "rejected" status', array_length(older_campaign_ids, 1);

    -- Insert status updates for rejected campaigns
    INSERT INTO citia_mora_datamart.campaign_status_updates (
        campaign_id,
        agent_name,
        status,
        message,
        progress,
        metadata
    )
    SELECT 
        id,
        'broadcast_reject',
        'rejected',
        'cpgRejected',
        0,
        jsonb_build_object(
            'workflow_point', 'broadcast_rejected',
            'rejected_at', NOW(),
            'rejected_by', 'cleanup_script',
            'reason', 'Auto-rejected by cleanup script (multiple draft campaigns)'
        )
    FROM citia_mora_datamart.campaign
    WHERE id = ANY(older_campaign_ids);

    RAISE NOTICE 'Inserted status updates for % rejected campaign(s)', array_length(older_campaign_ids, 1);
    RAISE NOTICE 'Cleanup completed! Kept campaign: %', latest_campaign_id;

END $$;
