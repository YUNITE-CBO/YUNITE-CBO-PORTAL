-- ===================================================================
-- CREATE STORAGE BUCKETS FOR DOCUMENT MANAGEMENT
-- ===================================================================

-- Storage buckets for different document types
-- Note: These need to be created in Supabase Storage

-- Run this SQL in Supabase Dashboard -> Storage -> New Bucket
-- Or use the Supabase CLI: supabase storage create-bucket

-- Buckets needed:
-- 1. documents - General document storage
-- 2. member-documents - Member-specific documents (ID, photos, etc.)
-- 3. user-documents - User profile documents
-- 4. org-documents - Organization documents
-- 5. loan-documents - Loan-related documents
-- 6. savings-documents - Savings documents
-- 7. contribution-documents - Contribution documents
-- 8. welfare-documents - Welfare documents
-- 9. donation-documents - Donation documents
-- 10. investment-documents - Investment documents
-- 11. project-documents - Project documents
-- 12. meeting-documents - Meeting documents
-- 13. procurement-documents - Procurement documents
-- 14. inventory-documents - Inventory documents
-- 15. asset-documents - Asset documents
-- 16. event-documents - Event documents
-- 17. reports - Reports storage
-- 18. ai-documents - AI center documents
-- 19. notification-attachments - Notification attachments
-- 20. settings-documents - Settings documents
-- 21. audit-evidence - Audit evidence
-- 22. financial-documents - Financial documents
-- 23. statements - Statements

-- Create buckets using the storage API
-- This uses the supabase storage system

-- Check if we can use direct SQL (Supabase Pro/Enterprise)
-- For Supabase free tier, create buckets via Dashboard

-- Document bucket (public for reading)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('documents', 'documents', true, 104857600, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

-- Member documents bucket
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('member-documents', 'member-documents', false, 104857600, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/gif']);

-- Note: The actual bucket creation should be done via:
-- 1. Supabase Dashboard -> Storage -> New Bucket
-- 2. Or via Supabase CLI: supabase storage create-bucket <bucket-name> --public

-- ===================================================================
-- STORAGE POLICIES (RLS)
-- ===================================================================

-- Enable RLS on storage.objects
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to upload to their own bucket
-- CREATE POLICY "Users can upload to own user bucket"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'user-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow members to upload to member-documents bucket (admin only in production)
-- CREATE POLICY "Members can upload member documents"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'member-documents');

-- Allow public read on public buckets
-- CREATE POLICY "Public read on public documents"
-- ON storage.objects FOR SELECT
-- USING (bucket_id IN ('documents', 'reports'));

-- ===================================================================
-- TEMPORARY FIX: Use a single bucket for all documents
-- ===================================================================

-- If the above buckets don't exist, the system will use 'documents' bucket
-- Update the core.service.ts to fallback to 'documents' bucket
