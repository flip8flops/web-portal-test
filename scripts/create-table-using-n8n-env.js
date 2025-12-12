/**
 * Script to create campaign_status_updates table using Supabase credentials from n8n-citia-editor
 * Reads .env from n8n-citia-editor project
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load .env from n8n-citia-editor project
const n8nProjectPath = join(__dirname, '..', '..', 'n8n-citia-editor', '.env');
const localEnvPath = join(__dirname, '..', '.env.local');

console.log('🔍 Looking for Supabase credentials...\n');

// Try n8n-citia-editor .env first, then local .env
let envLoaded = false;
try {
  dotenv.config({ path: n8nProjectPath });
  console.log('✅ Loaded credentials from n8n-citia-editor/.env');
  envLoaded = true;
} catch (e) {
  console.log('⚠️  Could not load from n8n-citia-editor/.env, trying local...');
  try {
    dotenv.config({ path: localEnvPath });
    console.log('✅ Loaded credentials from .env.local');
    envLoaded = true;
  } catch (e2) {
    console.log('⚠️  Could not load from .env.local');
  }
}

// Get database connection details (try both naming conventions)
const dbHost = process.env.SUPABASE_DB_HOST || process.env.SUPABASE_HOST;
const dbPort = process.env.SUPABASE_DB_PORT || process.env.SUPABASE_PORT || '5432';
const dbName = process.env.SUPABASE_DB_NAME || process.env.SUPABASE_DB || 'postgres';
const dbUser = process.env.SUPABASE_DB_USER || process.env.SUPABASE_USER || 'postgres';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_PASSWORD;
const sslMode = process.env.SUPABASE_DB_SSL_MODE || 'require';

if (!dbHost || !dbPassword) {
  console.error('❌ Error: Missing database credentials');
  console.error('\nRequired environment variables:');
  console.error('  - SUPABASE_DB_HOST or SUPABASE_HOST');
  console.error('  - SUPABASE_DB_PASSWORD or SUPABASE_PASSWORD');
  console.error('\nOptional:');
  console.error('  - SUPABASE_DB_PORT or SUPABASE_PORT (default: 5432)');
  console.error('  - SUPABASE_DB_NAME or SUPABASE_DB (default: postgres)');
  console.error('  - SUPABASE_DB_USER or SUPABASE_USER (default: postgres)');
  console.error('\n💡 Make sure .env file exists in n8n-citia-editor project');
  process.exit(1);
}

console.log(`📊 Connection details:`);
console.log(`   Host: ${dbHost}`);
console.log(`   Port: ${dbPort}`);
console.log(`   Database: ${dbName}`);
console.log(`   User: ${dbUser}`);
console.log(`   SSL: ${sslMode}\n`);

// Read SQL migration file
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '001_create_campaign_status_updates.sql');
const sql = readFileSync(migrationPath, 'utf8');

console.log('📄 Migration file loaded\n');

// Create database client
const client = new Client({
  host: dbHost,
  port: parseInt(dbPort),
  database: dbName,
  user: dbUser,
  password: dbPassword,
  ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
});

async function createTable() {
  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    // Execute migration
    console.log('📝 Executing migration...');
    await client.query(sql);
    console.log('✅ Migration executed successfully!\n');

    // Verify table
    console.log('🔍 Verifying table creation...');
    const verifyResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'citia_mora_datamart' 
        AND table_name = 'campaign_status_updates'
      );
    `);

    if (verifyResult.rows[0].exists) {
      console.log('✅ Table campaign_status_updates created successfully!\n');
    } else {
      console.log('⚠️  Warning: Table verification failed\n');
      process.exit(1);
    }

    // Show table structure
    const tableInfo = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'citia_mora_datamart' 
      AND table_name = 'campaign_status_updates'
      ORDER BY ordinal_position;
    `);

    console.log('📊 Table structure:');
    tableInfo.rows.forEach((row) => {
      console.log(`   - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });
    console.log('');

    // Show indexes
    const indexes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'citia_mora_datamart' 
      AND tablename = 'campaign_status_updates';
    `);

    console.log(`📊 Indexes (${indexes.rows.length}):`);
    indexes.rows.forEach((row) => {
      console.log(`   - ${row.indexname}`);
    });
    console.log('');

    // Show functions
    const functions = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'citia_mora_datamart' 
      AND routine_name LIKE '%campaign_status%';
    `);

    console.log(`🔧 Functions (${functions.rows.length}):`);
    functions.rows.forEach((row) => {
      console.log(`   - ${row.routine_name}`);
    });
    console.log('');

    // Show triggers
    const triggers = await client.query(`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_schema = 'citia_mora_datamart' 
      AND event_object_table = 'campaign_status_updates';
    `);

    console.log(`⚡ Triggers (${triggers.rows.length}):`);
    triggers.rows.forEach((row) => {
      console.log(`   - ${row.trigger_name}`);
    });
    console.log('');

    console.log('🎉 Migration completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Test the table by inserting a status update');
    console.log('   2. Verify real-time subscriptions work in the UI');
    console.log('   3. Update n8n workflow to insert status updates\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    if (error.detail) {
      console.error('   Detail:', error.detail);
    }
    if (error.position) {
      console.error('   Position:', error.position);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

createTable();

