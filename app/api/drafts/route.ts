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
        // Find the latest one that has a valid campaign_id AND check if campaign status is still content_drafted
        for (const status of statusData) {
          if (!status.campaign_id) continue;
          
          // CRITICAL: Check campaign.status to ensure it's still content_drafted (not rejected/approved)
          console.log('🔍 Checking campaign status for:', status.campaign_id);
          const { data: campaignCheck, error: checkError } = await supabase
            .schema('citia_mora_datamart')
            .from('campaign')
            .select('id, status')
            .eq('id', status.campaign_id)
            .single();
          
          if (checkError) {
            console.warn('⚠️ Cannot check campaign status:', checkError.message);
            continue; // Skip this one if we can't check
          }
          
          if (campaignCheck && campaignCheck.status === 'content_drafted') {
            latestDraftCampaignId = status.campaign_id;
            console.log('✅ Found draft campaign from campaign_status_updates:', latestDraftCampaignId);
            console.log('   Campaign status confirmed: content_drafted');
            break; // Found valid draft, stop searching
          } else {
            console.log(`   Campaign ${status.campaign_id} status is: ${campaignCheck?.status || 'unknown'} - skipping (not content_drafted)`);
          }
        }
        
        if (!latestDraftCampaignId) {
          console.log('ℹ️ Found status updates but no campaign with status="content_drafted"');
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
            // CRITICAL: Verify campaign status is still content_drafted
            const { data: campaignCheck, error: checkError } = await supabase
              .schema('citia_mora_datamart')
              .from('campaign')
              .select('id, status')
              .eq('id', draftStatus.campaign_id)
              .single();
            
            if (!checkError && campaignCheck && campaignCheck.status === 'content_drafted') {
              latestDraftCampaignId = draftStatus.campaign_id;
              console.log('✅ Found draft campaign from workflow_point metadata:', latestDraftCampaignId);
              console.log('   Campaign status confirmed: content_drafted');
            } else {
              console.log(`   Campaign ${draftStatus.campaign_id} status is: ${campaignCheck?.status || 'unknown'} - skipping (not content_drafted)`);
            }
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
          } else if (campaignData && campaignData.id && campaignData.status === 'content_drafted') {
            latestDraftCampaignId = campaignData.id;
            console.log('✅ Found draft campaign from campaign.status:', latestDraftCampaignId);
            console.log('   Campaign status confirmed: content_drafted');
          } else {
            console.log('ℹ️ No campaign found with status="content_drafted"');
            if (campaignData) {
              console.log(`   Found campaign but status is: ${campaignData.status} (not content_drafted)`);
            }
          }
        }
      }
    }

    if (!latestDraftCampaignId) {
      console.log('✅ No draft campaign found (all campaigns are either approved, rejected, or not yet drafted)');
      return NextResponse.json({
        draft: null,
        campaign_id: null,
        message: 'No draft campaign found',
      });
    }

    // FINAL VERIFICATION: Double-check that the campaign is still content_drafted
    // This ensures we don't return a campaign that was just rejected/approved
    console.log('🔍 Final verification: Checking campaign status one more time...');
    const { data: finalCheck, error: finalCheckError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, status')
      .eq('id', latestDraftCampaignId)
      .single();
    
    if (finalCheckError) {
      console.warn('⚠️ Cannot verify campaign status:', finalCheckError.message);
      // Continue anyway - might be permission issue
    } else if (finalCheck) {
      if (finalCheck.status !== 'content_drafted') {
        console.log(`❌ Campaign ${latestDraftCampaignId} status is "${finalCheck.status}", not "content_drafted" - returning null`);
        return NextResponse.json({
          draft: null,
          campaign_id: null,
          message: 'No draft campaign found (campaign status is not content_drafted)',
        });
      } else {
        console.log('✅ Final verification passed: Campaign status is content_drafted');
      }
    }

    console.log('✅ Using draft campaign ID:', latestDraftCampaignId);

    // Get campaign info from campaign table (now has SELECT permission)
    console.log('🔍 Fetching campaign info for ID:', latestDraftCampaignId);
    
    let campaignName = 'Untitled Campaign';
    let campaignObjective = '';
    let campaignCreatedAt = new Date().toISOString();
    let campaignUpdatedAt = new Date().toISOString();
    let campaignTags: string[] = [];
    let originNotes = '';
    let totalMatchedAudience = 0;

    // Try to get campaign info from campaign table FIRST
    console.log('🔍 Attempting to fetch campaign from table with ID:', latestDraftCampaignId);
    const { data: campaignTableData, error: campaignError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign')
      .select('id, name, objective, meta, matchmaker_strategy, created_at, updated_at')
      .eq('id', latestDraftCampaignId)
      .single();

    if (campaignError) {
      console.error('❌ Error fetching campaign table:', campaignError);
      console.error('   Code:', campaignError.code);
      console.error('   Message:', campaignError.message);
      console.error('   Details:', campaignError.details);
      console.error('   Hint:', campaignError.hint);
      console.log('⚠️ Cannot access campaign table, will try fallback');
    } else if (campaignTableData) {
      console.log('✅ Campaign table data fetched successfully');
      console.log('   Campaign ID:', campaignTableData.id);
      console.log('   Raw name:', campaignTableData.name || 'NULL');
      console.log('   Raw objective:', campaignTableData.objective ? campaignTableData.objective.substring(0, 50) + '...' : 'NULL');
      console.log('   Has meta:', !!campaignTableData.meta);
      console.log('   Meta type:', typeof campaignTableData.meta);
      if (campaignTableData.meta) {
        console.log('   Meta keys:', Object.keys(campaignTableData.meta));
        console.log('   Meta research_payload exists:', !!campaignTableData.meta.research_payload);
        if (campaignTableData.meta.research_payload) {
          console.log('   Meta research_payload keys:', Object.keys(campaignTableData.meta.research_payload));
          console.log('   Meta campaign_brief exists:', !!campaignTableData.meta.research_payload.campaign_brief);
          if (campaignTableData.meta.research_payload.campaign_brief) {
            console.log('   Meta campaign_brief keys:', Object.keys(campaignTableData.meta.research_payload.campaign_brief));
            console.log('   Meta campaign_brief.title:', campaignTableData.meta.research_payload.campaign_brief.title || 'NOT FOUND');
            console.log('   Meta campaign_brief.objective:', campaignTableData.meta.research_payload.campaign_brief.objective ? campaignTableData.meta.research_payload.campaign_brief.objective.substring(0, 50) + '...' : 'NOT FOUND');
          }
        }
        console.log('   Meta origin_raw_admin_notes:', campaignTableData.meta.origin_raw_admin_notes ? campaignTableData.meta.origin_raw_admin_notes.substring(0, 50) + '...' : 'NOT FOUND');
      }
      console.log('   Has matchmaker_strategy:', !!campaignTableData.matchmaker_strategy);
      if (campaignTableData.matchmaker_strategy) {
        console.log('   Matchmaker_strategy type:', typeof campaignTableData.matchmaker_strategy);
        console.log('   Matchmaker_strategy keys:', Object.keys(campaignTableData.matchmaker_strategy));
        console.log('   Matchmaker_strategy.tags:', campaignTableData.matchmaker_strategy.tags);
        console.log('   Matchmaker_strategy.tags type:', typeof campaignTableData.matchmaker_strategy.tags);
        console.log('   Matchmaker_strategy.tags is array:', Array.isArray(campaignTableData.matchmaker_strategy.tags));
      }
      
      // Extract from meta FIRST (most reliable source)
      const meta = campaignTableData.meta || {};
      const researchPayload = meta.research_payload || {};
      const campaignBrief = researchPayload.campaign_brief || {};
      
      // Get title from meta.campaign_brief.title FIRST, then fallback to campaign.name
      if (campaignBrief && campaignBrief.title) {
        campaignName = campaignBrief.title;
        console.log('   ✅ Title from meta.campaign_brief.title:', campaignName);
      } else if (campaignTableData.name) {
        campaignName = campaignTableData.name;
        console.log('   ✅ Title from campaign.name:', campaignName);
      } else {
        console.log('   ⚠️ No title found in meta or campaign.name');
      }
      
      // Get objective from meta.campaign_brief.objective FIRST, then fallback to campaign.objective
      if (campaignBrief && campaignBrief.objective) {
        campaignObjective = campaignBrief.objective;
        console.log('   ✅ Objective from meta.campaign_brief.objective');
      } else if (campaignTableData.objective) {
        campaignObjective = campaignTableData.objective;
        console.log('   ✅ Objective from campaign.objective');
      } else {
        console.log('   ⚠️ No objective found');
      }
      
      // Get other fields
      campaignCreatedAt = campaignTableData.created_at || campaignCreatedAt;
      campaignUpdatedAt = campaignTableData.updated_at || campaignUpdatedAt;
      
      // Get origin notes
      originNotes = meta.origin_raw_admin_notes || '';
      console.log('   Origin Notes:', originNotes ? originNotes.substring(0, 50) + '...' : 'NOT FOUND');
      
      // Get total matched audience
      const matchmakerResult = meta.matchmaker_result || {};
      totalMatchedAudience = matchmakerResult.total_matched || 0;
      console.log('   Total Matched:', totalMatchedAudience);
      
      // Get tags from matchmaker_strategy FIRST (most reliable), then meta
      if (campaignTableData.matchmaker_strategy) {
        if (Array.isArray(campaignTableData.matchmaker_strategy.tags)) {
          campaignTags = campaignTableData.matchmaker_strategy.tags;
          console.log('   ✅ Tags from matchmaker_strategy.tags:', campaignTags.length, 'tags');
        } else {
          console.log('   ⚠️ matchmaker_strategy.tags is not an array:', typeof campaignTableData.matchmaker_strategy.tags);
        }
      }
      
      // Fallback to meta tags if matchmaker_strategy doesn't have tags
      if (campaignTags.length === 0 && campaignBrief && Array.isArray(campaignBrief.tags)) {
        campaignTags = campaignBrief.tags;
        console.log('   ✅ Tags from meta.campaign_brief.tags:', campaignTags.length, 'tags');
      }
      
      if (campaignTags.length === 0) {
        console.log('   ⚠️ No tags found in matchmaker_strategy or meta');
      }
      
      console.log('✅ Final campaign data:', {
        name: campaignName,
        objective: campaignObjective ? campaignObjective.substring(0, 30) + '...' : 'MISSING',
        originNotes: originNotes ? 'EXISTS' : 'MISSING',
        tags: campaignTags.length,
        totalMatched: totalMatchedAudience,
      });
    } else {
      console.log('⚠️ Campaign table data is null');
    }

    // Get campaign audiences with broadcast_content
    console.log('🔍 Fetching campaign audiences with broadcast_content...');
    console.log('   Campaign ID:', latestDraftCampaignId);
    console.log('   Timestamp:', new Date().toISOString());
    
    // Create a fresh client instance to bypass any potential caching
    const fetchSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'citia_mora_datamart',
      },
    });
    
    // First, let's check ALL rows for this campaign (including NULL/empty broadcast_content)
    console.log('🔍 Checking ALL campaign_audience rows for this campaign (including NULL)...');
    const { data: allRows, error: allRowsError } = await fetchSupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select('id, audience_id, broadcast_content, updated_at, created_at')
      .eq('campaign_id', latestDraftCampaignId)
      .order('updated_at', { ascending: false }); // Order by updated_at DESC to see latest first
    
    if (!allRowsError && allRows) {
      console.log(`   Found ${allRows.length} total rows for this campaign:`);
      allRows.forEach((row, idx) => {
        console.log(`   Row ${idx + 1}:`, {
          id: row.id,
          audience_id: row.audience_id,
          content_preview: row.broadcast_content?.substring(0, 50) || 'NULL/EMPTY',
          content_length: row.broadcast_content?.length || 0,
          updated_at: row.updated_at,
          created_at: row.created_at,
        });
      });
      
      // Group by audience_id and find the latest one for each
      const latestByAudience = new Map();
      allRows.forEach((row) => {
        const existing = latestByAudience.get(row.audience_id);
        if (!existing || new Date(row.updated_at) > new Date(existing.updated_at)) {
          latestByAudience.set(row.audience_id, row);
        }
      });
      
      console.log(`   Latest row per audience_id (from all rows):`);
      latestByAudience.forEach((row, audienceId) => {
        console.log(`   Audience ${audienceId}:`, {
          id: row.id,
          content_preview: row.broadcast_content?.substring(0, 50) || 'NULL/EMPTY',
          updated_at: row.updated_at,
        });
      });
    }
    
    // Now fetch with proper filtering - get rows with broadcast_content
    // Then we'll deduplicate to get only the latest per audience_id
    console.log('🔍 Fetching rows with broadcast_content...');
    const { data: audienceData, error: audienceError } = await fetchSupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select(`
        id,
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
      .neq('broadcast_content', '')
      .order('updated_at', { ascending: false }); // Order by updated_at DESC to get latest first

    if (audienceError) {
      console.error('❌ Error fetching campaign audiences:', audienceError);
      console.error('   Error code:', audienceError.code);
      console.error('   Error message:', audienceError.message);
    } else {
      console.log('✅ Fetched', audienceData?.length || 0, 'rows with broadcast_content');
      if (audienceData && audienceData.length > 0) {
        console.log('   Raw fetched data (before deduplication):');
        audienceData.forEach((aud, idx) => {
          console.log(`   Raw ${idx + 1}:`, {
            id: aud.id,
            audience_id: aud.audience_id,
            content_preview: aud.broadcast_content?.substring(0, 50) || 'EMPTY',
            content_length: aud.broadcast_content?.length || 0,
            updated_at: aud.updated_at,
          });
        });
        
        // Group by audience_id and take only the latest one (highest updated_at)
        const latestByAudience = new Map();
        audienceData.forEach((aud) => {
          const existing = latestByAudience.get(aud.audience_id);
          const audDate = new Date(aud.updated_at);
          const existingDate = existing ? new Date(existing.updated_at) : null;
          
          if (!existing || (existingDate && audDate > existingDate)) {
            console.log(`   ✅ Selecting row ${aud.id} for audience ${aud.audience_id} (updated_at: ${aud.updated_at})`);
            if (existing) {
              console.log(`      Replacing row ${existing.id} (updated_at: ${existing.updated_at})`);
            }
            latestByAudience.set(aud.audience_id, aud);
          } else {
            console.log(`   ⏭️  Skipping row ${aud.id} for audience ${aud.audience_id} (older than existing)`);
          }
        });
        
        const deduplicatedData = Array.from(latestByAudience.values());
        console.log(`   After deduplication: ${deduplicatedData.length} unique audiences`);
        
        deduplicatedData.forEach((aud, idx) => {
          console.log(`   Audience ${idx + 1} (FINAL SELECTED):`, {
            id: aud.id,
            audience_id: aud.audience_id,
            content_preview: aud.broadcast_content?.substring(0, 50) || 'EMPTY',
            content_length: aud.broadcast_content?.length || 0,
            updated_at: aud.updated_at,
          });
        });
        
        // Use deduplicated data
        const originalLength = audienceData.length;
        audienceData.length = 0;
        audienceData.push(...deduplicatedData);
        
        if (originalLength !== deduplicatedData.length) {
          console.log(`   ⚠️ Removed ${originalLength - deduplicatedData.length} duplicate rows`);
        }
      }
    }

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
        .select('id, full_name, source_contact_id, wa_opt_in, telegram_username, phone_e164')
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
      
      // Determine channel based on wa_opt_in and telegram_username
      // If wa_opt_in is true, it's WhatsApp
      // If telegram_username exists and wa_opt_in is not true, it's Telegram
      const isWhatsApp = audienceDetail.wa_opt_in === true;
      const isTelegram = !isWhatsApp && !!audienceDetail.telegram_username;
      const channel = isWhatsApp ? 'whatsapp' : isTelegram ? 'telegram' : 'whatsapp'; // Default to whatsapp
      
      // Determine "send to" value based on channel
      // For WhatsApp: use phone_e164 FIRST (proper phone number), then fallback to source_contact_id
      // For Telegram: use telegram_username with @ prefix, or source_contact_id
      let sendTo = '';
      if (channel === 'whatsapp') {
        // Prefer phone_e164 (format: +628xxx) for WhatsApp
        if (audienceDetail.phone_e164) {
          sendTo = audienceDetail.phone_e164;
        } else if (audienceDetail.source_contact_id && audienceDetail.source_contact_id.startsWith('wa-')) {
          // Fallback: extract from source_contact_id format "wa-628xxx"
          sendTo = audienceDetail.source_contact_id.substring(3); // Remove "wa-" prefix
        } else {
          sendTo = audienceDetail.source_contact_id || '';
        }
      } else if (channel === 'telegram') {
        // Prefer telegram_username with @ prefix, fallback to source_contact_id
        if (audienceDetail.telegram_username) {
          sendTo = audienceDetail.telegram_username.startsWith('@') 
            ? audienceDetail.telegram_username 
            : '@' + audienceDetail.telegram_username;
        } else {
          sendTo = audienceDetail.source_contact_id || '';
        }
      } else {
        sendTo = audienceDetail.source_contact_id || '';
      }
      
      console.log('   Audience:', audienceDetail.full_name || 'Unknown', '- Channel:', channel, '- Send To:', sendTo, '- Phone E164:', audienceDetail.phone_e164 || 'N/A');

      // Map guardrails tag: 'approved' -> 'passed'
      let guardrailsTag = guardrails.tag || 'needs_review';
      if (guardrailsTag === 'approved') {
        guardrailsTag = 'passed';
      }

      const audienceResult = {
        campaign_id: item.campaign_id,
        audience_id: item.audience_id,
        audience_name: audienceDetail.full_name || audienceDetail.source_contact_id || 'Unknown',
        source_contact_id: audienceDetail.source_contact_id || '',
        telegram_username: audienceDetail.telegram_username || '',
        send_to: sendTo || audienceDetail.source_contact_id || 'Unknown',
        channel: channel,
        broadcast_content: item.broadcast_content || '',
        character_count: item.broadcast_content ? item.broadcast_content.length : 0,
        guardrails_tag: guardrailsTag,
        guardrails_status: guardrails.status || 'approved',
        guardrails_violations: guardrails.violations || [],
        matchmaker_reason: meta.matchmaker_reason,
        target_status: item.target_status || 'pending',
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
      
      // Log broadcast_content for debugging
      console.log(`   📝 Audience ${audienceResult.audience_name} (${audienceResult.audience_id}):`);
      console.log(`      Content preview: ${audienceResult.broadcast_content?.substring(0, 80) || 'EMPTY'}`);
      console.log(`      Content length: ${audienceResult.broadcast_content?.length || 0}`);
      console.log(`      Updated at: ${audienceResult.updated_at}`);
      
      return audienceResult;
    });

    console.log('✅ Returning draft data with', audiences.length, 'audiences');
    console.log('📤 Final response data:', {
      campaign_id: latestDraftCampaignId,
      campaign_name: campaignName,
      campaign_objective: campaignObjective ? campaignObjective.substring(0, 30) + '...' : 'MISSING',
      campaign_objective_length: campaignObjective ? campaignObjective.length : 0,
      origin_notes: originNotes ? originNotes.substring(0, 30) + '...' : 'MISSING',
      origin_notes_length: originNotes ? originNotes.length : 0,
      tags_count: campaignTags.length,
      tags: campaignTags,
      total_matched_audience: totalMatchedAudience,
      audiences_count: audiences.length,
    });
    
    return NextResponse.json({
      draft: {
        campaign_id: latestDraftCampaignId,
        campaign_name: campaignName,
        campaign_objective: campaignObjective,
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
