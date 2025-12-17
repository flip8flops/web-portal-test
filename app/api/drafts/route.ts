import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
// Prefer service role key for API endpoints (bypasses RLS)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  console.error('   SUPABASE_ANON_KEY (fallback):', process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
}

// Use service role key if available, otherwise fallback to anon key
// Service role key bypasses RLS and has full access
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * GET /api/drafts
 * Get draft campaign with audiences that have broadcast_content
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('🔍 GET /api/drafts - Starting...');
    console.log('🔍 Supabase URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING');
    console.log('🔍 Service Key:', supabaseServiceKey ? `${supabaseServiceKey.substring(0, 20)}...` : 'MISSING');
    
    const searchParams = request.nextUrl.searchParams;
    const campaignId = searchParams.get('campaign_id');
    console.log('🔍 Request campaign_id param:', campaignId || 'none');

    // Find latest campaign with status "content_drafted"
    let latestDraftCampaignId = campaignId;

    if (!latestDraftCampaignId) {
      console.log('🔍 Querying campaign table for status="content_drafted"...');
      
      // Try multiple approaches to find draft campaign
      // Approach 1: Direct query to campaign table
      const { data: campaignData, error: campaignError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign')
        .select('id, status, updated_at')
        .eq('status', 'content_drafted')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (campaignError) {
        console.error('❌ Error querying campaign table:', campaignError);
        console.error('❌ Error code:', campaignError.code);
        console.error('❌ Error message:', campaignError.message);
        console.error('❌ Error hint:', campaignError.hint);
        
        // If permission error, try fallback
        if (campaignError.code === '42501' || campaignError.message?.includes('permission')) {
          console.log('⚠️ Permission error detected, trying campaign_status_updates...');
        }
      }

      if (!campaignError && campaignData && campaignData.id) {
        latestDraftCampaignId = campaignData.id;
        console.log('✅ Found draft campaign from campaign.status:', latestDraftCampaignId);
      } else {
        console.log('ℹ️ No campaign found with status="content_drafted", trying campaign_status_updates...');
        
        // Approach 2: Check campaign_status_updates with message cpgDrafted
        const { data: statusData, error: statusError } = await supabase
          .schema('citia_mora_datamart')
          .from('campaign_status_updates')
          .select('campaign_id, message, updated_at')
          .ilike('message', '%cpgDrafted%')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (statusError) {
          console.error('❌ Error querying campaign_status_updates:', statusError);
        }

        if (!statusError && statusData && statusData.campaign_id) {
          latestDraftCampaignId = statusData.campaign_id;
          console.log('✅ Found draft campaign from campaign_status_updates:', latestDraftCampaignId);
        } else {
          console.log('ℹ️ No draft campaign found in campaign_status_updates either');
        }
      }
    }

    if (!latestDraftCampaignId) {
      console.log('⚠️ No draft campaign ID found, returning null');
      return NextResponse.json({
        draft: null,
        campaign_id: null,
        message: 'No draft campaign found'
      });
    }

    console.log('✅ Using draft campaign ID:', latestDraftCampaignId);

    // Get campaign info
    console.log('🔍 Fetching campaign info for ID:', latestDraftCampaignId);
    const { data: campaignData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, name, objective, image_url, created_at, updated_at')
      .eq('id', latestDraftCampaignId)
      .single();

    if (campaignError) {
      console.error('❌ Error fetching campaign:', campaignError);
      console.error('❌ Error code:', campaignError.code);
      console.error('❌ Error message:', campaignError.message);
      return NextResponse.json(
        { error: 'Failed to fetch campaign', details: campaignError.message },
        { status: 500 }
      );
    }

    if (!campaignData) {
      console.error('❌ Campaign data is null for ID:', latestDraftCampaignId);
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    console.log('✅ Campaign info fetched:', campaignData.id, campaignData.name);

    // Get campaign audiences with broadcast_content
    console.log('🔍 Fetching campaign audiences with broadcast_content...');
    const { data: audienceData, error: audienceError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select(`
        campaign_id,
        audience_id,
        broadcast_content,
        meta,
        target_status,
        created_at,
        updated_at
      `)
      .eq('campaign_id', latestDraftCampaignId)
      .not('broadcast_content', 'is', null)
      .neq('broadcast_content', '');

    if (audienceError) {
      console.error('❌ Error fetching audiences:', audienceError);
      console.error('❌ Error code:', audienceError.code);
      console.error('❌ Error message:', audienceError.message);
      return NextResponse.json(
        { error: 'Failed to fetch audiences', details: audienceError.message },
        { status: 500 }
      );
    }

    console.log('✅ Found', audienceData?.length || 0, 'audiences with broadcast_content');

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
        character_count: item.broadcast_content ? item.broadcast_content.length : 0,
        guardrails_tag: guardrails.tag || 'needs_review',
        guardrails_status: guardrails.status || 'approved',
        guardrails_violations: guardrails.violations || [],
        matchmaker_reason: meta.matchmaker_reason,
        target_status: item.target_status || 'pending',
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    console.log('✅ Returning draft data with', audiences.length, 'audiences');
    
    return NextResponse.json({
      draft: {
        campaign_id: campaignData.id,
        campaign_name: campaignData.name || 'Untitled Campaign',
        campaign_objective: campaignData.objective,
        campaign_image_url: campaignData.image_url,
        audiences,
        created_at: campaignData.created_at,
        updated_at: campaignData.updated_at,
      },
      campaign_id: campaignData.id, // Also return campaign_id for easier access
    });
  } catch (error) {
    console.error('Error in GET /api/drafts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
