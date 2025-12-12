/**
 * Script to run Supabase migration
 * Execute SQL migration file to create campaign_status_updates table
 * 
 * Usage: node scripts/run-migration.js
 * 
 * Requires environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Required environment variables:');
  console.error('  - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease set these in .env.local file');
  process.exit(1);
}

async function runMigration() {
  console.log('🚀 Starting Supabase migration...\n');

  try {
    // Read SQL migration file
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '001_create_campaign_status_updates.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📊 SQL length:', sql.length, 'characters\n');

    // Split SQL into individual statements
    // Remove comments and split by semicolon
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip empty statements
      if (!statement || statement.length < 10) {
        continue;
      }

      try {
        console.log(`[${i + 1}/${statements.length}] Executing statement...`);
        
        // Use RPC or direct query (Supabase REST API doesn't support DDL directly)
        // We need to use PostgreSQL connection or Supabase SQL Editor API
        // For now, we'll use the REST API with a workaround
        
        // Note: Supabase REST API doesn't support DDL operations directly
        // This script will output the SQL for manual execution
        // OR we can use pg library for direct PostgreSQL connection
        
        console.log('⚠️  Note: Supabase REST API doesn\'t support DDL operations directly.');
        console.log('⚠️  Please execute the SQL manually in Supabase SQL Editor.\n');
        console.log('📋 SQL to execute:\n');
        console.log('─'.repeat(80));
        console.log(sql);
        console.log('─'.repeat(80));
        console.log('\n');
        
        // Exit early since we can't execute DDL via REST API
        console.log('💡 To execute this migration:');
        console.log('   1. Go to Supabase Dashboard');
        console.log('   2. Navigate to SQL Editor');
        console.log('   3. Copy and paste the SQL above');
        console.log('   4. Click "Run"\n');
        
        process.exit(0);
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
      }
    }

    if (successCount > 0) {
      console.log(`\n✅ Successfully executed ${successCount} statements`);
    }
    if (errorCount > 0) {
      console.log(`\n❌ Failed to execute ${errorCount} statements`);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

