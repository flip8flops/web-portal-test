import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/src/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

interface SummaryResponse {
  summary: string;
  updatedAt?: string;
}

interface ErrorResponse {
  error: string;
  rateLimited?: boolean;
  hoursRemaining?: number;
}

/**
 * GET /api/notes/summary
 * 
 * Generates a summary of the authenticated user's notes by calling the n8n webhook.
 * Returns the summary text or an error message.
 */
export async function GET(request: NextRequest): Promise<NextResponse<SummaryResponse | ErrorResponse>> {
  try {
    // Get authenticated user session
    const serverSession = await getServerSession(request);
    
    if (!serverSession || !serverSession.user) {
      console.error('API /notes/summary: No session found');
      console.error('Auth header:', request.headers.get('authorization') ? 'Present' : 'Missing');
      console.error('Cookie header:', request.headers.get('cookie') ? 'Present' : 'Missing');
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to generate a summary.' },
        { status: 401 }
      );
    }

    const userId = serverSession.user.id;
    console.log('API /notes/summary: Generating summary for user:', userId);

    // Check rate limit: 1 summary per day per user
    try {
      const supabaseForCheck = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${serverSession.session.access_token}`,
          },
        },
      });

      const { data: existingSummary, error: checkError } = await supabaseForCheck
        .schema('test')
        .from('note_summaries')
        .select('updated_at')
        .eq('user_id', userId)
        .single();

      if (!checkError && existingSummary?.updated_at) {
        const lastUpdated = new Date(existingSummary.updated_at);
        const now = new Date();
        const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceUpdate < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSinceUpdate);
          return NextResponse.json(
            { 
              error: `Rate limit exceeded. You can generate a new summary in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}.`,
              rateLimited: true,
              hoursRemaining,
            },
            { status: 429 }
          );
        }
      }
    } catch (rateLimitError) {
      // If rate limit check fails, continue anyway (don't block the request)
      console.warn('Rate limit check failed, continuing:', rateLimitError);
    }

    // Validate n8n webhook configuration
    const webhookUrl = process.env.N8N_NOTES_WEBHOOK_URL;
    const webhookUser = process.env.N8N_NOTES_WEBHOOK_USER;
    const webhookPass = process.env.N8N_NOTES_WEBHOOK_PASS;

    if (!webhookUrl || !webhookUser || !webhookPass) {
      console.error('n8n webhook configuration missing');
      return NextResponse.json(
        { error: 'Summary service is not configured. Please contact support.' },
        { status: 500 }
      );
    }

    // Build webhook URL with user_id query parameter
    const webhookUrlWithParams = `${webhookUrl}?user_id=${userId}`;

    // Create Basic Auth header
    const basicAuth = Buffer.from(`${webhookUser}:${webhookPass}`).toString('base64');

    // Call n8n webhook
    console.log('API /notes/summary: Calling n8n webhook:', webhookUrlWithParams);
    const response = await fetch(webhookUrlWithParams, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'text/plain',
      },
    });

    console.log('API /notes/summary: n8n webhook response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('n8n webhook error:', response.status, errorText);
      return NextResponse.json(
        { error: `Failed to generate summary. Webhook returned status ${response.status}.` },
        { status: 502 }
      );
    }

    // Read response as plain text
    const summary = await response.text();

    if (!summary || summary.trim().length === 0) {
      return NextResponse.json(
        { error: 'Received empty summary from webhook.' },
        { status: 502 }
      );
    }

    // Optional: Store summary in Supabase
    let updatedAt: string | undefined;
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${serverSession.session.access_token}`,
          },
        },
      });

      // Upsert summary to test.note_summaries table
      const { data, error: upsertError } = await supabase
        .schema('test')
        .from('note_summaries')
        .upsert({
          user_id: userId,
          summary: summary.trim(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select('updated_at')
        .single();

      if (!upsertError && data) {
        updatedAt = data.updated_at;
      }
    } catch (storageError) {
      // Log but don't fail - summary storage is optional
      console.warn('Failed to store summary in database:', storageError);
    }

    return NextResponse.json({
      summary: summary.trim(),
      ...(updatedAt && { updatedAt }),
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while generating the summary.' },
      { status: 500 }
    );
  }
}

