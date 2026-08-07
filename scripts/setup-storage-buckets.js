/**
 * Setup Storage Buckets for Document Management
 * 
 * Run this script to create all required storage buckets in Supabase.
 * Usage: node scripts/setup-storage-buckets.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables!');
  console.log('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const buckets = [
  { id: 'documents', name: 'documents', public: true, file_size_limit: 104857600 },
  { id: 'member-documents', name: 'member-documents', public: false, file_size_limit: 104857600 },
  { id: 'user-documents', name: 'user-documents', public: false, file_size_limit: 104857600 },
  { id: 'org-documents', name: 'org-documents', public: false, file_size_limit: 104857600 },
  { id: 'loan-documents', name: 'loan-documents', public: false, file_size_limit: 104857600 },
  { id: 'savings-documents', name: 'savings-documents', public: false, file_size_limit: 104857600 },
  { id: 'welfare-documents', name: 'welfare-documents', public: false, file_size_limit: 104857600 },
  { id: 'financial-documents', name: 'financial-documents', public: false, file_size_limit: 104857600 },
  { id: 'statements', name: 'statements', public: true, file_size_limit: 104857600 },
  { id: 'reports', name: 'reports', public: true, file_size_limit: 104857600 },
];

async function createBucket(bucket) {
  try {
    const { data, error } = await supabase.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 
                        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    });
    
    if (error && error.message !== 'Bucket already exists') {
      console.error(`Error creating ${bucket.id}:`, error.message);
      return false;
    }
    
    console.log(`✓ Bucket '${bucket.id}' created or already exists`);
    return true;
  } catch (err) {
    console.error(`Error creating ${bucket.id}:`, err.message || err);
    return false;
  }
}

async function setupBuckets() {
  console.log('Setting up storage buckets...\n');
  
  for (const bucket of buckets) {
    await createBucket(bucket);
  }
  
  console.log('\n✓ Storage buckets setup complete!');
}

setupBuckets().catch(console.error);
