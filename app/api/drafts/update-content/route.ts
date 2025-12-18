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
    console.log('   Content to save (first 100 chars):', broadcast_content.substring(0, 100));
    console.log('   Content length:', broadcast_content.length);
    console.log('   Timestamp before update:', new Date().toISOString());

    // Create a fresh client instance for update to avoid caching issues
    const updateSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'citia_mora_datamart',
      },
    });

    const updateTimestamp = new Date().toISOString();
    
    // Update broadcast_content in database
    const { data: updateData, error } = await updateSupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .update({
        broadcast_content: broadcast_content,
        updated_at: updateTimestamp,
      })
      .eq('campaign_id', campaign_id)
      .eq('audience_id', audience_id)
      .select('broadcast_content, updated_at'); // Select to verify update

    if (error) {
      console.error('❌ Error updating content:', error);
      console.error('   Error code:', error.code);
      console.error('   Error message:', error.message);
      console.error('   Error details:', error.details);
      return NextResponse.json(
        { error: 'Failed to update content', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Content updated successfully');
    console.log('   Update result:', updateData);
    if (updateData && updateData.length > 0) {
      console.log('   Verified saved content (first 100 chars):', updateData[0].broadcast_content?.substring(0, 100));
      console.log('   Verified saved content length:', updateData[0].broadcast_content?.length);
      console.log('   Updated at:', updateData[0].updated_at);
    } else {
      console.warn('⚠️ Update returned no data - might indicate no rows were updated');
    }

    // Immediately verify by fetching the updated row
    // Use a fresh client instance to bypass any potential caching
    console.log('🔍 Verifying update by fetching row from database...');
    const verifySupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'citia_mora_datamart',
      },
    });
    
    // Add cache-busting timestamp to query
    const cacheBuster = Date.now();
    const { data: verifyData, error: verifyError } = await verifySupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select('broadcast_content, updated_at')
      .eq('campaign_id', campaign_id)
      .eq('audience_id', audience_id)
      .single();

    if (verifyError) {
      console.error('❌ Error verifying update:', verifyError);
      console.error('   Error code:', verifyError.code);
      console.error('   Error message:', verifyError.message);
    } else if (verifyData) {
      console.log('✅ Verification fetch successful');
      console.log('   Verified content in DB (first 100 chars):', verifyData.broadcast_content?.substring(0, 100));
      console.log('   Verified content length in DB:', verifyData.broadcast_content?.length);
      console.log('   Verified updated_at in DB:', verifyData.updated_at);
      console.log('   Content matches:', verifyData.broadcast_content === broadcast_content ? 'YES ✅' : 'NO ❌');
      if (verifyData.broadcast_content !== broadcast_content) {
        console.error('   ❌ MISMATCH DETECTED!');
        console.error('   Expected (first 100):', broadcast_content.substring(0, 100));
        console.error('   Got from DB (first 100):', verifyData.broadcast_content?.substring(0, 100));
      }
    } else {
      console.warn('⚠️ Verification returned no data');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/drafts/update-content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
