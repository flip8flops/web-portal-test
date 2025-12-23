import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { campaign_id } = body;

    console.log('📤 [Sync API] Triggering sync to Citia DB', { campaign_id });

    // Get webhook URL and credentials from environment
    const webhookUrl = process.env.N8N_WEBHOOK_SYNC_URL;
    const username = process.env.N8N_WEBHOOK_USERNAME;
    const password = process.env.N8N_WEBHOOK_PASSWORD;

    if (!webhookUrl) {
      console.error('❌ [Sync API] N8N_WEBHOOK_SYNC_URL not configured');
      return NextResponse.json(
        { error: 'Sync webhook not configured' },
        { status: 500 }
      );
    }

    // Create basic auth header
    const authHeader = username && password 
      ? 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
      : undefined;

    console.log('🔗 [Sync API] Calling webhook:', webhookUrl);

    // Call n8n webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
      },
      body: JSON.stringify({ 
        campaign_id,
        triggered_at: new Date().toISOString(),
        source: 'web_portal'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('❌ [Sync API] Webhook failed:', response.status, errorText);
      return NextResponse.json(
        { error: `Webhook failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json().catch(() => ({ success: true }));
    console.log('✅ [Sync API] Webhook succeeded:', result);

    return NextResponse.json({
      success: true,
      message: 'Sync triggered successfully',
      data: result,
    });

  } catch (error) {
    console.error('❌ [Sync API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trigger sync' },
      { status: 500 }
    );
  }
}
