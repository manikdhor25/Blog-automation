-- ============================================================
-- Migration 007: New Feature Tables — Round 4
-- GA4, Network Transactions, EEAT Audits, Competitor Analyses,
-- Drip Sequences, Broken Outbound Links, Alt Text Results,
-- Post Templates, YouTube Optimizations, Content Ideas,
-- Canonical Settings, Tax Payments, BSR History (if needed)
-- Run AFTER 006_new_features_3.sql
-- All policies wrapped in DO blocks (safe re-run)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── GA4 ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ga4_snapshots (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    property_id      TEXT        NOT NULL,
    date_range       TEXT        NOT NULL DEFAULT '30d',
    total_sessions   INTEGER     NOT NULL DEFAULT 0,
    total_pageviews  INTEGER     NOT NULL DEFAULT 0,
    total_new_users  INTEGER     NOT NULL DEFAULT 0,
    top_pages        JSONB       NOT NULL DEFAULT '[]',
    snapshot_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (user_id, property_id, snapshot_date)
);

ALTER TABLE ga4_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own GA4 snapshots" ON ga4_snapshots FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ga4_page_metrics (
    id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    property_id TEXT         NOT NULL,
    site_id     UUID         NULL,
    page_path   TEXT         NOT NULL,
    sessions    INTEGER      NOT NULL DEFAULT 0,
    pageviews   INTEGER      NOT NULL DEFAULT 0,
    bounce_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    avg_duration NUMERIC(8,2) NOT NULL DEFAULT 0,
    date_range  TEXT         NOT NULL DEFAULT '30d',
    synced_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, property_id, page_path, date_range)
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ga4m_user_id ON ga4_page_metrics (user_id, sessions DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE ga4_page_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own GA4 metrics" ON ga4_page_metrics FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── NETWORK TRANSACTIONS ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS network_transactions (
    id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    network          TEXT          NOT NULL,
    merchant         TEXT          NOT NULL DEFAULT '',
    sale_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    commission       NUMERIC(10,2) NOT NULL DEFAULT 0,
    transaction_date DATE          NOT NULL,
    status           TEXT          NOT NULL DEFAULT 'pending',
    synced_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, network, merchant, transaction_date)
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_nt_user_id ON network_transactions (user_id, transaction_date DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE network_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own transactions" ON network_transactions FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── EEAT AUDITS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eeat_audits (
    id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id        UUID         NOT NULL,
    score          INTEGER      NOT NULL DEFAULT 0,
    checks_passed  INTEGER      NOT NULL DEFAULT 0,
    checks_total   INTEGER      NOT NULL DEFAULT 0,
    checks_data    JSONB        NOT NULL DEFAULT '[]',
    audited_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, post_id)
);

ALTER TABLE eeat_audits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own EEAT audits" ON eeat_audits FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── COMPETITOR ANALYSES ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS competitor_analyses (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url           TEXT        NOT NULL,
    your_post_id  UUID        NULL,
    title         TEXT        NOT NULL DEFAULT '',
    word_count    INTEGER     NOT NULL DEFAULT 0,
    analysis_data JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ca_user_id ON competitor_analyses (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE competitor_analyses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own analyses" ON competitor_analyses FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── DRIP SEQUENCES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drip_sequences (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sequence_name    TEXT        NOT NULL DEFAULT '',
    niche            TEXT        NOT NULL DEFAULT '',
    lead_magnet_topic TEXT       NOT NULL DEFAULT '',
    affiliate_product TEXT       NOT NULL DEFAULT '',
    affiliate_url    TEXT        NOT NULL DEFAULT '',
    goal             TEXT        NOT NULL DEFAULT 'affiliate_sale',
    email_count      INTEGER     NOT NULL DEFAULT 5,
    sequence_data    JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE drip_sequences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own drip sequences" ON drip_sequences FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── BROKEN OUTBOUND LINKS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS broken_outbound_links (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id     UUID        NOT NULL,
    url         TEXT        NOT NULL,
    anchor      TEXT        NOT NULL DEFAULT '',
    context     TEXT        NOT NULL DEFAULT '',
    http_status INTEGER     NULL,
    error       TEXT        NULL,
    status      TEXT        NOT NULL DEFAULT 'broken',
    fixed_url   TEXT        NULL,
    fixed_at    TIMESTAMPTZ NULL,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, post_id, url)
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bol_user_id ON broken_outbound_links (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE broken_outbound_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own broken links" ON broken_outbound_links FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── ALT TEXT RESULTS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alt_text_results (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id     UUID        NULL,
    image_url   TEXT        NOT NULL,
    alt_text    TEXT        NOT NULL DEFAULT '',
    title_attr  TEXT        NOT NULL DEFAULT '',
    applied     BOOLEAN     NOT NULL DEFAULT FALSE,
    applied_at  TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE alt_text_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own alt results" ON alt_text_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── POST TEMPLATES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_templates (
    id                 UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_name      TEXT         NOT NULL DEFAULT '',
    template_type      TEXT         NOT NULL DEFAULT 'how_to',
    source_post_id     UUID         NULL,
    seo_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
    overall_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
    structure          JSONB        NOT NULL DEFAULT '{}',
    headings_blueprint JSONB        NOT NULL DEFAULT '[]',
    word_count_target  INTEGER      NOT NULL DEFAULT 0,
    times_used         INTEGER      NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE post_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own templates" ON post_templates FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── YOUTUBE OPTIMIZATIONS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS youtube_optimizations (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    script_id         UUID        NULL,
    keyword           TEXT        NOT NULL DEFAULT '',
    niche             TEXT        NOT NULL DEFAULT '',
    primary_title     TEXT        NOT NULL DEFAULT '',
    tag_count         INTEGER     NOT NULL DEFAULT 0,
    optimization_data JSONB       NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE youtube_optimizations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own YT optimizations" ON youtube_optimizations FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CONTENT IDEAS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_ideas (
    id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id                 UUID        NULL,
    title                   TEXT        NOT NULL DEFAULT '',
    keyword                 TEXT        NOT NULL DEFAULT '',
    search_volume_estimate  TEXT        NOT NULL DEFAULT '',
    search_intent           TEXT        NOT NULL DEFAULT '',
    content_type            TEXT        NOT NULL DEFAULT '',
    monetization            TEXT        NOT NULL DEFAULT '',
    revenue_potential       TEXT        NOT NULL DEFAULT 'medium',
    cluster                 TEXT        NOT NULL DEFAULT '',
    why_now                 TEXT        NOT NULL DEFAULT '',
    priority_score          INTEGER     NOT NULL DEFAULT 50,
    difficulty              TEXT        NOT NULL DEFAULT 'medium',
    status                  TEXT        NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','saved','dismissed','used')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ci_user_id ON content_ideas (user_id, status, priority_score DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own content ideas" ON content_ideas FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CANONICAL SETTINGS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS canonical_settings (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id        UUID        NOT NULL,
    canonical_url  TEXT        NOT NULL,
    set_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, post_id)
);

ALTER TABLE canonical_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own canonicals" ON canonical_settings FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── TAX PAYMENTS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_payments (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quarter     TEXT          NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
    year        INTEGER       NOT NULL,
    amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
    paid_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, quarter, year)
);

ALTER TABLE tax_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own tax payments" ON tax_payments FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
