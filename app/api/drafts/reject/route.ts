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
 * POST /api/drafts/reject
 * Reject draft campaign - updates campaign.status to 'rejected'
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
    const { campaign_id } = body;

    console.log(`\n🚫 [POST /api/drafts/reject] ==========================================`);
    console.log(`🚫 [POST /api/drafts/reject] Campaign ID: ${campaign_id}`);

    if (!campaign_id) {
      console.error('❌ Missing campaign_id');
      return createResponse({ error: 'campaign_id is required' }, 400);
    }

    const rejectTimestamp = new Date().toISOString();
    console.log(`   Timestamp: ${rejectTimestamp}`);

    // Step 1: Update campaign.status to 'rejected' FIRST (source of truth)
    console.log('📝 Step 1: Updating campaign.status to rejected...');
    const { data: campaignData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .update({
        status: 'rejected',
        updated_at: rejectTimestamp,
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

    // Step 2: Insert status update record
    console.log('📝 Step 2: Inserting status update...');
    const { error: statusError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_status_updates')
      .insert({
        campaign_id,
        agent_name: 'broadcast_reject',
        status: 'rejected',
        message: 'cpgRejected',
        progress: 0,
        metadata: {
          workflow_point: 'broadcast_rejected',
          rejected_at: rejectTimestamp,
          rejected_by: 'admin',
        },
      });

    if (statusError) {
      console.error('❌ Error inserting status update:', statusError.message);
      // Continue anyway - campaign.status is already updated
    } else {
      console.log('✅ Status update inserted');
    }

    // Step 3: Update campaign_audience records
    console.log('📝 Step 3: Updating audience records...');
    const { data: audienceData, error: audienceError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .update({
        target_status: 'rejected',
        updated_at: rejectTimestamp,
      })
      .eq('campaign_id', campaign_id)
      .select('id');

    if (audienceError) {
      console.error('❌ Error updating audiences:', audienceError.message);
      // Continue anyway
    } else {
      console.log(`✅ Updated ${audienceData?.length || 0} audience records`);
    }

    console.log(`✅ [POST /api/drafts/reject] Campaign rejected successfully`);
    console.log(`🚫 [POST /api/drafts/reject] ==========================================\n`);

    return createResponse({
      success: true,
      message: 'Campaign rejected successfully',
      campaign_id,
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
