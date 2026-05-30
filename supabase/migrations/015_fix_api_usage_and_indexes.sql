-- ============================================================================
-- Migration 015: Fix api_usage column names & add performance indexes
-- ============================================================================
--
-- Problem: The api_usage table was created with columns named
--   input_tokens, output_tokens, cost_usd
-- but ALL application code (services, hooks, components) references
--   tokens_in, tokens_out, estimated_cost
--
-- This mismatch causes every INSERT / SELECT on api_usage to fail at runtime.
--
-- Additionally, cost-dashboard queries join api_usage ↔ content_records on
-- session_id but neither table had an index on that column.
-- ============================================================================

-- -------------------------------------------------------
-- 1. Rename api_usage columns to match application code
-- -------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE api_usage RENAME COLUMN input_tokens TO tokens_in;
EXCEPTION
  WHEN undefined_column THEN NULL;   -- already renamed
END $$;

DO $$ BEGIN
  ALTER TABLE api_usage RENAME COLUMN output_tokens TO tokens_out;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE api_usage RENAME COLUMN cost_usd TO estimated_cost;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- -------------------------------------------------------
-- 2. Performance indexes for session_id join queries
-- -------------------------------------------------------

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_au_session_id
    ON api_usage (session_id)
    WHERE session_id != '';
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cr_session_id
    ON content_records (session_id)
    WHERE session_id IS NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;
