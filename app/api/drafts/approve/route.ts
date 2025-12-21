import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
}

/**
 * POST /api/drafts/approve
 * Approve campaign and selected audiences
 * - Updates campaign.status to 'approved'
 * - Updates campaign_audience.target_status to 'approved' for selected audiences
 * - Updates campaign_audience.target_status to 'rejected' for non-selected audiences
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Create FRESH client for each request
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const body = await request.json();
    const { campaign_id, audience_ids } = body;

    console.log(`\n✅ [POST /api/drafts/approve] ==========================================`);
    console.log(`✅ [POST /api/drafts/approve] Campaign ID: ${campaign_id}`);
    console.log(`✅ [POST /api/drafts/approve] Selected audiences: ${audience_ids?.length || 0}`);

    if (!campaign_id) {
      return createResponse({ error: 'campaign_id is required' }, 400);
    }

    if (!Array.isArray(audience_ids) || audience_ids.length === 0) {
      return createResponse({ error: 'audience_ids is required and must be non-empty array' }, 400);
    }

    const approveTimestamp = new Date().toISOString();
    console.log(`   Timestamp: ${approveTimestamp}`);

    // Step 1: Update campaign.status to 'approved' (SOURCE OF TRUTH)
    console.log('📝 Step 1: Updating campaign.status to approved...');
    const { data: campaignData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .update({
        status: 'approved',
        updated_at: approveTimestamp,
      })
      .eq('id', campaign_id)
      .select('id, status, updated_at');

    if (campaignError) {
      console.error('❌ Error updating campaign:', campaignError.message);
      return createResponse({
        error: 'Failed to update campaign status',
        details: campaignError.message,
      }, 500);
    }

    if (campaignData && campaignData.length > 0) {
      console.log('✅ Campaign updated:', campaignData[0]);
    } else {
      console.warn('⚠️ No campaign found with ID:', campaign_id);
    }

    // Step 2: Get all audience IDs for this campaign
    console.log('📝 Step 2: Getting all audiences for this campaign...');
    const { data: allAudiences, error: allAudiencesError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select('audience_id')
      .eq('campaign_id', campaign_id);

    if (allAudiencesError) {
      console.error('❌ Error fetching all audiences:', allAudiencesError.message);
    }

    const allAudienceIds = allAudiences?.map(a => a.audience_id) || [];
    const selectedSet = new Set(audience_ids);
    const nonSelectedIds = allAudienceIds.filter(id => !selectedSet.has(id));

    console.log(`   Total audiences: ${allAudienceIds.length}`);
    console.log(`   Selected (approved): ${audience_ids.length}`);
    console.log(`   Non-selected (rejected): ${nonSelectedIds.length}`);

    // Step 3: Update selected audiences to 'approved'
    console.log('📝 Step 3: Updating selected audiences to approved...');
    const { data: approvedData, error: approveError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .update({
        target_status: 'approved',
        updated_at: approveTimestamp,
      })
      .eq('campaign_id', campaign_id)
      .in('audience_id', audience_ids)
      .select('id, audience_id, target_status');

    if (approveError) {
      console.error('❌ Error approving audiences:', approveError.message);
    } else {
      console.log(`✅ Approved ${approvedData?.length || 0} audience(s)`);
    }

    // Step 4: Update non-selected audiences to 'rejected'
    if (nonSelectedIds.length > 0) {
      console.log('📝 Step 4: Updating non-selected audiences to rejected...');
      const { data: rejectedData, error: rejectError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .update({
          target_status: 'rejected',
          updated_at: approveTimestamp,
        })
        .eq('campaign_id', campaign_id)
        .in('audience_id', nonSelectedIds)
        .select('id, audience_id, target_status');

      if (rejectError) {
        console.error('❌ Error rejecting non-selected audiences:', rejectError.message);
      } else {
        console.log(`✅ Rejected ${rejectedData?.length || 0} non-selected audience(s)`);
      }
    } else {
      console.log('📝 Step 4: Skipped - all audiences were selected');
    }

    // Step 5: Insert status update record
    console.log('📝 Step 5: Inserting status update...');
    const { error: statusError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_status_updates')
      .insert({
        campaign_id,
        agent_name: 'broadcast_approve',
        status: 'completed',
        message: 'cpgApproved',
        progress: 100,
        metadata: {
          workflow_point: 'broadcast_approved',
          approved_at: approveTimestamp,
          approved_by: 'admin',
          approved_count: audience_ids.length,
          rejected_count: nonSelectedIds.length,
        },
      });

    if (statusError) {
      console.error('❌ Error inserting status update:', statusError.message);
      // Continue anyway - campaign.status is already updated
    } else {
      console.log('✅ Status update inserted');
    }

    console.log(`✅ [POST /api/drafts/approve] Campaign approved successfully`);
    console.log(`✅ [POST /api/drafts/approve] ==========================================\n`);

    return createResponse({
      success: true,
      message: 'Campaign approved successfully',
      campaign_id,
      approved_count: audience_ids.length,
      rejected_count: nonSelectedIds.length,
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    return createResponse({
      error: 'Internal server error',
      details: error?.message,
    }, 500);
  }
}

function createResponse(data: any, status: number = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
