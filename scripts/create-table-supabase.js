/**
 * Script to create campaign_status_updates table in Supabase
 * Uses Supabase Management API or direct PostgreSQL connection
 * 
 * Usage: 
 *   node scripts/create-table-supabase.js
 * 
 * Environment variables needed:
 *   Option 1: Direct PostgreSQL connection
 *     - SUPABASE_DB_HOST
 *     - SUPABASE_DB_PASSWORD
 *   
 *   Option 2: Supabase connection string
 *     - SUPABASE_DB_CONNECTION_STRING (postgresql://...)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to use pg library if available, otherwise use fetch API
let pg;
try {
  pg = await import('pg');
} catch (e) {
  console.log('⚠️  pg library not installed. Installing...');
  console.log('   Run: npm install pg dotenv');
  process.exit(1);
}

const { Client } = pg.default || pg;

async function createTable() {
  console.log('🚀 Creating campaign_status_updates table in Supabase...\n');

  // Read SQL migration file
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '001_create_campaign_status_updates.sql');
  const sql = readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded\n');

  // Try to get connection details
  const connectionString = process.env.SUPABASE_DB_CONNECTION_STRING;
  const dbHost = process.env.SUPABASE_DB_HOST;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  const dbPort = process.env.SUPABASE_DB_PORT || '5432';
  const dbName = process.env.SUPABASE_DB_NAME || 'postgres';
  const dbUser = process.env.SUPABASE_DB_USER || 'postgres';

  let client;

  try {
    if (connectionString) {
      console.log('🔌 Connecting using connection string...');
      client = new Client({
        connectionString: connectionString,
        ssl: {
          rejectUnauthorized: false,
        },
      });
    } else if (dbHost && dbPassword) {
      console.log('🔌 Connecting to database...');
      client = new Client({
        host: dbHost,
        port: parseInt(dbPort),
        database: dbName,
        user: dbUser,
        password: dbPassword,
        ssl: {
          rejectUnauthorized: false,
        },
      });
    } else {
      console.error('❌ Error: Missing database credentials');
      console.error('\nPlease provide one of the following:');
      console.error('  1. SUPABASE_DB_CONNECTION_STRING (full PostgreSQL connection string)');
      console.error('  2. SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD');
      console.error('\n💡 You can find these in Supabase Dashboard:');
      console.error('   Settings > Database > Connection string');
      console.error('   Or use the Connection pooling string\n');
      process.exit(1);
    }

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
    }

    // Show table info
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
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed');
    }
  }
}

createTable();

