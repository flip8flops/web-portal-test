import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/drafts
 * Get draft campaign with audiences that have broadcast_content
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const campaignId = searchParams.get('campaign_id');

    // Find latest campaign with status "content_drafted"
    let latestDraftCampaignId = campaignId;

    if (!latestDraftCampaignId) {
      // First, try to find from campaign.status = 'content_drafted'
      const { data: campaignData, error: campaignError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign')
        .select('id, status, updated_at')
        .eq('status', 'content_drafted')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!campaignError && campaignData) {
        latestDraftCampaignId = campaignData.id;
        console.log('✅ Found draft campaign from campaign.status:', latestDraftCampaignId);
      } else {
        // Fallback: check campaign_status_updates with message cpgDrafted
        const { data: statusData, error: statusError } = await supabase
          .schema('citia_mora_datamart')
          .from('campaign_status_updates')
          .select('campaign_id, message, updated_at')
          .ilike('message', '%cpgDrafted%')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!statusError && statusData) {
          latestDraftCampaignId = statusData.campaign_id;
          console.log('✅ Found draft campaign from campaign_status_updates:', latestDraftCampaignId);
        }
      }
    }

    if (!latestDraftCampaignId) {
      return NextResponse.json({
        draft: null,
        message: 'No draft campaign found'
      });
    }

    // Get campaign info
    const { data: campaignData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, name, notes, image_url, created_at, updated_at')
      .eq('id', latestDraftCampaignId)
      .single();

    if (campaignError) {
      console.error('Error fetching campaign:', campaignError);
      return NextResponse.json(
        { error: 'Failed to fetch campaign' },
        { status: 500 }
      );
    }

    // Get campaign audiences with broadcast_content
    // Use RPC or separate queries since Supabase doesn't support direct joins across schemas easily
    const { data: audienceData, error: audienceError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select(`
        campaign_id,
        audience_id,
        broadcast_content,
        character_count,
        meta,
        target_status,
        created_at,
        updated_at
      `)
      .eq('campaign_id', latestDraftCampaignId)
      .not('broadcast_content', 'is', null)
      .neq('broadcast_content', '');

    if (audienceError) {
      console.error('Error fetching audiences:', audienceError);
      return NextResponse.json(
        { error: 'Failed to fetch audiences' },
        { status: 500 }
      );
    }

    // Get audience details separately
    const audienceIds = (audienceData || []).map((item: any) => item.audience_id);
    
    let audienceDetails: any[] = [];
    if (audienceIds.length > 0) {
      const { data: detailsData, error: detailsError } = await supabase
        .schema('citia_mora_datamart')
        .from('audience')
        .select('id, full_name, source_contact_id, wa_opt_in, telegram_username')
        .in('id', audienceIds);

      if (!detailsError && detailsData) {
        audienceDetails = detailsData;
      }
    }

    // Combine data
    const audiences = (audienceData || []).map((item: any) => {
      const audienceDetail = audienceDetails.find((a: any) => a.id === item.audience_id) || {};
      const meta = item.meta || {};
      const guardrails = meta.guardrails || {};

      return {
        campaign_id: item.campaign_id,
        audience_id: item.audience_id,
        audience_name: audienceDetail.full_name || audienceDetail.source_contact_id || 'Unknown',
        source_contact_id: audienceDetail.source_contact_id || '',
        channel: audienceDetail.wa_opt_in ? 'whatsapp' : audienceDetail.telegram_username ? 'telegram' : 'whatsapp',
        broadcast_content: item.broadcast_content || '',
        character_count: item.character_count || 0,
        guardrails_tag: guardrails.tag || 'needs_review',
        guardrails_status: guardrails.status || 'approved',
        guardrails_violations: guardrails.violations || [],
        matchmaker_reason: meta.matchmaker_reason,
        target_status: item.target_status || 'pending',
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    return NextResponse.json({
      draft: {
        campaign_id: campaignData.id,
        campaign_name: campaignData.name || 'Untitled Campaign',
        campaign_objective: campaignData.notes,
        campaign_image_url: campaignData.image_url,
        audiences,
        created_at: campaignData.created_at,
        updated_at: campaignData.updated_at,
      }
    });
  } catch (error) {
    console.error('Error in GET /api/drafts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
