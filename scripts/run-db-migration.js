/**
 * Database Migration Script
 * Run with: node scripts/run-db-migration.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigrations() {
  console.log('=== YUNITE Database Migration ===\n');
  
  const columns = [
    { name: 'avatar_url', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;' },
    { name: 'address', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;' },
    { name: 'emergency_contact_name', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;' },
    { name: 'emergency_contact_phone', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;' },
    { name: 'date_joined', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS date_joined TIMESTAMPTZ DEFAULT NOW();' },
    { name: 'failed_login_attempts', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;' },
    { name: 'locked_until', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;' },
    { name: 'password_changed_at', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;' },
    { name: 'must_change_password', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;' }
  ];

  console.log('Checking current columns in users table:');
  const { data: currentUsers } = await supabase.from('users').select('*').limit(1);
  const existingColumns = currentUsers && currentUsers.length > 0 ? Object.keys(currentUsers[0]) : [];
  console.log(existingColumns.join(', '));
  console.log('');

  console.log('Status of columns:\n');
  
  for (const col of columns) {
    const exists = existingColumns.includes(col.name);
    console.log((exists ? '✓ EXISTS' : '○ MISSING') + ': ' + col.name);
    if (!exists) {
      console.log('   SQL: ' + col.sql);
    }
  }
  
  console.log('\nNote: Use Supabase Dashboard -> SQL Editor to run missing migrations');
}

runMigrations().catch(console.error);
