import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
// Use anon key (same as other endpoints) to match permissions
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * POST /api/drafts/reject
 * Reject draft campaign
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { campaign_id } = body;

    console.log('🚫 POST /api/drafts/reject - Starting...');
    console.log('   Campaign ID:', campaign_id);

    if (!campaign_id) {
      console.error('❌ Missing campaign_id');
      return NextResponse.json(
        { error: 'campaign_id is required' },
        { status: 400 }
      );
    }

    const rejectTimestamp = new Date().toISOString();
    console.log('   Reject timestamp:', rejectTimestamp);

    // Step 1: Insert status update: campaign rejected
    console.log('📝 Step 1: Inserting reject status to campaign_status_updates...');
    const { data: statusData, error: statusError } = await supabase
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
      })
      .select('id, campaign_id, agent_name, status, message');

    if (statusError) {
      console.error('❌ Error inserting reject status:', statusError);
      console.error('   Error code:', statusError.code);
      console.error('   Error message:', statusError.message);
      console.error('   Error details:', statusError.details);
      return NextResponse.json(
        { error: 'Failed to update campaign status', details: statusError.message },
        { status: 500 }
      );
    }

    if (statusData && statusData.length > 0) {
      console.log('✅ Status update inserted successfully:', statusData[0]);
    } else {
      console.warn('⚠️ Status update returned no data');
    }

    // Step 2: Update campaign status to rejected
    console.log('📝 Step 2: Updating campaign.status to rejected...');
    const { data: campaignUpdateData, error: campaignUpdateError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .update({
        status: 'rejected',
        updated_at: rejectTimestamp,
      })
      .eq('id', campaign_id)
      .select('id, status, updated_at');

    if (campaignUpdateError) {
      console.error('❌ Error updating campaign status:', campaignUpdateError);
      console.error('   Error code:', campaignUpdateError.code);
      console.error('   Error message:', campaignUpdateError.message);
      console.error('   Error details:', campaignUpdateError.details);
      console.warn('⚠️ Continuing despite campaign update error (status update is more important)');
    } else {
      if (campaignUpdateData && campaignUpdateData.length > 0) {
        console.log('✅ Campaign status updated successfully:', campaignUpdateData[0]);
      } else {
        console.warn('⚠️ Campaign update returned no data (might indicate no rows matched)');
      }
    }

    // Step 3: Update all campaign_audience records to rejected
    console.log('📝 Step 3: Updating campaign_audience.target_status to rejected...');
    const { data: audienceUpdateData, error: updateError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .update({
        target_status: 'rejected',
        meta: {
          rejection: {
            rejected_at: rejectTimestamp,
            rejected_by: 'admin',
          },
        },
        updated_at: rejectTimestamp,
      })
      .eq('campaign_id', campaign_id)
      .select('id, campaign_id, target_status');

    if (updateError) {
      console.error('❌ Error updating audience status:', updateError);
      console.error('   Error code:', updateError.code);
      console.error('   Error message:', updateError.message);
      console.warn('⚠️ Continuing despite audience update error (status update is more important)');
    } else {
      if (audienceUpdateData) {
        console.log(`✅ Updated ${audienceUpdateData.length} audience record(s) to rejected`);
      } else {
        console.warn('⚠️ Audience update returned no data');
      }
    }

    console.log('✅ Campaign rejected successfully');
    return NextResponse.json({
      success: true,
      message: 'Campaign rejected successfully',
    });
  } catch (error: any) {
    console.error('❌ Error in POST /api/drafts/reject:', error);
    console.error('   Error type:', error?.constructor?.name);
    console.error('   Error message:', error?.message);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
