-- ===================================================================
-- Setup documents storage bucket for file uploads
-- ===================================================================

-- Make sure documents bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents', 
    'documents', 
    true, 
    104857600, -- 100MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create policy to allow anyone to read from documents bucket
CREATE POLICY "Allow public read access to documents bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');

-- Create policy to allow authenticated users to upload to documents bucket
CREATE POLICY "Allow authenticated users to upload to documents bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Create policy to allow authenticated users to update documents
CREATE POLICY "Allow authenticated users to update documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Create policy to allow authenticated users to delete documents
CREATE POLICY "Allow authenticated users to delete documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- ===================================================================
-- MIGRATION COMPLETE
-- ===================================================================
