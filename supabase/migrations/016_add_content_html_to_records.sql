-- Migration: Add content_html column to content_records
-- Stores the full generated HTML content for viewing in content history

DO $$ BEGIN
  ALTER TABLE content_records ADD COLUMN content_html TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
