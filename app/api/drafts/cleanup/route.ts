import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/drafts/cleanup
 * Cleanup multiple draft campaigns - keep only the latest one
 * This endpoint should be called manually when needed
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('🔍 Starting cleanup of draft campaigns...');

    // Get all campaigns with status 'content_drafted'
    const { data: draftCampaigns, error: fetchError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, status, updated_at, name')
      .eq('status', 'content_drafted')
      .order('updated_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching draft campaigns:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch draft campaigns', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!draftCampaigns || draftCampaigns.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No campaigns with status "content_drafted" found. Nothing to cleanup.',
        kept: 0,
        updated: 0,
      });
    }

    if (draftCampaigns.length === 1) {
      return NextResponse.json({
        success: true,
        message: 'Only one draft campaign found. No cleanup needed.',
        kept: 1,
        updated: 0,
        kept_campaign_id: draftCampaigns[0].id,
      });
    }

    // Keep the latest one (first in the sorted list)
    const latestCampaign = draftCampaigns[0];
    const olderCampaigns = draftCampaigns.slice(1);

    console.log(`✅ Keeping latest campaign: ${latestCampaign.id}`);
    console.log(`📝 Will update ${olderCampaigns.length} older campaign(s) to "rejected" status...`);

    // Update older campaigns to 'rejected'
    const campaignIdsToUpdate = olderCampaigns.map(c => c.id);
    
    const { error: updateError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .in('id', campaignIdsToUpdate);

    if (updateError) {
      console.error('Error updating campaigns:', updateError);
      return NextResponse.json(
        { error: 'Failed to update campaigns', details: updateError.message },
        { status: 500 }
      );
    }

    // Insert status updates for rejected campaigns
    const statusUpdates = olderCampaigns.map(campaign => ({
      campaign_id: campaign.id,
      agent_name: 'broadcast_reject',
      status: 'rejected',
      message: 'cpgRejected',
      progress: 0,
      metadata: {
        workflow_point: 'broadcast_rejected',
        rejected_at: new Date().toISOString(),
        rejected_by: 'cleanup_api',
        reason: 'Auto-rejected by cleanup API (multiple draft campaigns)',
      },
    }));

    const { error: statusError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_status_updates')
      .insert(statusUpdates);

    if (statusError) {
      console.warn('Warning: Failed to insert status updates:', statusError);
      // Don't fail, campaign statuses were updated
    }

    console.log('✅ Cleanup completed successfully!');

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      kept: 1,
      updated: olderCampaigns.length,
      kept_campaign_id: latestCampaign.id,
      updated_campaign_ids: campaignIdsToUpdate,
    });
  } catch (error) {
    console.error('Error in POST /api/drafts/cleanup:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
