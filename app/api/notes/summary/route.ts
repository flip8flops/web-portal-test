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
  dailyLimitReached?: boolean;
  generationsUsed?: number;
  maxGenerations?: number;
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

    // Create Supabase client for database operations
    const supabaseForDB = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${serverSession.session.access_token}`,
        },
      },
    });

    // Check if user has any notes first
    const { data: userNotes, error: notesError } = await supabaseForDB
      .schema('test')
      .from('notes')
      .select('id')
      .limit(1);

    if (notesError || !userNotes || userNotes.length === 0) {
      return NextResponse.json(
        { error: 'Please create at least one note before generating a summary.' },
        { status: 400 }
      );
    }

    // Check rate limit using per-day maximum logic
    try {
      const { data: existingSummary, error: checkError } = await supabaseForDB
        .schema('test')
        .from('note_summaries')
        .select('last_generated_at, generation_count, max_generations_per_day')
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle no rows gracefully

      // If no record exists, this is the first generation - allow it
      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine for first-time users
        console.error('Error checking rate limit:', checkError);
        // Continue anyway - don't block on check errors
      } else if (existingSummary) {
        const maxGenerationsPerDay = existingSummary.max_generations_per_day || 2;
        let generationCount = existingSummary.generation_count || 0;
        const now = new Date();
        
        // Check if last_generated_at is from today or a different day
        if (existingSummary.last_generated_at) {
          const lastGenerated = new Date(existingSummary.last_generated_at);
          const lastGeneratedDate = new Date(lastGenerated.getFullYear(), lastGenerated.getMonth(), lastGenerated.getDate());
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          // If different day, reset generation count
          if (lastGeneratedDate.getTime() !== todayDate.getTime()) {
            generationCount = 0;
            console.log(`New day detected for user ${userId}. Resetting generation count.`);
          }
        }
        
        // Check if daily limit reached
        if (generationCount >= maxGenerationsPerDay) {
          console.log(`Daily limit reached for user ${userId}. Generations: ${generationCount}/${maxGenerationsPerDay}`);
          return NextResponse.json(
            { 
              error: `Daily limit reached. You have used ${generationCount} of ${maxGenerationsPerDay} summary generations today. Please try again tomorrow.`,
              rateLimited: true,
              dailyLimitReached: true,
              generationsUsed: generationCount,
              maxGenerations: maxGenerationsPerDay,
            },
            { status: 429 }
          );
        }
      }
    } catch (rateLimitError) {
      // If rate limit check fails, log but continue (don't block the request)
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

    // Store summary in Supabase with rate limiting fields
    let updatedAt: string | undefined;
    try {
      const now = new Date().toISOString();
      
      // Get existing record to check if we need to reset generation_count for new day
      const { data: existingRecord } = await supabaseForDB
        .schema('test')
        .from('note_summaries')
        .select('last_generated_at, generation_count, max_generations_per_day')
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle() to handle no rows gracefully

      let newGenerationCount = 1;
      const maxGenerationsPerDay = existingRecord?.max_generations_per_day || 2;
      
      // Check if last generation was today or different day
      if (existingRecord?.last_generated_at) {
        const lastGenerated = new Date(existingRecord.last_generated_at);
        const lastGeneratedDate = new Date(lastGenerated.getFullYear(), lastGenerated.getMonth(), lastGenerated.getDate());
        const todayDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
        
        if (lastGeneratedDate.getTime() === todayDate.getTime()) {
          // Same day, increment count
          newGenerationCount = (existingRecord.generation_count || 0) + 1;
        } else {
          // Different day, reset to 1
          newGenerationCount = 1;
        }
      }

      // Upsert summary to test.note_summaries table with all rate limiting fields
      const { data, error: upsertError } = await supabaseForDB
        .schema('test')
        .from('note_summaries')
        .upsert({
          user_id: userId,
          summary: summary.trim(),
          updated_at: now,
          last_generated_at: now,
          generation_count: newGenerationCount,
          max_generations_per_day: maxGenerationsPerDay, // Preserve existing or use default
        }, {
          onConflict: 'user_id',
        })
        .select('updated_at')
        .single();

      if (upsertError) {
        console.error('Error storing summary in database:', upsertError);
        console.error('Error code:', upsertError.code);
        console.error('Error message:', upsertError.message);
        console.error('Error details:', JSON.stringify(upsertError, null, 2));
        // Return error - storage is required for the feature to work
        return NextResponse.json(
          { 
            error: `Failed to save summary: ${upsertError.message || 'Database error'}. Please check your database permissions.`,
          },
          { status: 500 }
        );
      } else if (data) {
        updatedAt = data.updated_at;
        console.log(`Summary stored successfully for user ${userId}. Generation count: ${newGenerationCount}/${maxGenerationsPerDay}`);
      } else {
        console.warn('Summary upsert returned no data and no error');
        // This shouldn't happen, but if it does, still return the summary
      }
    } catch (storageError) {
      // Log storage errors but don't fail the request
      console.error('Failed to store summary in database (exception):', storageError);
      if (storageError instanceof Error) {
        console.error('Storage error message:', storageError.message);
        console.error('Storage error stack:', storageError.stack);
      }
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

