-- ============================================================
-- Migration 013: New Feature Tables — Round 10
-- Email Providers, Scheduled Social Posts, Revenue Models,
-- Programmatic Templates & Batches, GSC CTR Opportunities,
-- Backlink Gap Results
-- Run AFTER 012_new_features_9.sql
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── EMAIL PROVIDERS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_providers (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL DEFAULT '',
    provider         TEXT        NOT NULL DEFAULT '',
    api_key          TEXT        NOT NULL DEFAULT '',
    api_secret       TEXT        NULL,
    account_id       TEXT        NULL,
    server_prefix    TEXT        NULL,
    subscriber_count INTEGER     NOT NULL DEFAULT 0,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    last_synced      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ep_user_id ON email_providers (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE email_providers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own email providers" ON email_providers FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SCHEDULED SOCIAL POSTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduled_social_posts (
    id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id                  UUID        NULL,
    site_id                  UUID        NULL,
    platform                 TEXT        NOT NULL DEFAULT 'twitter'
                                 CHECK (platform IN ('twitter','linkedin','pinterest','facebook','instagram')),
    content                  TEXT        NOT NULL DEFAULT '',
    image_url                TEXT        NULL,
    link_url                 TEXT        NULL,
    scheduled_at             TIMESTAMPTZ NOT NULL,
    status                   TEXT        NOT NULL DEFAULT 'scheduled'
                                 CHECK (status IN ('scheduled','published','failed','draft')),
    platform_post_id         TEXT        NULL,
    recurring                BOOLEAN     NOT NULL DEFAULT FALSE,
    recurring_interval_days  INTEGER     NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ssp_user_id ON scheduled_social_posts (user_id, scheduled_at ASC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE scheduled_social_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own social posts" ON scheduled_social_posts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── REVENUE MODELS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS revenue_models (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL DEFAULT '',
    input_params  JSONB       NOT NULL DEFAULT '{}',
    months_data   JSONB       NOT NULL DEFAULT '[]',
    summary       JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rm2_user_id ON revenue_models (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE revenue_models ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own revenue models" ON revenue_models FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── PROGRAMMATIC TEMPLATES ───────────────────────────────────

CREATE TABLE IF NOT EXISTS programmatic_templates (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID        NULL,
    name             TEXT        NOT NULL DEFAULT '',
    niche            TEXT        NOT NULL DEFAULT '',
    template_type    TEXT        NOT NULL DEFAULT 'custom',
    title_pattern    TEXT        NOT NULL DEFAULT '',
    content_outline  TEXT        NOT NULL DEFAULT '',
    variable_columns JSONB       NOT NULL DEFAULT '[]',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pt_user_id ON programmatic_templates (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE programmatic_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own templates" ON programmatic_templates FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── PROGRAMMATIC BATCHES ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS programmatic_batches (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID        NULL,
    template_id      UUID        NULL REFERENCES programmatic_templates(id) ON DELETE SET NULL,
    name             TEXT        NOT NULL DEFAULT '',
    total_pages      INTEGER     NOT NULL DEFAULT 0,
    generated_pages  INTEGER     NOT NULL DEFAULT 0,
    status           TEXT        NOT NULL DEFAULT 'generating'
                         CHECK (status IN ('generating','completed','failed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pb_user_id ON programmatic_batches (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE programmatic_batches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own batches" ON programmatic_batches FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── GSC CTR OPPORTUNITIES ────────────────────────────────────

CREATE TABLE IF NOT EXISTS gsc_ctr_opportunities (
    id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID         NULL,
    query             TEXT         NOT NULL DEFAULT '',
    page              TEXT         NOT NULL DEFAULT '',
    impressions       INTEGER      NOT NULL DEFAULT 0,
    clicks            INTEGER      NOT NULL DEFAULT 0,
    ctr               NUMERIC(5,4) NOT NULL DEFAULT 0,
    position          NUMERIC(5,2) NOT NULL DEFAULT 0,
    opportunity_score INTEGER      NOT NULL DEFAULT 0,
    potential_clicks  INTEGER      NOT NULL DEFAULT 0,
    status            TEXT         NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','optimized','dismissed')),
    optimized_at      TIMESTAMPTZ  NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_gco_user_id ON gsc_ctr_opportunities (user_id, opportunity_score DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_gco_unique ON gsc_ctr_opportunities (user_id, query, page); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE gsc_ctr_opportunities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own ctr opps" ON gsc_ctr_opportunities FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── BACKLINK GAP RESULTS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS backlink_gap_results (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    your_domain          TEXT        NOT NULL DEFAULT '',
    competitor_domains   JSONB       NOT NULL DEFAULT '[]',
    niche                TEXT        NULL,
    gap_count            INTEGER     NOT NULL DEFAULT 0,
    result_data          JSONB       NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bgr_user_id ON backlink_gap_results (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE backlink_gap_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own gap results" ON backlink_gap_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── ADD batch_id to posts (for programmatic batches) ─────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='batch_id') THEN
        ALTER TABLE posts ADD COLUMN batch_id UUID NULL;
    END IF;
END $$;
