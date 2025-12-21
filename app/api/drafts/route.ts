import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
}

/**
 * GET /api/drafts
 * Get the most recent draft campaign with status='content_drafted'
 * ALWAYS queries fresh data from database (no caching)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Create a FRESH Supabase client for each request to avoid any caching
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const timestamp = new Date().toISOString();
    console.log(`\n🔍 [GET /api/drafts] ==========================================`);
    console.log(`🔍 [GET /api/drafts] Request at: ${timestamp}`);
    
    const searchParams = request.nextUrl.searchParams;
    const campaignIdParam = searchParams.get('campaign_id');
    console.log(`🔍 [GET /api/drafts] campaign_id param: ${campaignIdParam || 'none'}`);

    // STEP 1: Query campaign table for most recent content_drafted
    // This is the SOURCE OF TRUTH - always query fresh
    console.log(`🔍 [GET /api/drafts] STEP 1: Querying campaign table for status="content_drafted"...`);
    
    const { data: campaignData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, status, updated_at')
      .eq('status', 'content_drafted')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (campaignError) {
      console.error(`❌ [GET /api/drafts] Error querying campaign:`, campaignError.message);
      return createResponse({
        draft: null,
        campaign_id: null,
        message: 'Error querying campaigns',
        error: campaignError.message,
      });
    }

    if (!campaignData || !campaignData.id) {
      console.log(`ℹ️ [GET /api/drafts] No campaign with status="content_drafted" found`);
      return createResponse({
        draft: null,
        campaign_id: null,
        message: 'No draft campaign found',
      });
    }

    const latestDraftCampaignId = campaignData.id;
    console.log(`✅ [GET /api/drafts] Found draft campaign: ${latestDraftCampaignId}`);
    console.log(`   Status: ${campaignData.status}`);
    console.log(`   Updated at: ${campaignData.updated_at}`);

    // STEP 2: Get full campaign details
    console.log(`🔍 [GET /api/drafts] STEP 2: Fetching full campaign details...`);
    
    const { data: fullCampaign, error: fullError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, name, objective, meta, matchmaker_strategy, created_at, updated_at, status')
      .eq('id', latestDraftCampaignId)
      .single();

    if (fullError) {
      console.error(`❌ [GET /api/drafts] Error fetching campaign details:`, fullError.message);
      return createResponse({
        draft: null,
        campaign_id: latestDraftCampaignId,
        message: 'Error fetching campaign details',
      });
    }

    // Double-check status is still content_drafted (might have changed between queries)
    if (fullCampaign.status !== 'content_drafted') {
      console.log(`⚠️ [GET /api/drafts] Campaign status changed to "${fullCampaign.status}" - returning null`);
      return createResponse({
        draft: null,
        campaign_id: latestDraftCampaignId,
        message: `Campaign status is "${fullCampaign.status}", not "content_drafted"`,
      });
    }

    // Extract campaign info from meta
    const meta = fullCampaign.meta || {};
    const researchPayload = meta.research_payload || {};
    const campaignBrief = researchPayload.campaign_brief || {};
    
    const campaignName = campaignBrief.title || fullCampaign.name || 'Untitled Campaign';
    const campaignObjective = campaignBrief.objective || fullCampaign.objective || '';
    const originNotes = meta.origin_raw_admin_notes || '';
    const matchmakerResult = meta.matchmaker_result || {};
    let totalMatchedAudience = matchmakerResult.total_matched || 0;
    
    // Get tags
    let campaignTags: string[] = [];
    if (fullCampaign.matchmaker_strategy?.tags && Array.isArray(fullCampaign.matchmaker_strategy.tags)) {
      campaignTags = fullCampaign.matchmaker_strategy.tags;
    } else if (campaignBrief.tags && Array.isArray(campaignBrief.tags)) {
      campaignTags = campaignBrief.tags;
    }

    console.log(`✅ [GET /api/drafts] Campaign info extracted:`);
    console.log(`   Name: ${campaignName}`);
    console.log(`   Tags: ${campaignTags.length}`);

    // STEP 2.5: Get campaign image from campaign_asset and asset tables
    console.log(`🔍 [GET /api/drafts] STEP 2.5: Fetching campaign image asset...`);
    
    let campaignImageUrl: string | null = null;
    
    // First get campaign_asset entries
    const { data: campaignAssets, error: caError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_asset')
      .select('asset_id')
      .eq('campaign_id', latestDraftCampaignId);
    
    if (!caError && campaignAssets && campaignAssets.length > 0) {
      const assetIds = campaignAssets.map((ca: any) => ca.asset_id);
      
      // Get assets and filter for images
      const { data: assets, error: assetError } = await supabase
        .schema('citia_mora_datamart')
        .from('asset')
        .select('id, type, media_url, usage_type')
        .in('id', assetIds)
        .eq('type', 'image');
      
      if (!assetError && assets && assets.length > 0) {
        // Prefer primary_visual, otherwise take first image
        const primaryImage = assets.find((a: any) => a.usage_type === 'primary_visual');
        const imageAsset = primaryImage || assets[0];
        
        if (imageAsset && imageAsset.media_url) {
          campaignImageUrl = imageAsset.media_url;
          console.log(`✅ [GET /api/drafts] Found campaign image: ${imageAsset.media_url.substring(0, 80)}...`);
        }
      }
    }
    
    if (!campaignImageUrl) {
      console.log(`ℹ️ [GET /api/drafts] No image asset found for this campaign`);
    }

    // STEP 3: Get campaign audiences with broadcast_content
    console.log(`🔍 [GET /api/drafts] STEP 3: Fetching audiences with broadcast_content...`);
    
    const { data: audienceData, error: audienceError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select('id, campaign_id, audience_id, broadcast_content, meta, target_status, created_at, updated_at')
      .eq('campaign_id', latestDraftCampaignId)
      .not('broadcast_content', 'is', null)
      .neq('broadcast_content', '')
      .order('updated_at', { ascending: false });

    if (audienceError) {
      console.error(`❌ [GET /api/drafts] Error fetching audiences:`, audienceError.message);
      return createResponse({
        draft: {
          campaign_id: latestDraftCampaignId,
          campaign_name: campaignName,
          campaign_objective: campaignObjective,
          campaign_tags: campaignTags,
          origin_notes: originNotes,
          total_matched_audience: 0,
          audiences: [],
          created_at: fullCampaign.created_at,
          updated_at: fullCampaign.updated_at,
        },
        campaign_id: latestDraftCampaignId,
        warning: 'Could not fetch audiences',
      });
    }

    console.log(`✅ [GET /api/drafts] Found ${audienceData?.length || 0} audience rows`);

    // Deduplicate by audience_id (keep latest)
    const latestByAudience = new Map();
    (audienceData || []).forEach((aud) => {
      const existing = latestByAudience.get(aud.audience_id);
      if (!existing || new Date(aud.updated_at) > new Date(existing.updated_at)) {
        latestByAudience.set(aud.audience_id, aud);
      }
    });
    const deduplicatedData = Array.from(latestByAudience.values());
    console.log(`✅ [GET /api/drafts] After deduplication: ${deduplicatedData.length} unique audiences`);

    // STEP 4: Get audience details
    const audienceIds = deduplicatedData.map((item) => item.audience_id);
    let audienceDetails: any[] = [];
    
    if (audienceIds.length > 0) {
      const { data: detailsData, error: detailsError } = await supabase
        .schema('citia_mora_datamart')
        .from('audience')
        .select('id, full_name, source_contact_id, wa_opt_in, telegram_username, phone_e164')
        .in('id', audienceIds);

      if (!detailsError && detailsData) {
        audienceDetails = detailsData;
      }
    }

    // Update total matched audience
    if (totalMatchedAudience === 0 && deduplicatedData.length > 0) {
      totalMatchedAudience = deduplicatedData.length;
    }

    // Map audiences
    const audiences = deduplicatedData.map((item) => {
      const detail = audienceDetails.find((a) => a.id === item.audience_id) || {};
      const meta = item.meta || {};
      const guardrails = meta.guardrails || {};

      const isWhatsApp = detail.wa_opt_in === true;
      const isTelegram = !isWhatsApp && !!detail.telegram_username;
      const channel = isWhatsApp ? 'whatsapp' : isTelegram ? 'telegram' : 'whatsapp';

      let sendTo = '';
      if (channel === 'whatsapp') {
        sendTo = detail.phone_e164 || detail.source_contact_id || '';
      } else if (channel === 'telegram') {
        sendTo = detail.telegram_username 
          ? (detail.telegram_username.startsWith('@') ? detail.telegram_username : '@' + detail.telegram_username)
          : detail.source_contact_id || '';
      }

      let guardrailsTag = guardrails.tag || 'needs_review';
      if (guardrailsTag === 'approved') guardrailsTag = 'passed';

      return {
        campaign_id: item.campaign_id,
        audience_id: item.audience_id,
        audience_name: detail.full_name || detail.source_contact_id || 'Unknown',
        source_contact_id: detail.source_contact_id || '',
        telegram_username: detail.telegram_username || '',
        send_to: sendTo || 'Unknown',
        channel,
        broadcast_content: item.broadcast_content || '',
        character_count: item.broadcast_content?.length || 0,
        guardrails_tag: guardrailsTag,
        guardrails_violations: guardrails.violations || [],
        matchmaker_reason: meta.matchmaker_reason,
        target_status: item.target_status || 'pending',
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    console.log(`✅ [GET /api/drafts] Returning ${audiences.length} audiences`);
    console.log(`   Image URL: ${campaignImageUrl ? 'Yes' : 'No'}`);
    console.log(`🔍 [GET /api/drafts] ==========================================\n`);

    return createResponse({
      draft: {
        campaign_id: latestDraftCampaignId,
        campaign_name: campaignName,
        campaign_objective: campaignObjective,
        campaign_image_url: campaignImageUrl,
        campaign_tags: campaignTags,
        origin_notes: originNotes,
        total_matched_audience: totalMatchedAudience,
        audiences,
        created_at: fullCampaign.created_at,
        updated_at: fullCampaign.updated_at,
      },
      campaign_id: latestDraftCampaignId,
    });
  } catch (error) {
    console.error('❌ [GET /api/drafts] Error:', error);
    return createResponse(
      { error: 'Internal server error' },
      500
    );
  }
}

/**
 * Create response with no-cache headers
 */
function createResponse(data: any, status: number = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  
  // Add headers to prevent ALL caching
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('Surrogate-Control', 'no-store');
  
  return response;
}
