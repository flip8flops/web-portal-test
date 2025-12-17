import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/drafts/approve
 * Approve and send selected drafts
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { campaign_id, audience_ids } = body;

    if (!campaign_id || !Array.isArray(audience_ids) || audience_ids.length === 0) {
      return NextResponse.json(
        { error: 'campaign_id and audience_ids are required' },
        { status: 400 }
      );
    }

    // Update meta for approved audiences
    for (const audienceId of audience_ids) {
      // Get current meta
      const { data: currentData, error: fetchError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .select('meta')
        .eq('campaign_id', campaign_id)
        .eq('audience_id', audienceId)
        .single();

      if (fetchError || !currentData) {
        console.error(`Error fetching audience ${audienceId}:`, fetchError);
        continue;
      }

      const meta = currentData.meta || {};
      const guardrails = meta.guardrails || {};

      // Update meta with approval info
      const updatedMeta = {
        ...meta,
        guardrails: {
          ...guardrails,
          tag: 'approved',
          status: 'approved',
          approved_at: new Date().toISOString(),
        },
        approval: {
          approved_at: new Date().toISOString(),
          approved_by: 'admin', // TODO: Get from session
        },
      };

      // Update database
      const { error: updateError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .update({
          meta: updatedMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', campaign_id)
        .eq('audience_id', audienceId);

      if (updateError) {
        console.error(`Error updating audience ${audienceId}:`, updateError);
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Approved ${audience_ids.length} draft(s)`,
    });
  } catch (error) {
    console.error('Error in POST /api/drafts/approve:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
