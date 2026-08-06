const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUsersTable() {
  console.log('Checking users table structure...\n');
  
  const { data, error } = await supabase.rpc('exec', {
    query: `SELECT column_name, data_type, is_generated, generation_expression 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position;`
  }).single();
  
  if (error) {
    // Try direct query
    const result = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (result.error) {
      console.error('Error:', result.error);
    } else {
      console.log('Users table columns:', Object.keys(result.data?.[0] || {}));
    }
  }
  
  // Get user count
  const countResult = await supabase.from('users').select('id', { count: 'exact', head: true });
  console.log('\nUser count:', countResult.count || 0);
  
  // Get first user (if exists) to see structure
  const firstUser = await supabase.from('users').select('*').limit(1).single();
  if (firstUser.data) {
    console.log('\nUser structure:');
    console.log(Object.keys(firstUser.data).join(', '));
  }
  
  process.exit(0);
}

checkUsersTable().catch(console.error);
