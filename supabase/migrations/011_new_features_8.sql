-- ============================================================
-- Migration 011: New Feature Tables — Round 8
-- Amazon Products, Brand Voices, Post Predictions,
-- Backlink CRM, Invoices, Rate Monitor,
-- Content Audit Results
-- Run AFTER 010_new_features_7.sql
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── AMAZON PRODUCTS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS amazon_products (
    id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID          NULL,
    asin            TEXT          NOT NULL,
    label           TEXT          NOT NULL DEFAULT '',
    affiliate_tag   TEXT          NULL,
    affiliate_url   TEXT          NOT NULL DEFAULT '',
    title           TEXT          NULL,
    current_price   NUMERIC(10,2) NULL,
    rating          NUMERIC(3,1)  NULL,
    review_count    INTEGER       NULL,
    in_stock        BOOLEAN       NULL,
    post_ids        JSONB         NOT NULL DEFAULT '[]',
    price_history   JSONB         NOT NULL DEFAULT '[]',
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    last_fetched    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ap2_user_id ON amazon_products (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_ap2_unique ON amazon_products (user_id, asin); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE amazon_products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own amazon products" ON amazon_products FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── BRAND VOICES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_voices (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID        NULL,
    name              TEXT        NOT NULL DEFAULT '',
    tone              JSONB       NOT NULL DEFAULT '[]',
    writing_style     TEXT        NOT NULL DEFAULT '',
    vocabulary_level  TEXT        NOT NULL DEFAULT 'moderate',
    person            TEXT        NOT NULL DEFAULT 'second_person',
    avoid_phrases     JSONB       NOT NULL DEFAULT '[]',
    signature_phrases JSONB       NOT NULL DEFAULT '[]',
    example_intro     TEXT        NULL,
    niche             TEXT        NULL,
    target_audience   TEXT        NULL,
    content_goals     JSONB       NOT NULL DEFAULT '[]',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bv_user_id ON brand_voices (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE brand_voices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own brand voices" ON brand_voices FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_bv_updated BEFORE UPDATE ON brand_voices FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── POST PREDICTIONS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_predictions (
    id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID          NULL,
    keyword           TEXT          NOT NULL DEFAULT '',
    niche             TEXT          NULL,
    post_type         TEXT          NOT NULL DEFAULT 'guide',
    word_count        INTEGER       NOT NULL DEFAULT 1500,
    top10_probability INTEGER       NOT NULL DEFAULT 0,
    time_to_rank      INTEGER       NOT NULL DEFAULT 0,
    month12_traffic   INTEGER       NOT NULL DEFAULT 0,
    month12_revenue   NUMERIC(10,2) NOT NULL DEFAULT 0,
    confidence_score  INTEGER       NOT NULL DEFAULT 0,
    prediction_data   JSONB         NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pp_user_id ON post_predictions (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE post_predictions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own predictions" ON post_predictions FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── LINK CAMPAIGNS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS link_campaigns (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NULL,
    name            TEXT        NOT NULL DEFAULT '',
    target_links    INTEGER     NOT NULL DEFAULT 20,
    links_acquired  INTEGER     NOT NULL DEFAULT 0,
    link_type       TEXT        NOT NULL DEFAULT 'mixed',
    niche           TEXT        NULL,
    status          TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','completed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lc2_user_id ON link_campaigns (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE link_campaigns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own link campaigns" ON link_campaigns FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_lc_updated BEFORE UPDATE ON link_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── LINK PROSPECTS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS link_prospects (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID        NULL,
    campaign_id       UUID        NULL REFERENCES link_campaigns(id) ON DELETE SET NULL,
    domain            TEXT        NOT NULL DEFAULT '',
    url               TEXT        NULL,
    contact_name      TEXT        NULL,
    contact_email     TEXT        NULL,
    da_estimate       INTEGER     NULL,
    link_type         TEXT        NOT NULL DEFAULT 'guest_post',
    status            TEXT        NOT NULL DEFAULT 'identified'
                          CHECK (status IN ('identified','researching','outreach_sent','followed_up','link_live','rejected','no_response')),
    notes             TEXT        NOT NULL DEFAULT '',
    link_url          TEXT        NULL,
    link_acquired_at  TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lp_user_id ON link_prospects (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lp_campaign ON link_prospects (campaign_id) WHERE campaign_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE link_prospects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own link prospects" ON link_prospects FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_lp_updated BEFORE UPDATE ON link_prospects FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── INVOICES ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
    id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_number   TEXT          NOT NULL DEFAULT '',
    client_name      TEXT          NOT NULL DEFAULT '',
    client_email     TEXT          NULL,
    service_type     TEXT          NOT NULL DEFAULT 'custom',
    subtotal         NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax              NUMERIC(10,2) NOT NULL DEFAULT 0,
    total            NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency         TEXT          NOT NULL DEFAULT 'USD',
    issue_date       DATE          NOT NULL,
    due_date         DATE          NULL,
    status           TEXT          NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','paid','overdue')),
    html             TEXT          NOT NULL DEFAULT '',
    items            JSONB         NOT NULL DEFAULT '[]',
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_inv_user_id ON invoices (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own invoices" ON invoices FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── RATE MONITORS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_monitors (
    id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id               UUID         NULL,
    program_name          TEXT         NOT NULL DEFAULT '',
    network               TEXT         NULL,
    category              TEXT         NULL,
    current_rate          NUMERIC(8,4) NOT NULL DEFAULT 0,
    original_rate         NUMERIC(8,4) NOT NULL DEFAULT 0,
    rate_type             TEXT         NOT NULL DEFAULT 'percentage',
    alert_threshold_pct   INTEGER      NOT NULL DEFAULT 10,
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    notes                 TEXT         NOT NULL DEFAULT '',
    last_checked          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rm_user_id ON rate_monitors (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE rate_monitors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own rate monitors" ON rate_monitors FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── RATE CHANGE HISTORY ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_change_history (
    id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    monitor_id       UUID         NOT NULL REFERENCES rate_monitors(id) ON DELETE CASCADE,
    old_rate         NUMERIC(8,4) NOT NULL DEFAULT 0,
    rate             NUMERIC(8,4) NOT NULL DEFAULT 0,
    change_pct       NUMERIC(6,2) NOT NULL DEFAULT 0,
    change_reason    TEXT         NULL,
    effective_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    logged_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rch_monitor_id ON rate_change_history (monitor_id, logged_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE rate_change_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own rate history" ON rate_change_history FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CONTENT AUDIT RESULTS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_audit_results (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NOT NULL,
    post_count      INTEGER     NOT NULL DEFAULT 0,
    critical_count  INTEGER     NOT NULL DEFAULT 0,
    warning_count   INTEGER     NOT NULL DEFAULT 0,
    avg_score       INTEGER     NOT NULL DEFAULT 0,
    summary         JSONB       NOT NULL DEFAULT '{}',
    results         JSONB       NOT NULL DEFAULT '[]',
    audit_date      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_car_user_id ON content_audit_results (user_id, site_id, audit_date DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE content_audit_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own audit results" ON content_audit_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
