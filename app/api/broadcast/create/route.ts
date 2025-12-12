import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/src/lib/supabase/server';

interface ErrorResponse {
  error: string;
  details?: string;
}

interface CreateResponse {
  campaign_id: string;
  execution_id?: string;
  message?: string;
}

/**
 * POST /api/broadcast/create
 * 
 * Creates a new campaign by calling the n8n webhook.
 * Accepts multipart/form-data with:
 * - "Campaign planning notes" (text)
 * - "Campaign image" (file, optional)
 */
export async function POST(request: NextRequest): Promise<NextResponse<CreateResponse | ErrorResponse>> {
  try {
    // Get authenticated user session
    const serverSession = await getServerSession(request);

    if (!serverSession || !serverSession.user) {
      console.error('API /broadcast/create: No session found');
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to create a campaign.' },
        { status: 401 }
      );
    }

    const userId = serverSession.user.id;
    console.log('API /broadcast/create: Creating campaign for user:', userId);

    // Validate n8n webhook configuration
    const webhookUrl = process.env.N8N_CITIA_CAMPAIGN_WEBHOOK_URL;
    const webhookUser = process.env.N8N_CITIA_CAMPAIGN_WEBHOOK_USER;
    const webhookPass = process.env.N8N_CITIA_CAMPAIGN_WEBHOOK_PASS;

    if (!webhookUrl || !webhookUser || !webhookPass) {
      console.error('n8n webhook configuration missing');
      return NextResponse.json(
        { error: 'Campaign service is not configured. Please contact support.' },
        { status: 500 }
      );
    }

    // Parse multipart/form-data
    const formData = await request.formData();
    const notes = formData.get('Campaign planning notes') as string | null;
    const imageFile = formData.get('Campaign image') as File | null;

    if (!notes || !notes.trim()) {
      return NextResponse.json(
        { error: 'Campaign planning notes are required.' },
        { status: 400 }
      );
    }

    console.log('API /broadcast/create: Notes length:', notes.length);
    console.log('API /broadcast/create: Has image:', !!imageFile);

    // Create FormData for n8n webhook
    const n8nFormData = new FormData();
    n8nFormData.append('Campaign planning notes', notes.trim());
    if (imageFile) {
      n8nFormData.append('Campaign image', imageFile);
    }

    // Create Basic Auth header
    const basicAuth = Buffer.from(`${webhookUser}:${webhookPass}`).toString('base64');

    // Call n8n webhook
    console.log('API /broadcast/create: Calling n8n webhook:', webhookUrl);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
      },
      body: n8nFormData,
    });

    console.log('API /broadcast/create: n8n webhook response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('n8n webhook error:', response.status, errorText);
      return NextResponse.json(
        { 
          error: `Failed to create campaign. Webhook returned status ${response.status}.`,
          details: errorText.substring(0, 200), // Limit error text length
        },
        { status: 502 }
      );
    }

    // Try to parse response as JSON (n8n might return JSON with campaign_id)
    let responseData: any = {};
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      try {
        responseData = await response.json();
      } catch (e) {
        console.warn('Failed to parse JSON response:', e);
      }
    }

    // Extract campaign_id from response or generate a temporary one
    // Note: n8n workflow will create campaign in database, we might need to query it
    // For now, we'll return a placeholder and let the frontend track via execution_id
    const campaignId = responseData.campaign_id || responseData.id || 'pending';
    const executionId = responseData.execution_id || responseData.executionId;

    console.log('API /broadcast/create: Campaign created:', campaignId);

    return NextResponse.json({
      campaign_id: campaignId,
      execution_id: executionId,
      message: 'Campaign initiated! Agents are now processing.',
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json(
      { 
        error: 'An unexpected error occurred while creating the campaign.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

