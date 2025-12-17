import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
// Use anon key (same as StatusDisplay component) to match permissions
// StatusDisplay successfully queries campaign_status_updates with anon key
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
  console.error('   SUPABASE_ANON_KEY (fallback):', process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
}

// Use anon key (same as StatusDisplay) to ensure same permission level
// This matches the client-side approach that successfully queries campaign_status_updates
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
      console.log('🔍 Querying for draft campaign...');
      
      // Approach: Use campaign_status_updates first (same as StatusDisplay component)
      // This works because StatusDisplay successfully queries this table
      console.log('🔍 Step 1: Querying campaign_status_updates for cpgDrafted message...');
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
        console.error('❌ Error code:', statusError.code);
        console.error('❌ Error message:', statusError.message);
      } else if (statusData && statusData.campaign_id) {
        latestDraftCampaignId = statusData.campaign_id;
        console.log('✅ Found draft campaign from campaign_status_updates:', latestDraftCampaignId);
      } else {
        console.log('ℹ️ No cpgDrafted message found, trying to find by campaign.status...');
        
        // Fallback: Try direct query to campaign table
        // Note: This might fail with permission error, but we'll try anyway
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
          console.log('⚠️ Permission error on campaign table - this is expected if RLS is strict');
        } else if (campaignData && campaignData.id) {
          latestDraftCampaignId = campaignData.id;
          console.log('✅ Found draft campaign from campaign.status:', latestDraftCampaignId);
        } else {
          console.log('ℹ️ No campaign found with status="content_drafted"');
        }
      }
    }

    if (!latestDraftCampaignId) {
      console.log('⚠️ No draft campaign ID found, returning null');
      console.log('⚠️ This could mean:');
      console.log('   1. No campaign with status="content_drafted" exists');
      console.log('   2. SUPABASE_SERVICE_ROLE_KEY is not set (check Coolify environment variables)');
      console.log('   3. Permission issue accessing citia_mora_datamart.campaign table');
      return NextResponse.json({
        draft: null,
        campaign_id: null,
        message: 'No draft campaign found',
        debug: {
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
          supabaseUrl: supabaseUrl ? 'SET' : 'MISSING',
        }
      });
    }

    console.log('✅ Using draft campaign ID:', latestDraftCampaignId);

    // Get campaign info
    // Try to get campaign info from campaign_status_updates first (which we know works)
    console.log('🔍 Fetching campaign info for ID:', latestDraftCampaignId);
    
    // First, try to get campaign info from campaign_status_updates (which we know has access)
    let campaignData: any = null;
    let campaignName = 'Untitled Campaign';
    let campaignObjective = '';
    let campaignImageUrl = null;
    let campaignCreatedAt = new Date().toISOString();
    let campaignUpdatedAt = new Date().toISOString();
    
    // Try to get campaign info from campaign table
    const { data: campaignTableData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, name, objective, image_url, created_at, updated_at')
      .eq('id', latestDraftCampaignId)
      .single();

    if (campaignError) {
      console.error('❌ Error fetching campaign from campaign table:', campaignError);
      console.error('❌ Error code:', campaignError.code);
      console.error('❌ Error message:', campaignError.message);
      console.log('⚠️ Cannot access campaign table, will use campaign_status_updates data instead');
      
      // Fallback: Get campaign info from campaign_status_updates
      // We'll use the campaign_id and try to infer other info from status updates
      const { data: statusUpdates, error: statusError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_status_updates')
        .select('campaign_id, message, metadata, created_at, updated_at')
        .eq('campaign_id', latestDraftCampaignId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (!statusError && statusUpdates) {
        campaignName = statusUpdates.metadata?.campaign_name || 'Untitled Campaign';
        campaignObjective = statusUpdates.metadata?.campaign_objective || '';
        campaignImageUrl = statusUpdates.metadata?.campaign_image_url || null;
        campaignCreatedAt = statusUpdates.created_at || campaignCreatedAt;
        campaignUpdatedAt = statusUpdates.updated_at || campaignUpdatedAt;
        console.log('✅ Using campaign info from campaign_status_updates');
      }
    } else if (campaignTableData) {
      campaignData = campaignTableData;
      campaignName = campaignTableData.name || 'Untitled Campaign';
      campaignObjective = campaignTableData.objective || '';
      campaignImageUrl = campaignTableData.image_url;
      campaignCreatedAt = campaignTableData.created_at;
      campaignUpdatedAt = campaignTableData.updated_at;
      console.log('✅ Campaign info fetched from campaign table:', campaignData.id, campaignData.name);
    } else {
      console.error('❌ Campaign data is null for ID:', latestDraftCampaignId);
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

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
      console.log('⚠️ Cannot access campaign_audience table, returning minimal data');
      
      // Return minimal data with campaign_id at least
      return NextResponse.json({
        draft: {
          campaign_id: latestDraftCampaignId,
          campaign_name: campaignName,
          campaign_objective: campaignObjective,
          campaign_image_url: campaignImageUrl,
          audiences: [], // Empty array if we can't access campaign_audience
          created_at: campaignCreatedAt,
          updated_at: campaignUpdatedAt,
        },
        campaign_id: latestDraftCampaignId,
        warning: 'Could not fetch audiences due to permission error. Please check database permissions.',
      });
    }

    console.log('✅ Found', audienceData?.length || 0, 'audiences with broadcast_content');

    // Get audience details separately
    const audienceIds = (audienceData || []).map((item: any) => item.audience_id);
    
    let audienceDetails: any[] = [];
    if (audienceIds.length > 0) {
      console.log('🔍 Fetching audience details for', audienceIds.length, 'audiences...');
      const { data: detailsData, error: detailsError } = await supabase
        .schema('citia_mora_datamart')
        .from('audience')
        .select('id, full_name, source_contact_id, wa_opt_in, telegram_username')
        .in('id', audienceIds);

      if (detailsError) {
        console.error('❌ Error fetching audience details:', detailsError);
        console.log('⚠️ Will use minimal audience data from campaign_audience');
      } else if (detailsData) {
        audienceDetails = detailsData;
        console.log('✅ Fetched', audienceDetails.length, 'audience details');
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
        campaign_id: latestDraftCampaignId,
        campaign_name: campaignName,
        campaign_objective: campaignObjective,
        campaign_image_url: campaignImageUrl,
        audiences,
        created_at: campaignCreatedAt,
        updated_at: campaignUpdatedAt,
      },
      campaign_id: latestDraftCampaignId, // Also return campaign_id for easier access
    });
  } catch (error) {
    console.error('Error in GET /api/drafts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
