-- ============================================================
-- Migration 005: New Feature Tables — Round 2
-- Review Generator, Price Monitor, Commissions, Sponsored,
-- Digital Products, Video Scripts, Volatility, Gaps, Redirects,
-- Site Config, ROI, Valuation, Newsletter, Competitor Feeds
-- Run AFTER 004_new_features.sql
-- All policies/triggers wrapped in DO blocks (safe re-run)
-- ============================================================

-- ── REVIEW GENERATOR ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_generator (
    id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID          NULL,
    asin             TEXT          NULL,
    product_url      TEXT          NULL,
    affiliate_url    TEXT          NOT NULL DEFAULT '',
    product_title    TEXT          NOT NULL DEFAULT '',
    product_image    TEXT          NULL,
    product_price    NUMERIC(10,2) NULL,
    product_rating   NUMERIC(3,1)  NULL,
    niche            TEXT          NOT NULL DEFAULT '',
    target_keyword   TEXT          NULL,
    review_title     TEXT          NOT NULL DEFAULT '',
    verdict_score    NUMERIC(3,1)  NULL,
    review_data      JSONB         NOT NULL DEFAULT '{}',
    word_count       INTEGER       NOT NULL DEFAULT 0,
    status           TEXT          NOT NULL DEFAULT 'draft',
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rg_user_id ON review_generator (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE review_generator ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own reviews" ON review_generator FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── PRICE MONITOR ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_monitor (
    id                  UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id             UUID          NULL,
    product_url         TEXT          NOT NULL,
    affiliate_url       TEXT          NOT NULL DEFAULT '',
    label               TEXT          NOT NULL DEFAULT '',
    image_url           TEXT          NULL,
    initial_price       NUMERIC(10,2) NULL,
    current_price       NUMERIC(10,2) NULL,
    lowest_price        NUMERIC(10,2) NULL,
    target_price        NUMERIC(10,2) NULL,
    currency            TEXT          NOT NULL DEFAULT 'USD',
    alert_threshold_pct NUMERIC(5,2)  NOT NULL DEFAULT 5,
    price_drop_pct      NUMERIC(5,2)  NULL,
    status              TEXT          NOT NULL DEFAULT 'active',
    last_checked        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pm_user_id ON price_monitor (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE price_monitor ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own price monitors" ON price_monitor FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS price_alerts (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    monitor_id  UUID          NOT NULL REFERENCES price_monitor(id) ON DELETE CASCADE,
    alert_type  TEXT          NOT NULL DEFAULT 'price_drop',
    old_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
    new_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
    drop_pct    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    resolved    BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pa_user_id ON price_alerts (user_id, resolved); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own price alerts" ON price_alerts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── COMMISSION TRACKER ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commission_history (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_id      UUID         NULL,
    network         TEXT         NOT NULL DEFAULT 'direct',
    program_name    TEXT         NOT NULL DEFAULT '',
    old_rate        NUMERIC(6,2) NULL,
    new_rate        NUMERIC(6,2) NOT NULL,
    commission_type TEXT         NOT NULL DEFAULT 'percentage',
    category        TEXT         NOT NULL DEFAULT '',
    change_pct      NUMERIC(6,2) NULL,
    direction       TEXT         NOT NULL DEFAULT 'initial',
    effective_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ch_user_id ON commission_history (user_id, effective_date DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE commission_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own commission history" ON commission_history FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS commission_alerts (
    id                     UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    commission_history_id  UUID         NULL REFERENCES commission_history(id) ON DELETE CASCADE,
    program_name           TEXT         NOT NULL DEFAULT '',
    old_rate               NUMERIC(6,2) NULL,
    new_rate               NUMERIC(6,2) NOT NULL DEFAULT 0,
    change_pct             NUMERIC(6,2) NULL,
    resolved               BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE commission_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own commission alerts" ON commission_alerts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SPONSORED DEALS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sponsored_deals (
    id                       UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id                  UUID          NULL,
    post_id                  UUID          NULL,
    brand_name               TEXT          NOT NULL,
    contact_name             TEXT          NULL,
    contact_email            TEXT          NULL,
    deal_type                TEXT          NOT NULL DEFAULT 'sponsored_post',
    agreed_fee               NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency                 TEXT          NOT NULL DEFAULT 'USD',
    deliverable_description  TEXT          NOT NULL DEFAULT '',
    deadline                 DATE          NULL,
    disclosure_type          TEXT          NOT NULL DEFAULT 'sponsored',
    status                   TEXT          NOT NULL DEFAULT 'negotiating',
    delivered_at             TIMESTAMPTZ   NULL,
    payment_date             DATE          NULL,
    notes                    TEXT          NOT NULL DEFAULT '',
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sd_user_id ON sponsored_deals (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE sponsored_deals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own sponsored deals" ON sponsored_deals FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── DIGITAL PRODUCTS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS digital_products (
    id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name          TEXT          NOT NULL,
    type          TEXT          NOT NULL DEFAULT 'ebook',
    price         NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency      TEXT          NOT NULL DEFAULT 'USD',
    platform      TEXT          NOT NULL DEFAULT 'direct',
    product_url   TEXT          NULL,
    checkout_url  TEXT          NULL,
    niche         TEXT          NOT NULL DEFAULT '',
    description   TEXT          NOT NULL DEFAULT '',
    image_url     TEXT          NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    total_sales   INTEGER       NOT NULL DEFAULT 0,
    total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_dp_user_id ON digital_products (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE digital_products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own digital products" ON digital_products FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS digital_product_sales (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id  UUID          NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    sale_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
    buyer_email TEXT          NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE digital_product_sales ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own sales" ON digital_product_sales FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── VIDEO SCRIPTS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS video_scripts (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id       UUID        NULL,
    blog_title    TEXT        NOT NULL DEFAULT '',
    keyword       TEXT        NOT NULL DEFAULT '',
    format        TEXT        NOT NULL DEFAULT 'youtube_long',
    channel_style TEXT        NOT NULL DEFAULT 'educational',
    niche         TEXT        NOT NULL DEFAULT '',
    video_title   TEXT        NOT NULL DEFAULT '',
    script_data   JSONB       NOT NULL DEFAULT '{}',
    word_count    INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_vs_user_id ON video_scripts (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE video_scripts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own video scripts" ON video_scripts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SERP VOLATILITY ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS volatility_snapshots (
    id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID         NOT NULL,
    snapshot_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
    volatility_score INTEGER      NOT NULL DEFAULT 0 CHECK (volatility_score BETWEEN 0 AND 100),
    ranking_count    INTEGER      NOT NULL DEFAULT 0,
    keywords_gained  INTEGER      NOT NULL DEFAULT 0,
    keywords_lost    INTEGER      NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_volt_site_id ON volatility_snapshots (site_id, snapshot_date); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE volatility_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own snapshots" ON volatility_snapshots FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS algo_updates (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL DEFAULT '',
    date        DATE        NOT NULL,
    type        TEXT        NOT NULL DEFAULT 'custom',
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE algo_updates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own algo updates" ON algo_updates FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── TOPIC GAPS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS topic_gaps (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID        NOT NULL,
    topic             TEXT        NOT NULL DEFAULT '',
    content_type      TEXT        NOT NULL DEFAULT 'article',
    search_intent     TEXT        NOT NULL DEFAULT 'informational',
    estimated_volume  TEXT        NOT NULL DEFAULT 'medium',
    difficulty        TEXT        NOT NULL DEFAULT 'medium',
    revenue_potential TEXT        NOT NULL DEFAULT 'medium',
    why_important     TEXT        NOT NULL DEFAULT '',
    suggested_title   TEXT        NOT NULL DEFAULT '',
    priority_score    INTEGER     NOT NULL DEFAULT 50,
    cluster           TEXT        NOT NULL DEFAULT '',
    status            TEXT        NOT NULL DEFAULT 'new',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tg_site_id ON topic_gaps (site_id, status, priority_score DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE topic_gaps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own topic gaps" ON topic_gaps FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── REDIRECTS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS redirects (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id       UUID        NULL,
    from_path     TEXT        NOT NULL,
    to_url        TEXT        NOT NULL,
    redirect_type TEXT        NOT NULL DEFAULT '301' CHECK (redirect_type IN ('301','302','307','410')),
    notes         TEXT        NOT NULL DEFAULT '',
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    hit_count     INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_red_user_id   ON redirects (user_id);          EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_red_from_path ON redirects (from_path);         EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_red_site_id   ON redirects (site_id) WHERE site_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE redirects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own redirects" ON redirects FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SITE CONFIG ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_configs (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id               UUID        NOT NULL,
    robots_txt            TEXT        NULL,
    sitemap_xml           TEXT        NULL,
    sitemap_config        JSONB       NOT NULL DEFAULT '{}',
    sitemap_generated_at  TIMESTAMPTZ NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id)
);

ALTER TABLE site_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own site configs" ON site_configs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── VALUATION SNAPSHOTS ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS valuation_snapshots (
    id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID          NULL,
    monthly_revenue   NUMERIC(10,2) NOT NULL DEFAULT 0,
    valuation_mid     INTEGER       NOT NULL DEFAULT 0,
    applied_multiple  NUMERIC(5,1)  NOT NULL DEFAULT 0,
    snapshot_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_val_user_id ON valuation_snapshots (user_id, snapshot_date); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE valuation_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own valuations" ON valuation_snapshots FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── NEWSLETTER ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newsletter_sends (
    id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject          TEXT          NOT NULL,
    sent_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    subscriber_count INTEGER       NOT NULL DEFAULT 0,
    open_count       INTEGER       NOT NULL DEFAULT 0,
    click_count      INTEGER       NOT NULL DEFAULT 0,
    unsubscribes     INTEGER       NOT NULL DEFAULT 0,
    open_rate        NUMERIC(5,2)  NULL,
    click_rate       NUMERIC(5,2)  NULL,
    platform         TEXT          NOT NULL DEFAULT 'manual',
    revenue_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ns_user_id ON newsletter_sends (user_id, sent_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE newsletter_sends ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own newsletter sends" ON newsletter_sends FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS newsletter_revenue (
    id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    send_id      UUID          NULL REFERENCES newsletter_sends(id) ON DELETE SET NULL,
    revenue_type TEXT          NOT NULL DEFAULT 'affiliate',
    amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
    notes        TEXT          NOT NULL DEFAULT '',
    date         DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE newsletter_revenue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own newsletter revenue" ON newsletter_revenue FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── COMPETITOR FEEDS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS competitor_feeds (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NULL,
    domain          TEXT        NOT NULL,
    feed_url        TEXT        NOT NULL,
    label           TEXT        NOT NULL DEFAULT '',
    last_checked    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_post_title TEXT        NULL,
    last_post_url   TEXT        NULL,
    last_post_date  TIMESTAMPTZ NULL,
    post_count      INTEGER     NOT NULL DEFAULT 0,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cf_user_id ON competitor_feeds (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE competitor_feeds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own competitor feeds" ON competitor_feeds FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS competitor_feed_items (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feed_id      UUID        NOT NULL REFERENCES competitor_feeds(id) ON DELETE CASCADE,
    title        TEXT        NOT NULL DEFAULT '',
    url          TEXT        NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary      TEXT        NOT NULL DEFAULT '',
    is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cfi_feed_id   ON competitor_feed_items (feed_id, published_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cfi_unread    ON competitor_feed_items (user_id, is_read) WHERE is_read = FALSE; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE competitor_feed_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own feed items" ON competitor_feed_items FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── UPDATED_AT TRIGGERS ───────────────────────────────────────

DO $$ BEGIN CREATE TRIGGER trg_rg_updated_at       BEFORE UPDATE ON review_generator  FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sd_updated_at       BEFORE UPDATE ON sponsored_deals   FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_dp_updated_at       BEFORE UPDATE ON digital_products  FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_redir_updated_at    BEFORE UPDATE ON redirects          FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sc_updated_at       BEFORE UPDATE ON site_configs       FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
