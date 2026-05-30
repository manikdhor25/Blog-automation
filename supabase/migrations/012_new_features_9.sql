-- ============================================================
-- Migration 012: New Feature Tables — Round 9 (Final)
-- Outbound Check Results, RSS Feeds, RSS Feed Items
-- Run AFTER 011_new_features_8.sql
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── OUTBOUND LINK CHECK RESULTS ──────────────────────────────

CREATE TABLE IF NOT EXISTS outbound_check_results (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NULL,
    posts_checked   INTEGER     NOT NULL DEFAULT 0,
    links_checked   INTEGER     NOT NULL DEFAULT 0,
    broken_count    INTEGER     NOT NULL DEFAULT 0,
    broken_links    JSONB       NOT NULL DEFAULT '[]',
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ocr_user_id ON outbound_check_results (user_id, checked_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE outbound_check_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own outbound results" ON outbound_check_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── RSS FEEDS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rss_feeds (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID        NULL,
    feed_url          TEXT        NOT NULL DEFAULT '',
    label             TEXT        NOT NULL DEFAULT '',
    competitor_domain TEXT        NULL,
    niche             TEXT        NULL,
    alert_on_new      BOOLEAN     NOT NULL DEFAULT TRUE,
    last_item_url     TEXT        NULL,
    item_count        INTEGER     NOT NULL DEFAULT 0,
    last_checked      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rf_user_id ON rss_feeds (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE rss_feeds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own rss feeds" ON rss_feeds FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── RSS FEED ITEMS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rss_feed_items (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feed_id      UUID        NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
    title        TEXT        NOT NULL DEFAULT '',
    url          TEXT        NOT NULL DEFAULT '',
    summary      TEXT        NOT NULL DEFAULT '',
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_new       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rfi_feed_id ON rss_feed_items (feed_id, published_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_rfi_url ON rss_feed_items (user_id, url); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE rss_feed_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own feed items" ON rss_feed_items FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
