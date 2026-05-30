-- ============================================================
-- Migration 010: New Feature Tables — Round 7
-- Internal Link Injector, Affiliate Earnings, Content Pipeline,
-- Algo Tracker, 404 Monitor, Duplicate Scanner,
-- Onboarding Progress, Redirect Rules
-- Run AFTER 009_new_features_6.sql
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── INTERNAL LINK OPPORTUNITIES ──────────────────────────────
-- (extends link_opportunities from 006 with new fields)

CREATE TABLE IF NOT EXISTS internal_link_opportunities (
    id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID         NULL,
    from_post_id     UUID         NOT NULL,
    to_post_id       UUID         NOT NULL,
    from_post_title  TEXT         NOT NULL DEFAULT '',
    to_post_title    TEXT         NOT NULL DEFAULT '',
    anchor_text      TEXT         NOT NULL DEFAULT '',
    context_hint     TEXT         NOT NULL DEFAULT '',
    relevance_score  NUMERIC(3,2) NOT NULL DEFAULT 0,
    reason           TEXT         NOT NULL DEFAULT '',
    status           TEXT         NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','injected','dismissed')),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ilo_user_id ON internal_link_opportunities (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ilo_site_id ON internal_link_opportunities (site_id) WHERE site_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE internal_link_opportunities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own link opps v2" ON internal_link_opportunities FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── AFFILIATE EARNINGS ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_earnings (
    id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id      UUID          NULL,
    program      TEXT          NOT NULL DEFAULT '',
    network      TEXT          NOT NULL DEFAULT '',
    month        TEXT          NOT NULL DEFAULT '',
    clicks       INTEGER       NOT NULL DEFAULT 0,
    conversions  INTEGER       NOT NULL DEFAULT 0,
    revenue      NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency     TEXT          NOT NULL DEFAULT 'USD',
    notes        TEXT          NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ae_user_month ON affiliate_earnings (user_id, month DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_unique ON affiliate_earnings (user_id, program, month); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own earnings" ON affiliate_earnings FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_ae_updated BEFORE UPDATE ON affiliate_earnings FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CONTENT PIPELINE RUNS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID        NULL,
    keyword           TEXT        NOT NULL DEFAULT '',
    post_type         TEXT        NOT NULL DEFAULT 'guide',
    stages_completed  JSONB       NOT NULL DEFAULT '[]',
    title             TEXT        NOT NULL DEFAULT '',
    word_count        INTEGER     NOT NULL DEFAULT 0,
    status            TEXT        NOT NULL DEFAULT 'completed',
    result_data       JSONB       NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pr_user_id ON pipeline_runs (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own pipeline runs" ON pipeline_runs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── ALGORITHM UPDATE IMPACTS ─────────────────────────────────

CREATE TABLE IF NOT EXISTS algo_update_impacts (
    id                 UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id            UUID         NULL,
    update_name        TEXT         NOT NULL DEFAULT '',
    update_date        DATE         NULL,
    update_type        TEXT         NOT NULL DEFAULT 'core',
    traffic_change_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
    affected_pages     INTEGER      NOT NULL DEFAULT 0,
    notes              TEXT         NOT NULL DEFAULT '',
    recovery_status    TEXT         NOT NULL DEFAULT 'impacted'
                           CHECK (recovery_status IN ('impacted','recovering','recovered','positive')),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_aui_user_id ON algo_update_impacts (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE algo_update_impacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own algo impacts" ON algo_update_impacts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── BROKEN PAGES (404 Monitor) ───────────────────────────────

CREATE TABLE IF NOT EXISTS broken_pages_404 (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id     UUID        NULL,
    url         TEXT        NOT NULL DEFAULT '',
    referrer    TEXT        NULL,
    hit_count   INTEGER     NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'unresolved'
                    CHECK (status IN ('unresolved','redirected','resolved')),
    first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bp_user_id ON broken_pages_404 (user_id, hit_count DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bp_url ON broken_pages_404 (url); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE broken_pages_404 ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own 404 pages" ON broken_pages_404 FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── REDIRECT RULES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS redirect_rules (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NULL,
    from_url        TEXT        NOT NULL DEFAULT '',
    to_url          TEXT        NOT NULL DEFAULT '',
    redirect_type   TEXT        NOT NULL DEFAULT '301',
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    hit_count       INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rr_user_id ON redirect_rules (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE redirect_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own redirect rules" ON redirect_rules FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── DUPLICATE SCAN RESULTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS duplicate_scan_results (
    id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID         NULL,
    post_a_id         UUID         NOT NULL,
    post_a_title      TEXT         NOT NULL DEFAULT '',
    post_b_id         UUID         NOT NULL,
    post_b_title      TEXT         NOT NULL DEFAULT '',
    similarity_score  NUMERIC(3,2) NOT NULL DEFAULT 0,
    recommendation    TEXT         NOT NULL DEFAULT 'differentiate',
    ai_recommendation JSONB        NULL,
    status            TEXT         NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','merged','differentiated','kept_both')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_dsr_user_id ON duplicate_scan_results (user_id, similarity_score DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_dsr_pair ON duplicate_scan_results (user_id, post_a_id, post_b_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE duplicate_scan_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own scan results" ON duplicate_scan_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── ONBOARDING PROGRESS ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_progress (
    user_id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    completed_steps  JSONB       NOT NULL DEFAULT '[]',
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own onboarding" ON onboarding_progress FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
