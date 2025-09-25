-- Test migration for auto-sync functionality
-- Add a simple comment field to test the workflow

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT '';

-- Add a comment to document this test
COMMENT ON COLUMN nodes.comment IS 'Test field to demonstrate auto-sync workflow';
