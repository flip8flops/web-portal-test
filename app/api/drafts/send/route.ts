import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/drafts/send
 * Send approved drafts via WhatsApp (unofficial API)
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

    const results: Array<{ audience_id: string; success: boolean; error?: string }> = [];

    // Get draft content for each audience
    for (const audienceId of audience_ids) {
      const { data: audienceData, error: fetchError } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .select('broadcast_content, meta')
        .eq('campaign_id', campaign_id)
        .eq('audience_id', audienceId)
        .single();

      if (fetchError || !audienceData) {
        results.push({
          audience_id: audienceId,
          success: false,
          error: 'Failed to fetch audience data',
        });
        continue;
      }

      // Get audience details separately
      const { data: audienceDetail, error: detailError } = await supabase
        .schema('citia_mora_datamart')
        .from('audience')
        .select('source_contact_id, wa_opt_in')
        .eq('id', audienceId)
        .single();

      if (detailError || !audienceDetail) {
        results.push({
          audience_id: audienceId,
          success: false,
          error: 'Failed to fetch audience details',
        });
        continue;
      }

      const broadcastContent = audienceData.broadcast_content;
      const sourceContactId = audienceDetail.source_contact_id;

      if (!broadcastContent || !sourceContactId) {
        results.push({
          audience_id: audienceId,
          success: false,
          error: 'Missing broadcast content or phone number',
        });
        continue;
      }

      // Format phone number (remove +, ensure country code)
      let phoneNumber = sourceContactId;
      if (phoneNumber.includes(':')) {
        phoneNumber = phoneNumber.split(':')[1];
      }
      phoneNumber = phoneNumber.replace(/^\+/, '');

      // TODO: Call WhatsApp unofficial API
      // For now, simulate success
      const sendResult = await sendWhatsAppMessage(phoneNumber, broadcastContent);

      // Get current meta
      const currentMeta = audienceData.meta || {};

      if (sendResult.success) {
        // Update status to sent
        const { error: updateError } = await supabase
          .schema('citia_mora_datamart')
          .from('campaign_audience')
          .update({
            target_status: 'sent',
            meta: {
              ...currentMeta,
              send: {
                sent_at: new Date().toISOString(),
                sent_status: 'sent',
                send_error: null,
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq('campaign_id', campaign_id)
          .eq('audience_id', audienceId);

        if (updateError) {
          console.error(`Error updating send status for ${audienceId}:`, updateError);
        }

        results.push({
          audience_id: audienceId,
          success: true,
        });
      } else {
        // Update status to failed
        const { error: updateError } = await supabase
          .schema('citia_mora_datamart')
          .from('campaign_audience')
          .update({
            target_status: 'failed',
            meta: {
              ...currentMeta,
              send: {
                sent_at: new Date().toISOString(),
                sent_status: 'failed',
                send_error: sendResult.error || 'Unknown error',
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq('campaign_id', campaign_id)
          .eq('audience_id', audienceId);

        results.push({
          audience_id: audienceId,
          success: false,
          error: sendResult.error || 'Failed to send',
        });
      }
    }

    // Update campaign status if all sent
    const allSent = results.every(r => r.success);
    if (allSent) {
      // Update campaign status to 'sent'
      await supabase
        .schema('citia_mora_datamart')
        .from('campaign')
        .update({
          status: 'sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id);

      // Insert status update: campaign approved/sent
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
            sent_count: results.length,
          },
        });
    }

    return NextResponse.json({
      success: true,
      results,
      sent_count: results.filter(r => r.success).length,
      failed_count: results.filter(r => !r.success).length,
    });
  } catch (error) {
    console.error('Error in POST /api/drafts/send:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
  // TODO: Implement actual WhatsApp API call
  // For now, simulate success
  console.log(`[SIMULATED] Sending WhatsApp to ${phoneNumber}: ${message.substring(0, 50)}...`);
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // TODO: Replace with actual API call
  // Example:
  // const response = await fetch(WHATSAPP_API_URL, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
  //   },
  //   body: JSON.stringify({
  //     to: phoneNumber,
  //     message: message,
  //   }),
  // });
  // 
  // if (!response.ok) {
  //   return { success: false, error: `API error: ${response.status}` };
  // }
  // 
  // const data = await response.json();
  // return { success: true, messageId: data.message_id };

  return {
    success: true,
    messageId: `sim_${Date.now()}`,
  };
}
