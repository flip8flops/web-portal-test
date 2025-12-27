import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;
const broadcastWebhookUrl = process.env.N8N_WEBHOOK_BROADCAST_URL || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
}

/**
 * POST /api/drafts/send
 * Trigger n8n internal broadcast engine webhook
 * This is called AFTER approve endpoint updates statuses to 'approved'
 * The actual sending is handled by n8n workflow
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
    const { campaign_id, audience_ids } = body;

    console.log(`\n📤 [POST /api/drafts/send] ==========================================`);
    console.log(`📤 [POST /api/drafts/send] Campaign ID: ${campaign_id}`);
    console.log(`📤 [POST /api/drafts/send] Audiences to send: ${audience_ids?.length || 0}`);

    if (!campaign_id) {
      return createResponse({ error: 'campaign_id is required' }, 400);
    }

    if (!Array.isArray(audience_ids) || audience_ids.length === 0) {
      return createResponse({ error: 'audience_ids is required and must be non-empty array' }, 400);
    }

    // Get campaign image URL once (outside loop, same for all audiences)
    let imageUrl = null;
    const { data: imageData, error: imageError } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_asset')
      .select('asset_id')
      .eq('campaign_id', campaign_id)
      .limit(1)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle no data gracefully

    if (!imageError && imageData?.asset_id) {
      const { data: assetData, error: assetError } = await supabase
        .schema('citia_mora_datamart')
        .from('asset')
        .select('media_url')
        .eq('id', imageData.asset_id)
        .eq('type', 'image')
        .maybeSingle(); // Use maybeSingle() instead of single()
      
      if (!assetError && assetData?.media_url) {
        imageUrl = assetData.media_url;
        console.log(`📤 [POST /api/drafts/send] Found image URL: ${imageUrl}`);
      } else {
        console.warn(`⚠️ [POST /api/drafts/send] Asset not found or not an image:`, assetError?.message);
      }
    } else {
      console.log(`ℹ️ [POST /api/drafts/send] No campaign asset found for campaign ${campaign_id}`);
    }

    // Fetch full audience data for webhook payload
    const audiences = [];
    
    for (const audienceId of audience_ids) {
      // Get campaign_audience data
      const { data: caData, error: caError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .select('broadcast_content, channel, scheduled_at')
        .eq('campaign_id', campaign_id)
        .eq('audience_id', audienceId)
        .single();

      if (caError || !caData) {
        console.error(`Failed to fetch campaign_audience for ${audienceId}:`, caError?.message);
        continue;
      }

      // Get audience details
      const { data: audData, error: audError } = await supabase
        .schema('citia_mora_datamart')
        .from('audience')
        .select('source_contact_id, full_name, phone_e164, telegram_username')
        .eq('id', audienceId)
        .single();

      if (audError || !audData) {
        console.error(`Failed to fetch audience for ${audienceId}:`, audError?.message);
        continue;
      }

      audiences.push({
        audience_id: audienceId,
        campaign_id,
        full_name: audData.full_name || 'Unknown',
        source_contact_id: audData.source_contact_id,
        phone_e164: audData.phone_e164,
        telegram_username: audData.telegram_username,
        channel: caData.channel || 'whatsapp',
        broadcast_content: caData.broadcast_content,
        scheduled_at: caData.scheduled_at,
        image_url: imageUrl, // Use the same imageUrl for all audiences
      });
    }

    console.log(`📤 [POST /api/drafts/send] Prepared ${audiences.length} audiences for webhook`);

    // Trigger n8n webhook if configured
    let webhookResult = { success: false, message: 'No webhook URL configured' };
    
    if (broadcastWebhookUrl) {
      try {
        console.log(`📤 [POST /api/drafts/send] Triggering webhook: ${broadcastWebhookUrl}`);
        
        const webhookResponse = await fetch(broadcastWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            campaign_id,
            audiences,
            triggered_at: new Date().toISOString(),
            triggered_by: 'web_portal',
          }),
        });

        if (webhookResponse.ok) {
          webhookResult = { success: true, message: 'Webhook triggered successfully' };
          console.log(`✅ [POST /api/drafts/send] Webhook triggered successfully`);
        } else {
          const errorText = await webhookResponse.text();
          webhookResult = { 
            success: false, 
            message: `Webhook failed: ${webhookResponse.status} ${errorText}` 
          };
          console.error(`❌ [POST /api/drafts/send] Webhook failed:`, errorText);
        }
      } catch (webhookError: any) {
        webhookResult = { 
          success: false, 
          message: `Webhook error: ${webhookError.message}` 
        };
        console.error(`❌ [POST /api/drafts/send] Webhook error:`, webhookError.message);
      }
    } else {
      console.warn(`⚠️ [POST /api/drafts/send] No webhook URL configured, skipping trigger`);
      // Still return success - the approval was done, sending will be manual
      webhookResult = { success: true, message: 'No webhook configured - send manually' };
    }

    // Insert status update record
    const sendTimestamp = new Date().toISOString();
    await supabase
      .schema('citia_mora_datamart')
      .from('campaign_status_updates')
      .insert({
        campaign_id,
        agent_name: 'broadcast_send',
        status: webhookResult.success ? 'completed' : 'error',
        message: 'cpgBroadcastTriggered',
        progress: 100,
        metadata: {
          workflow_point: 'broadcast_triggered',
          audience_count: audiences.length,
          webhook_result: webhookResult,
          triggered_at: sendTimestamp,
        },
      });

    console.log(`📤 [POST /api/drafts/send] ==========================================\n`);

    return createResponse({
      success: true,
      message: 'Broadcast triggered',
      audience_count: audiences.length,
      webhook_result: webhookResult,
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
