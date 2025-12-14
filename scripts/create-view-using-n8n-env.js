import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from n8n-citia-editor project
console.log('🔍 Looking for Supabase credentials...');
dotenv.config({ path: join(__dirname, '..', '..', 'n8n-citia-editor', '.env') });

const SUPABASE_DB_HOST = process.env.SUPABASE_DB_HOST;
const SUPABASE_DB_PORT = process.env.SUPABASE_DB_PORT || 5432;
const SUPABASE_DB_NAME = process.env.SUPABASE_DB_NAME;
const SUPABASE_DB_USER = process.env.SUPABASE_DB_USER;
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SUPABASE_DB_SSL_MODE = process.env.SUPABASE_DB_SSL_MODE;

if (!SUPABASE_DB_HOST || !SUPABASE_DB_USER || !SUPABASE_DB_PASSWORD) {
  console.error('❌ Error: Missing Supabase database credentials in n8n-citia-editor/.env');
  console.error('Please ensure SUPABASE_DB_HOST, SUPABASE_DB_USER, and SUPABASE_DB_PASSWORD are set.');
  process.exit(1);
}

console.log('✅ Loaded credentials from n8n-citia-editor/.env');
console.log('📊 Connection details:');
console.log(`   Host: ${SUPABASE_DB_HOST}`);
console.log(`   Port: ${SUPABASE_DB_PORT}`);
console.log(`   Database: ${SUPABASE_DB_NAME}`);
console.log(`   User: ${SUPABASE_DB_USER}`);
console.log(`   SSL: ${SUPABASE_DB_SSL_MODE}`);

const client = new Client({
  host: SUPABASE_DB_HOST,
  port: parseInt(SUPABASE_DB_PORT as string, 10),
  database: SUPABASE_DB_NAME,
  user: SUPABASE_DB_USER,
  password: SUPABASE_DB_PASSWORD,
  ssl: SUPABASE_DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false
});

async function createView() {
  const migrationFilePath = join(__dirname, '..', 'supabase', 'migrations', '003_create_status_updates_view.sql');
  const sql = fs.readFileSync(migrationFilePath, 'utf8');

  console.log('\n📄 Migration file loaded');

  try {
    await client.connect();
    console.log('\n🔌 Connecting to database...');
    console.log('✅ Connected to database');

    console.log('\n📝 Creating view in public schema...');
    await client.query(sql);
    console.log('✅ View created successfully!');

    // Verify view creation
    console.log('\n🔍 Verifying view creation...');
    const checkView = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_views
        WHERE schemaname = 'public' AND viewname = 'campaign_status_updates'
      );
    `);

    if (checkView.rows[0].exists) {
      console.log('✅ View public.campaign_status_updates created successfully!');

      // Test query
      console.log('\n🧪 Testing view query...');
      const testQuery = await client.query(`
        SELECT COUNT(*) as count FROM public.campaign_status_updates;
      `);
      console.log(`   Records in view: ${testQuery.rows[0].count}`);

      // Check permissions
      const permissions = await client.query(`
        SELECT grantee, privilege_type 
        FROM information_schema.role_table_grants 
        WHERE table_name = 'campaign_status_updates' 
          AND table_schema = 'public';
      `);
      console.log('\n📊 Permissions:');
      permissions.rows.forEach(perm => {
        console.log(`   - ${perm.grantee}: ${perm.privilege_type}`);
      });

    } else {
      console.error('❌ Error: View public.campaign_status_updates was not created.');
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Test query from web portal');
    console.log('   2. Verify status updates appear in UI');
    console.log('   3. Test real-time subscription works');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    if (error.message.includes('already exists')) {
      console.log('\n💡 View already exists. This is OK - view will be replaced.');
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

createView();

