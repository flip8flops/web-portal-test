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
    console.log('🔍 Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'MISSING');
    
    const searchParams = request.nextUrl.searchParams;
    const campaignId = searchParams.get('campaign_id');
    console.log('🔍 Request campaign_id param:', campaignId || 'none');

    // Find latest campaign with status "content_drafted"
    let latestDraftCampaignId = campaignId;

    if (!latestDraftCampaignId) {
      console.log('🔍 Querying for draft campaign...');
      
      // Approach: Query campaign_status_updates by agent_name and status (same as StatusDisplay)
      // Look for content_maker_agent with status='completed' which indicates draft is ready
      // This matches how StatusDisplay successfully queries this table
      console.log('🔍 Step 1: Querying campaign_status_updates for content_maker_agent completed...');
      const { data: statusData, error: statusError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_status_updates')
        .select('campaign_id, agent_name, status, message, updated_at, metadata')
        .eq('agent_name', 'content_maker_agent')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(10); // Get multiple to find the latest one

      if (statusError) {
        console.error('❌ Error querying campaign_status_updates:', statusError);
        console.error('❌ Error code:', statusError.code);
        console.error('❌ Error message:', statusError.message);
      } else if (statusData && statusData.length > 0) {
        // Find the latest one that has a valid campaign_id
        const latestStatus = statusData.find((s: any) => s.campaign_id);
        if (latestStatus && latestStatus.campaign_id) {
          latestDraftCampaignId = latestStatus.campaign_id;
          console.log('✅ Found draft campaign from campaign_status_updates:', latestDraftCampaignId);
        } else {
          console.log('ℹ️ Found status updates but no valid campaign_id');
        }
      } else {
        console.log('ℹ️ No content_maker_agent completed status found, trying alternative approach...');
        
        // Alternative: Query all recent status updates and find one with workflow_point indicating draft
        const { data: altStatusData, error: altStatusError } = await supabase
          .schema('citia_mora_datamart')
          .from('campaign_status_updates')
          .select('campaign_id, agent_name, status, message, updated_at, metadata')
          .order('updated_at', { ascending: false })
          .limit(50);
        
        if (!altStatusError && altStatusData && altStatusData.length > 0) {
          // Look for status update with metadata.workflow_point = 'content_maker_completed'
          const draftStatus = altStatusData.find((s: any) => {
            const metadata = s.metadata || {};
            return metadata.workflow_point === 'content_maker_completed' && s.campaign_id;
          });
          
          if (draftStatus && draftStatus.campaign_id) {
            latestDraftCampaignId = draftStatus.campaign_id;
            console.log('✅ Found draft campaign from workflow_point metadata:', latestDraftCampaignId);
          }
        }
        
        // Final fallback: Try direct query to campaign table (may fail with permission error)
        if (!latestDraftCampaignId) {
          console.log('ℹ️ Trying to find by campaign.status...');
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
            console.log('⚠️ Permission error on campaign table - check Supabase grants');
          } else if (campaignData && campaignData.id) {
            latestDraftCampaignId = campaignData.id;
            console.log('✅ Found draft campaign from campaign.status:', latestDraftCampaignId);
          } else {
            console.log('ℹ️ No campaign found with status="content_drafted"');
          }
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
    // campaign table doesn't have SELECT permission for anon role
    // So we'll get info from campaign_status_updates metadata (which we know works)
    console.log('🔍 Fetching campaign info for ID:', latestDraftCampaignId);
    
    let campaignName = 'Untitled Campaign';
    let campaignObjective = '';
    let campaignImageUrl = null;
    let campaignCreatedAt = new Date().toISOString();
    let campaignUpdatedAt = new Date().toISOString();
    
    // Get campaign info from campaign_status_updates metadata
    const { data: statusUpdates, error: statusError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_status_updates')
      .select('campaign_id, message, metadata, created_at, updated_at')
      .eq('campaign_id', latestDraftCampaignId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (!statusError && statusUpdates && statusUpdates.length > 0) {
      // Try to find metadata with campaign info
      const statusWithMetadata = statusUpdates.find((s: any) => s.metadata && (s.metadata.campaign_name || s.metadata.campaign_objective));
      if (statusWithMetadata && statusWithMetadata.metadata) {
        campaignName = statusWithMetadata.metadata.campaign_name || 'Untitled Campaign';
        campaignObjective = statusWithMetadata.metadata.campaign_objective || '';
        campaignImageUrl = statusWithMetadata.metadata.campaign_image_url || null;
      }
      campaignCreatedAt = statusUpdates[statusUpdates.length - 1].created_at || campaignCreatedAt;
      campaignUpdatedAt = statusUpdates[0].updated_at || campaignUpdatedAt;
      console.log('✅ Using campaign info from campaign_status_updates metadata');
    }
    
    // Try to get campaign info from campaign table (now has SELECT permission)
    const { data: campaignTableData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, name, objective, image_url, meta, matchmaker_strategy, created_at, updated_at')
      .eq('id', latestDraftCampaignId)
      .single();

    let campaignTags: string[] = [];
    let originNotes = '';
    let totalMatchedAudience = 0;

    if (!campaignError && campaignTableData) {
      // Override with data from campaign table if available
      campaignName = campaignTableData.name || campaignName;
      campaignObjective = campaignTableData.objective || campaignObjective;
      campaignImageUrl = campaignTableData.image_url || campaignImageUrl;
      campaignCreatedAt = campaignTableData.created_at || campaignCreatedAt;
      campaignUpdatedAt = campaignTableData.updated_at || campaignUpdatedAt;
      
      // Extract additional info from meta
      const meta = campaignTableData.meta || {};
      const researchPayload = meta.research_payload || {};
      const campaignBrief = researchPayload.campaign_brief || {};
      
      // Get title from meta if name is not set
      if (!campaignName && campaignBrief.title) {
        campaignName = campaignBrief.title;
      }
      
      // Get objective from meta if not set
      if (!campaignObjective && campaignBrief.objective) {
        campaignObjective = campaignBrief.objective;
      }
      
      // Get origin notes
      originNotes = meta.origin_raw_admin_notes || '';
      
      // Get total matched audience
      const matchmakerResult = meta.matchmaker_result || {};
      totalMatchedAudience = matchmakerResult.total_matched || 0;
      
      // Get tags from matchmaker_strategy or meta
      if (campaignTableData.matchmaker_strategy && campaignTableData.matchmaker_strategy.tags) {
        campaignTags = campaignTableData.matchmaker_strategy.tags;
      } else if (campaignBrief.tags) {
        campaignTags = campaignBrief.tags;
      }
      
      console.log('✅ Campaign info fetched from campaign table:', campaignTableData.id, campaignName);
    } else if (campaignError) {
      console.log('⚠️ Cannot access campaign table:', campaignError.code);
      console.log('   Using data from campaign_status_updates metadata instead');
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
      console.log('⚠️ Cannot access campaign_audience table (expected due to permissions)');
      console.log('⚠️ Please run grant-supabase-permissions.sql to grant SELECT permission');
      
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
        warning: 'Could not fetch audiences due to permission error. Please run grant-supabase-permissions.sql to grant SELECT permission on campaign_audience and audience tables.',
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
        .select('id, full_name, source_contact_id, wa_opt_in, telegram_username, phone_number')
        .in('id', audienceIds);

      if (detailsError) {
        console.error('❌ Error fetching audience details:', detailsError);
        console.log('⚠️ Will use minimal audience data from campaign_audience');
      } else if (detailsData) {
        audienceDetails = detailsData;
        console.log('✅ Fetched', audienceDetails.length, 'audience details');
      }
    }
    
    // Update total matched audience if we have actual count
    if (totalMatchedAudience === 0 && audienceData && audienceData.length > 0) {
      totalMatchedAudience = audienceData.length;
    }

    // Combine data
    const audiences = (audienceData || []).map((item: any) => {
      const audienceDetail = audienceDetails.find((a: any) => a.id === item.audience_id) || {};
      const meta = item.meta || {};
      const guardrails = meta.guardrails || {};
      
      // Determine channel
      const isWhatsApp = audienceDetail.wa_opt_in;
      const isTelegram = !!audienceDetail.telegram_username;
      const channel = isWhatsApp ? 'whatsapp' : isTelegram ? 'telegram' : 'whatsapp';
      
      // Determine "send to" value based on channel
      let sendTo = '';
      if (channel === 'whatsapp') {
        sendTo = audienceDetail.phone_number || audienceDetail.source_contact_id || '';
      } else if (channel === 'telegram') {
        sendTo = audienceDetail.telegram_username || audienceDetail.source_contact_id || '';
      } else {
        sendTo = audienceDetail.source_contact_id || '';
      }

      return {
        campaign_id: item.campaign_id,
        audience_id: item.audience_id,
        audience_name: audienceDetail.full_name || audienceDetail.source_contact_id || 'Unknown',
        source_contact_id: audienceDetail.source_contact_id || '',
        phone_number: audienceDetail.phone_number || '',
        telegram_username: audienceDetail.telegram_username || '',
        send_to: sendTo,
        channel: channel,
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
        campaign_tags: campaignTags,
        origin_notes: originNotes,
        total_matched_audience: totalMatchedAudience,
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
