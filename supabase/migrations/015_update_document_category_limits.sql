-- ===================================================================
-- UPDATE DOCUMENT CATEGORY FILE SIZE LIMITS TO 100MB
-- ===================================================================

-- Update all document categories to 100MB max file size
UPDATE document_categories SET max_file_size_mb = 100 WHERE max_file_size_mb < 100;

-- Specific updates for clarity
UPDATE document_categories SET max_file_size_mb = 15 WHERE code = 'member_passport_photo';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_national_id';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_kra_pin';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_proof_residence';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_application_form';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_agreement';
UPDATE document_categories SET max_file_size_mb = 25 WHERE code = 'member_consent_form';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_passport';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_certificate';
UPDATE document_categories SET max_file_size_mb = 100 WHERE code = 'member_employment';
UPDATE document_categories SET max_file_size_mb = 25 WHERE code = 'member_recommendation';

-- Keep small limits for tiny attachments
UPDATE document_categories SET max_file_size_mb = 0.1 WHERE code = 'notification_small_attachment';
UPDATE document_categories SET max_file_size_mb = 2 WHERE code = 'notification_icon';
UPDATE document_categories SET max_file_size_mb = 2 WHERE code = 'notification_favicon';

-- Keep large limit for bulk data
UPDATE document_categories SET max_file_size_mb = 1000 WHERE code = 'ai_training_data';
