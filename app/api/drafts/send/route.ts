import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
}

/**
 * POST /api/drafts/send
 * Send approved drafts via WhatsApp (unofficial API)
 * This is called AFTER approve endpoint updates statuses
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

    const sendTimestamp = new Date().toISOString();
    const results: Array<{ audience_id: string; success: boolean; error?: string }> = [];

    // Process each audience
    for (const audienceId of audience_ids) {
      // Get audience data with broadcast content
      const { data: audienceData, error: fetchError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .select('broadcast_content, meta')
        .eq('campaign_id', campaign_id)
        .eq('audience_id', audienceId)
        .single();

      if (fetchError || !audienceData) {
        results.push({ audience_id: audienceId, success: false, error: 'Failed to fetch audience data' });
        continue;
      }

      // Get audience details
      const { data: detail, error: detailError } = await supabase
        .schema('citia_mora_datamart')
        .from('audience')
        .select('source_contact_id, wa_opt_in, phone_e164')
        .eq('id', audienceId)
        .single();

      if (detailError || !detail) {
        results.push({ audience_id: audienceId, success: false, error: 'Failed to fetch audience details' });
        continue;
      }

      const broadcastContent = audienceData.broadcast_content;
      const phoneNumber = detail.phone_e164 || detail.source_contact_id;

      if (!broadcastContent || !phoneNumber) {
        results.push({ audience_id: audienceId, success: false, error: 'Missing content or phone' });
        continue;
      }

      // TODO: Call WhatsApp unofficial API
      const sendResult = await sendWhatsAppMessage(phoneNumber, broadcastContent);

      // Update status based on result
      const currentMeta = audienceData.meta || {};
      const newStatus = sendResult.success ? 'sent' : 'failed';

      const { error: updateError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .update({
          target_status: newStatus,
          meta: {
            ...currentMeta,
            send: {
              sent_at: sendTimestamp,
              sent_status: newStatus,
              send_error: sendResult.error || null,
              message_id: sendResult.messageId || null,
            },
          },
          updated_at: sendTimestamp,
        })
        .eq('campaign_id', campaign_id)
        .eq('audience_id', audienceId);

      if (updateError) {
        console.error(`Error updating send status for ${audienceId}:`, updateError.message);
      }

      results.push({
        audience_id: audienceId,
        success: sendResult.success,
        error: sendResult.error,
      });
    }

    // Update campaign status to 'sent' if all were successful
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    if (successCount > 0) {
      console.log('📝 Updating campaign status to sent...');
      await supabase
        .schema('citia_mora_datamart')
        .from('campaign')
        .update({
          status: 'sent',
          updated_at: sendTimestamp,
        })
        .eq('id', campaign_id);

      // Insert status update
      await supabase
        .schema('citia_mora_datamart')
        .from('campaign_status_updates')
        .insert({
          campaign_id,
          agent_name: 'broadcast_send',
          status: 'completed',
          message: 'cpgSent',
          progress: 100,
          metadata: {
            workflow_point: 'broadcast_sent',
            sent_count: successCount,
            failed_count: failedCount,
            sent_at: sendTimestamp,
          },
        });
    }

    console.log(`✅ [POST /api/drafts/send] Sent: ${successCount}, Failed: ${failedCount}`);
    console.log(`📤 [POST /api/drafts/send] ==========================================\n`);

    return createResponse({
      success: true,
      results,
      sent_count: successCount,
      failed_count: failedCount,
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    return createResponse({
      error: 'Internal server error',
      details: error?.message,
    }, 500);
  }
}

/**
 * Send WhatsApp message via unofficial API
 * TODO: Replace with actual WhatsApp API implementation
 */
async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Format phone number
  let phone = phoneNumber;
  if (phone.includes(':')) {
    phone = phone.split(':')[1];
  }
  phone = phone.replace(/^\+/, '');

  console.log(`[SIMULATED] Sending WhatsApp to ${phone}: ${message.substring(0, 50)}...`);
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));

  // TODO: Replace with actual API call
  return {
    success: true,
    messageId: `sim_${Date.now()}`,
  };
}

function createResponse(data: any, status: number = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
