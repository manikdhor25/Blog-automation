-- ============================================================
-- Migration 008: New Feature Tables — Round 5
-- HARO Queries, Cluster Maps, NLP Briefs, SEO Predictions,
-- Glossary Terms, Social Listening, Expert Roundups,
-- Email Rules, Webhooks, Offer AB Tests, Acquisition Prospects,
-- Revenue Goals, Link Placement Results, SERP Cache
-- Run AFTER 007_new_features_4.sql
-- All policies wrapped in DO blocks (safe re-run)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── HARO QUERIES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS haro_queries (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category         TEXT        NOT NULL DEFAULT '',
    query_text       TEXT        NOT NULL DEFAULT '',
    publication      TEXT        NOT NULL DEFAULT '',
    deadline_hours   INTEGER     NOT NULL DEFAULT 48,
    relevance_score  NUMERIC(3,2) NOT NULL DEFAULT 0,
    da_estimate      INTEGER     NOT NULL DEFAULT 0,
    link_potential   TEXT        NOT NULL DEFAULT 'medium',
    status           TEXT        NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','drafted','sent','placed')),
    generated_pitch  JSONB       NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_haro_user_status ON haro_queries (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE haro_queries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own haro queries" ON haro_queries FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_haro_updated BEFORE UPDATE ON haro_queries FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CLUSTER MAPS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cluster_maps (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID        NULL,
    niche             TEXT        NOT NULL DEFAULT '',
    pillar_topic      TEXT        NOT NULL DEFAULT '',
    depth             TEXT        NOT NULL DEFAULT 'medium',
    total_posts       INTEGER     NOT NULL DEFAULT 0,
    estimated_traffic INTEGER     NOT NULL DEFAULT 0,
    tasks_created     INTEGER     NOT NULL DEFAULT 0,
    cluster_data      JSONB       NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cm_user_id ON cluster_maps (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE cluster_maps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own cluster maps" ON cluster_maps FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── NLP BRIEFS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nlp_briefs (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keyword          TEXT        NOT NULL DEFAULT '',
    niche            TEXT        NOT NULL DEFAULT '',
    search_intent    TEXT        NOT NULL DEFAULT '',
    target_word_count INTEGER    NOT NULL DEFAULT 0,
    brief_data       JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_nlp_user_id ON nlp_briefs (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE nlp_briefs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own nlp briefs" ON nlp_briefs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SEO PREDICTIONS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seo_predictions (
    id                      UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keyword                 TEXT         NOT NULL DEFAULT '',
    difficulty_score        INTEGER      NOT NULL DEFAULT 0,
    difficulty_label        TEXT         NOT NULL DEFAULT 'Medium',
    ranking_probability_pct INTEGER      NOT NULL DEFAULT 0,
    estimated_time_to_rank  TEXT         NOT NULL DEFAULT '',
    required_word_count     INTEGER      NOT NULL DEFAULT 0,
    required_backlinks      INTEGER      NOT NULL DEFAULT 0,
    required_da             INTEGER      NOT NULL DEFAULT 0,
    prediction_data         JSONB        NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sp_user_id ON seo_predictions (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE seo_predictions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own seo predictions" ON seo_predictions FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── GLOSSARY TERMS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS glossary_terms (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id               UUID        NULL,
    niche                 TEXT        NOT NULL DEFAULT '',
    term                  TEXT        NOT NULL DEFAULT '',
    slug                  TEXT        NOT NULL DEFAULT '',
    definition            TEXT        NOT NULL DEFAULT '',
    expanded_explanation  TEXT        NOT NULL DEFAULT '',
    related_terms         JSONB       NOT NULL DEFAULT '[]',
    example               TEXT        NULL,
    affiliate_angle       TEXT        NULL,
    wp_published          BOOLEAN     NOT NULL DEFAULT FALSE,
    wp_post_id            INTEGER     NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_gt_user_niche ON glossary_terms (user_id, niche); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_gt_slug ON glossary_terms (slug); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE glossary_terms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own glossary terms" ON glossary_terms FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SOCIAL LISTENING POSTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS social_listening_posts (
    id                  UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keyword             TEXT         NOT NULL DEFAULT '',
    platform            TEXT         NOT NULL DEFAULT 'reddit',
    external_id         TEXT         NULL,
    url                 TEXT         NOT NULL DEFAULT '',
    title               TEXT         NOT NULL DEFAULT '',
    snippet             TEXT         NOT NULL DEFAULT '',
    author              TEXT         NOT NULL DEFAULT '',
    upvotes             INTEGER      NOT NULL DEFAULT 0,
    comments            INTEGER      NOT NULL DEFAULT 0,
    opportunity_type    TEXT         NOT NULL DEFAULT 'discussion',
    content_angle       TEXT         NOT NULL DEFAULT '',
    affiliate_potential TEXT         NOT NULL DEFAULT 'medium',
    trending_score      INTEGER      NOT NULL DEFAULT 0,
    posted_at           TIMESTAMPTZ  NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_slp_user_id ON social_listening_posts (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_slp_keyword ON social_listening_posts (keyword); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE social_listening_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own social posts" ON social_listening_posts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── EXPERT ROUNDUPS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expert_roundups (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic                TEXT        NOT NULL DEFAULT '',
    question             TEXT        NOT NULL DEFAULT '',
    niche                TEXT        NOT NULL DEFAULT '',
    target_expert_count  INTEGER     NOT NULL DEFAULT 10,
    experts              JSONB       NOT NULL DEFAULT '[]',
    generated_post       TEXT        NULL,
    status               TEXT        NOT NULL DEFAULT 'planning'
                             CHECK (status IN ('planning','outreach','collecting','writing','published')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_er_user_id ON expert_roundups (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE expert_roundups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own roundups" ON expert_roundups FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_er_updated BEFORE UPDATE ON expert_roundups FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── EMAIL AUTOMATION RULES ───────────────────────────────────

CREATE TABLE IF NOT EXISTS email_automation_rules (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL DEFAULT '',
    trigger_type     TEXT        NOT NULL DEFAULT 'subscriber_joins',
    trigger_value    TEXT        NULL,
    conditions       JSONB       NOT NULL DEFAULT '[]',
    actions          JSONB       NOT NULL DEFAULT '[]',
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    stats            JSONB       NOT NULL DEFAULT '{"triggered":0,"emails_sent":0,"conversions":0}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ear_user_id ON email_automation_rules (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE email_automation_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own email rules" ON email_automation_rules FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_ear_updated BEFORE UPDATE ON email_automation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── WEBHOOKS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhooks (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL DEFAULT '',
    trigger_event    TEXT        NOT NULL DEFAULT 'post_published',
    endpoint_url     TEXT        NOT NULL DEFAULT '',
    method           TEXT        NOT NULL DEFAULT 'POST',
    headers          JSONB       NOT NULL DEFAULT '{}',
    payload_template JSONB       NOT NULL DEFAULT '{}',
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    last_triggered   TIMESTAMPTZ NULL,
    trigger_count    INTEGER     NOT NULL DEFAULT 0,
    failure_count    INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_wh_user_id ON webhooks (user_id, trigger_event); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own webhooks" ON webhooks FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_wh_updated BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── OFFER A/B TESTS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offer_ab_tests (
    id                       UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id                  UUID          NULL,
    site_id                  UUID          NULL,
    keyword                  TEXT          NOT NULL DEFAULT '',
    offer_a_name             TEXT          NOT NULL DEFAULT '',
    offer_a_url              TEXT          NOT NULL DEFAULT '',
    offer_a_commission_rate  NUMERIC(5,2)  NULL,
    offer_a_price            NUMERIC(10,2) NULL,
    offer_b_name             TEXT          NOT NULL DEFAULT '',
    offer_b_url              TEXT          NOT NULL DEFAULT '',
    offer_b_commission_rate  NUMERIC(5,2)  NULL,
    offer_b_price            NUMERIC(10,2) NULL,
    test_duration_days       INTEGER       NOT NULL DEFAULT 14,
    status                   TEXT          NOT NULL DEFAULT 'running'
                                 CHECK (status IN ('running','concluded','paused')),
    winner                   TEXT          NULL CHECK (winner IN ('a','b','inconclusive')),
    clicks_a                 INTEGER       NOT NULL DEFAULT 0,
    clicks_b                 INTEGER       NOT NULL DEFAULT 0,
    conversions_a            INTEGER       NOT NULL DEFAULT 0,
    conversions_b            INTEGER       NOT NULL DEFAULT 0,
    revenue_a                NUMERIC(10,2) NOT NULL DEFAULT 0,
    revenue_b                NUMERIC(10,2) NOT NULL DEFAULT 0,
    analysis                 JSONB         NULL,
    started_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    ends_at                  TIMESTAMPTZ   NOT NULL DEFAULT now() + INTERVAL '14 days',
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_oab_user_id ON offer_ab_tests (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE offer_ab_tests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own ab tests" ON offer_ab_tests FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_oab_updated BEFORE UPDATE ON offer_ab_tests FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ACQUISITION PROSPECTS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS acquisition_prospects (
    id                       UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name                     TEXT          NOT NULL DEFAULT '',
    url                      TEXT          NULL,
    niche                    TEXT          NOT NULL DEFAULT '',
    asking_price             NUMERIC(12,2) NOT NULL DEFAULT 0,
    monthly_revenue          NUMERIC(10,2) NOT NULL DEFAULT 0,
    monthly_traffic          INTEGER       NOT NULL DEFAULT 0,
    da                       INTEGER       NULL,
    age_months               INTEGER       NULL,
    monetization             JSONB         NOT NULL DEFAULT '[]',
    acquisition_score        INTEGER       NOT NULL DEFAULT 0,
    pros                     JSONB         NOT NULL DEFAULT '[]',
    cons                     JSONB         NOT NULL DEFAULT '[]',
    due_diligence_checklist  JSONB         NOT NULL DEFAULT '[]',
    source                   TEXT          NULL,
    status                   TEXT          NOT NULL DEFAULT 'watching'
                                 CHECK (status IN ('watching','contacted','due_diligence','negotiating','acquired','passed')),
    notes                    TEXT          NULL,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ap_user_id ON acquisition_prospects (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ap_score ON acquisition_prospects (acquisition_score DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE acquisition_prospects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own prospects" ON acquisition_prospects FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_ap_updated BEFORE UPDATE ON acquisition_prospects FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── REVENUE GOALS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS revenue_goals (
    id                   UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id              UUID          NULL,
    goal_name            TEXT          NOT NULL DEFAULT '',
    target_monthly_rev   NUMERIC(10,2) NOT NULL DEFAULT 0,
    current_monthly_rev  NUMERIC(10,2) NOT NULL DEFAULT 0,
    target_date          DATE          NULL,
    monetization_mix     JSONB         NOT NULL DEFAULT '{}',
    milestones           JSONB         NOT NULL DEFAULT '[]',
    action_plan          TEXT          NOT NULL DEFAULT '',
    status               TEXT          NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','achieved','abandoned')),
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rg_user_id ON revenue_goals (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE revenue_goals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own revenue goals" ON revenue_goals FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_rg_updated BEFORE UPDATE ON revenue_goals FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── LINK PLACEMENT RESULTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS link_placement_results (
    id                     UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id                UUID        NULL,
    site_id                UUID        NULL,
    affiliate_product      TEXT        NOT NULL DEFAULT '',
    affiliate_url          TEXT        NOT NULL DEFAULT '',
    placements_count       INTEGER     NOT NULL DEFAULT 0,
    optimal_link_count     INTEGER     NOT NULL DEFAULT 0,
    revenue_impact_estimate TEXT       NOT NULL DEFAULT '',
    result_data            JSONB       NOT NULL DEFAULT '{}',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lpr_user_id ON link_placement_results (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE link_placement_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own placement results" ON link_placement_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SERP CACHE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS serp_cache (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keyword          TEXT        NOT NULL DEFAULT '',
    location         TEXT        NOT NULL DEFAULT 'United States',
    device           TEXT        NOT NULL DEFAULT 'desktop',
    result_data      JSONB       NOT NULL DEFAULT '{}',
    provider         TEXT        NOT NULL DEFAULT '',
    last_checked     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sc_user_keyword ON serp_cache (user_id, keyword, location); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE serp_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own serp cache" ON serp_cache FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── AFFILIATE PROGRAMS ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_programs_saved (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID        NULL,
    program_name     TEXT        NOT NULL DEFAULT '',
    network          TEXT        NOT NULL DEFAULT '',
    niche            TEXT        NOT NULL DEFAULT '',
    commission_type  TEXT        NOT NULL DEFAULT 'percentage',
    commission_value NUMERIC(8,2) NOT NULL DEFAULT 0,
    cookie_days      INTEGER     NOT NULL DEFAULT 30,
    signup_url       TEXT        NOT NULL DEFAULT '',
    status           TEXT        NOT NULL DEFAULT 'saved'
                         CHECK (status IN ('saved','applied','approved','active','rejected')),
    notes            TEXT        NOT NULL DEFAULT '',
    monthly_potential NUMERIC(10,2) NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_aps_user_id ON affiliate_programs_saved (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE affiliate_programs_saved ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own saved programs" ON affiliate_programs_saved FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
