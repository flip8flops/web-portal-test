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
 * Update broadcast_content and/or scheduled_at for a specific audience
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { campaign_id, audience_id, broadcast_content, scheduled_at } = body;

    if (!campaign_id || !audience_id) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id, audience_id' },
        { status: 400 }
      );
    }

    // At least one of broadcast_content or scheduled_at must be provided
    if (broadcast_content === undefined && scheduled_at === undefined) {
      return NextResponse.json(
        { error: 'Must provide either broadcast_content or scheduled_at' },
        { status: 400 }
      );
    }

    console.log('💾 Updating audience data for:', { campaign_id, audience_id });
    if (broadcast_content !== undefined) {
      console.log('   Content to save (first 100 chars):', broadcast_content.substring(0, 100));
      console.log('   Content length:', broadcast_content.length);
    }
    if (scheduled_at !== undefined) {
      console.log('   Scheduled_at to save:', scheduled_at);
    }
    const beforeUpdateTime = new Date();
    console.log('   Timestamp before update:', beforeUpdateTime.toISOString());

    // Create a fresh client instance
    const updateSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'citia_mora_datamart',
      },
    });

    // CRITICAL: Check if there are multiple rows with same campaign_id + audience_id
    console.log('🔍 BEFORE UPDATE: Checking existing rows for this campaign_id + audience_id...');
    const { data: existingRows, error: checkError } = await updateSupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select('id, broadcast_content, updated_at, created_at')
      .eq('campaign_id', campaign_id)
      .eq('audience_id', audience_id)
      .order('updated_at', { ascending: false });
    
    if (checkError) {
      console.error('❌ Error checking existing rows:', checkError);
    } else if (existingRows) {
      console.log(`   Found ${existingRows.length} existing row(s):`);
      existingRows.forEach((row, idx) => {
        console.log(`   Existing Row ${idx + 1}:`, {
          id: row.id,
          content_preview: row.broadcast_content?.substring(0, 50) || 'NULL',
          updated_at: row.updated_at,
          created_at: row.created_at,
        });
      });
      
      if (existingRows.length > 1) {
        console.warn('⚠️ WARNING: MULTIPLE ROWS FOUND! This will cause issues!');
        console.warn('   Will update ALL rows, but fetch might get the wrong one');
        console.warn('   Recommendation: Delete duplicate rows and keep only the latest one');
      }
    }

    const updateTimestamp = new Date().toISOString();
    console.log('   Update timestamp to set:', updateTimestamp);
    
    // Build update object dynamically based on what was provided
    const updateObj: Record<string, any> = {
      updated_at: updateTimestamp,
    };
    
    if (broadcast_content !== undefined) {
      updateObj.broadcast_content = broadcast_content;
    }
    
    if (scheduled_at !== undefined) {
      updateObj.scheduled_at = scheduled_at;
    }
    
    // Update ALL rows with this campaign_id + audience_id
    const { data: updateData, error, count } = await updateSupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .update(updateObj)
      .eq('campaign_id', campaign_id)
      .eq('audience_id', audience_id)
      .select('id, broadcast_content, scheduled_at, updated_at'); // Select to verify update

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

    console.log('✅ Data updated successfully');
    console.log('   Update result:', updateData);
    if (updateData && updateData.length > 0) {
      if (broadcast_content !== undefined) {
        console.log('   Verified saved content (first 100 chars):', updateData[0].broadcast_content?.substring(0, 100));
        console.log('   Verified saved content length:', updateData[0].broadcast_content?.length);
      }
      if (scheduled_at !== undefined) {
        console.log('   Verified scheduled_at:', updateData[0].scheduled_at);
      }
      console.log('   Updated at:', updateData[0].updated_at);
    } else {
      console.warn('⚠️ Update returned no data - might indicate no rows were updated');
    }

    // Wait a small delay to ensure transaction is committed
    await new Promise(resolve => setTimeout(resolve, 100));
    
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
    
    // Fetch ALL rows for this audience_id to see if there are duplicates
    console.log('🔍 Checking ALL rows for this audience_id...');
    const { data: allAudienceRows, error: allAudienceError } = await verifySupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select('broadcast_content, updated_at, id')
      .eq('campaign_id', campaign_id)
      .eq('audience_id', audience_id)
      .order('updated_at', { ascending: false });
    
    if (!allAudienceError && allAudienceRows) {
      console.log(`   Found ${allAudienceRows.length} row(s) for this audience:`);
      allAudienceRows.forEach((row, idx) => {
        console.log(`   Row ${idx + 1}:`, {
          id: row.id,
          content_preview: row.broadcast_content?.substring(0, 50) || 'NULL',
          updated_at: row.updated_at,
        });
      });
    }
    
    // Get the single row (should be the latest)
    const { data: verifyData, error: verifyError } = await verifySupabase
      .schema('citia_mora_datamart')
      .from('campaign_audience')
      .select('broadcast_content, updated_at')
      .eq('campaign_id', campaign_id)
      .eq('audience_id', audience_id)
      .order('updated_at', { ascending: false })
      .limit(1)
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
