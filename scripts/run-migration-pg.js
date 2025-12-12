/**
 * Script to run Supabase migration using direct PostgreSQL connection
 * Execute SQL migration file to create campaign_status_updates table
 * 
 * Usage: node scripts/run-migration-pg.js
 * 
 * Requires:
 * - npm install pg
 * - Environment variables:
 *   - SUPABASE_DB_HOST (from Supabase connection string)
 *   - SUPABASE_DB_PORT (default: 5432)
 *   - SUPABASE_DB_NAME (default: postgres)
 *   - SUPABASE_DB_USER (from Supabase connection string)
 *   - SUPABASE_DB_PASSWORD (from Supabase connection string)
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const { Client } = pg;

// Load environment variables
config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database connection details
// Supabase connection string format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
const dbHost = process.env.SUPABASE_DB_HOST;
const dbPort = process.env.SUPABASE_DB_PORT || '5432';
const dbName = process.env.SUPABASE_DB_NAME || 'postgres';
const dbUser = process.env.SUPABASE_DB_USER || 'postgres';
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!dbHost || !dbPassword) {
  console.error('❌ Error: Missing database credentials');
  console.error('Required environment variables:');
  console.error('  - SUPABASE_DB_HOST (e.g., db.xxxxx.supabase.co)');
  console.error('  - SUPABASE_DB_PASSWORD');
  console.error('Optional:');
  console.error('  - SUPABASE_DB_PORT (default: 5432)');
  console.error('  - SUPABASE_DB_NAME (default: postgres)');
  console.error('  - SUPABASE_DB_USER (default: postgres)');
  console.error('\n💡 You can find these in Supabase Dashboard > Settings > Database > Connection string');
  process.exit(1);
}

async function runMigration() {
  console.log('🚀 Starting Supabase migration via PostgreSQL...\n');

  const client = new Client({
    host: dbHost,
    port: parseInt(dbPort),
    database: dbName,
    user: dbUser,
    password: dbPassword,
    ssl: {
      rejectUnauthorized: false, // Supabase requires SSL
    },
  });

  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read SQL migration file
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '001_create_campaign_status_updates.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📊 SQL length:', sql.length, 'characters\n');

    // Execute SQL (Supabase supports multi-statement queries)
    console.log('📝 Executing migration...\n');
    await client.query(sql);

    console.log('✅ Migration executed successfully!\n');

    // Verify table was created
    console.log('🔍 Verifying table creation...');
    const verifyResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'citia_mora_datamart' 
        AND table_name = 'campaign_status_updates'
      );
    `);

    if (verifyResult.rows[0].exists) {
      console.log('✅ Table campaign_status_updates exists in citia_mora_datamart schema\n');
    } else {
      console.log('⚠️  Warning: Table not found after migration\n');
    }

    // Check indexes
    const indexResult = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'citia_mora_datamart' 
      AND tablename = 'campaign_status_updates';
    `);

    console.log(`📊 Created ${indexResult.rows.length} indexes:`);
    indexResult.rows.forEach((row) => {
      console.log(`   - ${row.indexname}`);
    });
    console.log('');

    // Check functions
    const functionResult = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'citia_mora_datamart' 
      AND routine_name LIKE '%campaign_status%';
    `);

    console.log(`🔧 Created ${functionResult.rows.length} functions:`);
    functionResult.rows.forEach((row) => {
      console.log(`   - ${row.routine_name}`);
    });
    console.log('');

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

runMigration();

