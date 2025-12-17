import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/drafts/reject
 * Reject draft campaign
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { campaign_id } = body;

    if (!campaign_id) {
      return NextResponse.json(
        { error: 'campaign_id is required' },
        { status: 400 }
      );
    }

    // Insert status update: campaign rejected
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
          rejected_at: new Date().toISOString(),
          rejected_by: 'admin', // TODO: Get from session
        },
      });

    if (statusError) {
      console.error('Error inserting reject status:', statusError);
      return NextResponse.json(
        { error: 'Failed to update campaign status' },
        { status: 500 }
      );
    }

    // Update all campaign_audience records to rejected
    const { error: updateError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .update({
        target_status: 'rejected',
        meta: {
          rejection: {
            rejected_at: new Date().toISOString(),
            rejected_by: 'admin',
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaign_id);

    if (updateError) {
      console.error('Error updating audience status:', updateError);
      // Don't fail if this errors, status update is more important
    }

    return NextResponse.json({
      success: true,
      message: 'Campaign rejected successfully',
    });
  } catch (error) {
    console.error('Error in POST /api/drafts/reject:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
