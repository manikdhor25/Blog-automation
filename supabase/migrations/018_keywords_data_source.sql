-- ============================================================
-- RankMaster Pro — Add data_source provenance to keywords
-- Migration: 018_keywords_data_source.sql
--
-- The keywords API and keyword-data engine tag each row with how its
-- metrics were obtained ('dataforseo' = measured, 'ai_estimated' =
-- projected). The column was referenced in code but never created.
-- ============================================================

ALTER TABLE keywords
    ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'ai_estimated';
