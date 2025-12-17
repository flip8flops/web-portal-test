import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * POST /api/drafts/update-content
 * Update broadcast_content for a specific audience
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { campaign_id, audience_id, broadcast_content } = body;

    if (!campaign_id || !audience_id || !broadcast_content) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id, audience_id, broadcast_content' },
        { status: 400 }
      );
    }

    console.log('💾 Updating broadcast_content for:', { campaign_id, audience_id });

    // Update broadcast_content in database
    const { error } = await supabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .update({
        broadcast_content: broadcast_content,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaign_id)
      .eq('audience_id', audience_id);

    if (error) {
      console.error('❌ Error updating content:', error);
      return NextResponse.json(
        { error: 'Failed to update content', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Content updated successfully');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/drafts/update-content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
