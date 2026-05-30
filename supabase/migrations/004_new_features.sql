-- ============================================================
-- Migration 004: New Feature Tables — RankMaster Pro
-- SAFE TO RUN ON EXISTING DB — all policies/triggers wrapped
-- in DO blocks with duplicate_object exception handling.
-- Run AFTER 000_base_schema.sql.
-- ============================================================

-- ── 1. CLOAKED LINKS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cloaked_links (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_id       UUID        NULL,  -- soft ref to affiliate_programs (no FK for flexibility)
    post_id          UUID        NULL,
    slug             TEXT        NOT NULL,
    destination_url  TEXT        NOT NULL,
    label            TEXT        NOT NULL DEFAULT '',
    redirect_type    TEXT        NOT NULL DEFAULT 'permanent'
                         CHECK (redirect_type IN ('permanent','temporary')),
    nofollow         BOOLEAN     NOT NULL DEFAULT TRUE,
    sponsored        BOOLEAN     NOT NULL DEFAULT TRUE,
    geo_rules        JSONB       NOT NULL DEFAULT '{}',
    clicks           INTEGER     NOT NULL DEFAULT 0,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    notes            TEXT        NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cloaked_links_slug      ON cloaked_links (slug);
CREATE INDEX        IF NOT EXISTS idx_cloaked_links_user_id   ON cloaked_links (user_id);
CREATE INDEX        IF NOT EXISTS idx_cloaked_links_is_active ON cloaked_links (is_active);

ALTER TABLE cloaked_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own cloaked links"
        ON cloaked_links FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_cloaked_links_updated_at
        BEFORE UPDATE ON cloaked_links
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. CLOAKED LINK CLICKS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS cloaked_link_clicks (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    link_id     UUID        NOT NULL REFERENCES cloaked_links(id) ON DELETE CASCADE,
    ip_hash     TEXT        NOT NULL DEFAULT '',
    user_agent  TEXT        NOT NULL DEFAULT '',
    referrer    TEXT        NOT NULL DEFAULT '',
    country     TEXT        NOT NULL DEFAULT 'unknown',
    clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clc_link_id    ON cloaked_link_clicks (link_id);
CREATE INDEX IF NOT EXISTS idx_clc_clicked_at ON cloaked_link_clicks (clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_clc_country    ON cloaked_link_clicks (country);

-- Atomic click counter increment — called by redirect handler via service role
CREATE OR REPLACE FUNCTION increment_cloaked_link_clicks(link_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE cloaked_links SET clicks = clicks + 1 WHERE id = link_id;
END;
$$;

-- ── 3. LINK MONITOR ALERTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS link_monitor_alerts (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    link_id          UUID        NOT NULL,
    link_type        TEXT        NOT NULL DEFAULT 'affiliate'
                         CHECK (link_type IN ('affiliate','cloaked')),
    destination_url  TEXT        NOT NULL,
    http_status      INTEGER     NULL,
    error            TEXT        NULL,
    status           TEXT        NOT NULL DEFAULT 'broken'
                         CHECK (status IN ('ok','broken','redirect','timeout')),
    checked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved         BOOLEAN     NOT NULL DEFAULT FALSE,
    resolved_at      TIMESTAMPTZ NULL,
    UNIQUE (user_id, link_id)
);

CREATE INDEX IF NOT EXISTS idx_lma_user_id    ON link_monitor_alerts (user_id, resolved);
CREATE INDEX IF NOT EXISTS idx_lma_checked_at ON link_monitor_alerts (checked_at DESC);

ALTER TABLE link_monitor_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users see own link alerts"
        ON link_monitor_alerts FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. PRODUCTS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
    id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id         UUID          NULL,
    asin            TEXT          NULL,
    title           TEXT          NOT NULL DEFAULT '',
    description     TEXT          NOT NULL DEFAULT '',
    price           NUMERIC(10,2) NULL,
    currency        TEXT          NOT NULL DEFAULT 'USD',
    rating          NUMERIC(3,1)  NULL,
    review_count    INTEGER       NULL,
    image_url       TEXT          NULL,
    product_url     TEXT          NOT NULL DEFAULT '',
    affiliate_url   TEXT          NULL,
    availability    TEXT          NOT NULL DEFAULT 'unknown'
                        CHECK (availability IN ('in_stock','out_of_stock','unknown')),
    features        JSONB         NOT NULL DEFAULT '[]',
    brand           TEXT          NULL,
    category        TEXT          NULL,
    source          TEXT          NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('amazon_api','manual','scraped')),
    fetched_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ASIN unique per user (NULL ASINs excluded from unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_asin ON products (user_id, asin) WHERE asin IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_products_user_id   ON products (user_id);
CREATE INDEX        IF NOT EXISTS idx_products_post_id   ON products (post_id) WHERE post_id IS NOT NULL;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own products"
        ON products FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_products_updated_at
        BEFORE UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. COMPARISON TABLES ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS comparison_tables (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id         UUID        NULL,
    title           TEXT        NOT NULL DEFAULT '',
    keyword         TEXT        NOT NULL DEFAULT '',
    products_json   JSONB       NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ct_user_id ON comparison_tables (user_id);
CREATE INDEX IF NOT EXISTS idx_ct_keyword ON comparison_tables (keyword);

ALTER TABLE comparison_tables ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own comparison tables"
        ON comparison_tables FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. SOCIAL POSTS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_posts (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id           UUID        NULL,
    platform          TEXT        NOT NULL
                          CHECK (platform IN ('pinterest','twitter','linkedin')),
    content           TEXT        NOT NULL DEFAULT '',
    image_url         TEXT        NULL,
    blog_url          TEXT        NULL,
    platform_post_id  TEXT        NULL,
    platform_post_url TEXT        NULL,
    status            TEXT        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('published','scheduled','failed','draft')),
    error             TEXT        NULL,
    scheduled_at      TIMESTAMPTZ NULL,
    published_at      TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sp_user_id    ON social_posts (user_id, platform);
CREATE INDEX IF NOT EXISTS idx_sp_status     ON social_posts (status);
CREATE INDEX IF NOT EXISTS idx_sp_created_at ON social_posts (created_at DESC);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own social posts"
        ON social_posts FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. EMAIL FORMS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_forms (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title        TEXT        NOT NULL DEFAULT '',
    description  TEXT        NOT NULL DEFAULT '',
    button_text  TEXT        NOT NULL DEFAULT 'Get Free Access',
    fields       JSONB       NOT NULL DEFAULT '["email"]',
    style        TEXT        NOT NULL DEFAULT 'inline'
                     CHECK (style IN ('inline','popup','sticky_bar','slide_in')),
    magnet_title TEXT        NOT NULL DEFAULT '',
    embed_code   TEXT        NOT NULL DEFAULT '',
    subscribers  INTEGER     NOT NULL DEFAULT 0,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ef_user_id   ON email_forms (user_id);
CREATE INDEX IF NOT EXISTS idx_ef_is_active ON email_forms (is_active);

ALTER TABLE email_forms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own email forms"
        ON email_forms FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_email_forms_updated_at
        BEFORE UPDATE ON email_forms
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 8. EMAIL SUBSCRIBERS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_subscribers (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    form_id         UUID        NOT NULL REFERENCES email_forms(id) ON DELETE CASCADE,
    email           TEXT        NOT NULL,
    name            TEXT        NULL,
    status          TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','unsubscribed','bounced')),
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    unsubscribed_at TIMESTAMPTZ NULL,
    ip_hash         TEXT        NOT NULL DEFAULT '',
    UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_es_user_id    ON email_subscribers (user_id, status);
CREATE INDEX IF NOT EXISTS idx_es_form_id    ON email_subscribers (form_id);
CREATE INDEX IF NOT EXISTS idx_es_subscribed ON email_subscribers (subscribed_at DESC);

ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own subscribers"
        ON email_subscribers FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-increment subscriber count on new sign-up
CREATE OR REPLACE FUNCTION increment_form_subscribers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE email_forms SET subscribers = subscribers + 1 WHERE id = NEW.form_id;
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_increment_subscribers
        AFTER INSERT ON email_subscribers
        FOR EACH ROW EXECUTE FUNCTION increment_form_subscribers();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 9. TRENDING TOPICS ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS trending_topics (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    niche                TEXT        NOT NULL DEFAULT '',
    source               TEXT        NOT NULL DEFAULT 'ai_predict'
                             CHECK (source IN ('reddit','google_trends','ai_predict','news')),
    title                TEXT        NOT NULL DEFAULT '',
    trend_score          INTEGER     NOT NULL DEFAULT 0 CHECK (trend_score BETWEEN 0 AND 100),
    content_angle        TEXT        NOT NULL DEFAULT '',
    keyword_opportunity  TEXT        NOT NULL DEFAULT '',
    content_type         TEXT        NULL,
    search_intent        TEXT        NULL,
    urgency              TEXT        NULL CHECK (urgency IN ('high','medium','low')),
    reason               TEXT        NULL,
    geo                  TEXT        NOT NULL DEFAULT 'US',
    timeframe            TEXT        NOT NULL DEFAULT 'week'
                             CHECK (timeframe IN ('day','week','month')),
    status               TEXT        NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new','saved','dismissed','used')),
    discovered_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tt_user_id     ON trending_topics (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tt_trend_score ON trending_topics (trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_tt_niche       ON trending_topics (niche);

ALTER TABLE trending_topics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own trending topics"
        ON trending_topics FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 10. OUTREACH PROSPECTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS outreach_prospects (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain           TEXT        NOT NULL,
    contact_name     TEXT        NULL,
    contact_email    TEXT        NULL,
    domain_authority INTEGER     NULL CHECK (domain_authority BETWEEN 0 AND 100),
    niche            TEXT        NULL,
    target_keyword   TEXT        NULL,
    status           TEXT        NOT NULL DEFAULT 'prospect'
                         CHECK (status IN ('prospect','contacted','replied','negotiating','placed','rejected','ghosted')),
    notes            TEXT        NULL,
    response_notes   TEXT        NULL,
    placed_url       TEXT        NULL,
    placed_anchor    TEXT        NULL,
    placed_at        TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_user_id ON outreach_prospects (user_id, status);
CREATE INDEX IF NOT EXISTS idx_op_domain  ON outreach_prospects (domain);
CREATE INDEX IF NOT EXISTS idx_op_placed  ON outreach_prospects (user_id, placed_at DESC)
    WHERE placed_at IS NOT NULL;

ALTER TABLE outreach_prospects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own prospects"
        ON outreach_prospects FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_outreach_updated_at
        BEFORE UPDATE ON outreach_prospects
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 11. REPORTS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id      UUID        NOT NULL,  -- soft ref (site may be deleted)
    report_type  TEXT        NOT NULL DEFAULT 'full_report'
                     CHECK (report_type IN ('seo_performance','affiliate_revenue','content_audit','full_report')),
    client_name  TEXT        NOT NULL DEFAULT '',
    date_from    TIMESTAMPTZ NOT NULL,
    date_to      TIMESTAMPTZ NOT NULL,
    report_data  JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id    ON reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_site_id    ON reports (site_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own reports"
        ON reports FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 12. AD REVENUE ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_revenue (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id     UUID          NULL,  -- soft ref
    network     TEXT          NOT NULL
                    CHECK (network IN ('adsense','mediavine','ezoic','raptive','adthrive','manual')),
    date        DATE          NOT NULL,
    impressions INTEGER       NOT NULL DEFAULT 0,
    clicks      INTEGER       NOT NULL DEFAULT 0,
    rpm         NUMERIC(8,4)  NOT NULL DEFAULT 0,
    epmv        NUMERIC(8,4)  NOT NULL DEFAULT 0,
    revenue     NUMERIC(10,2) NOT NULL DEFAULT 0,
    sessions    INTEGER       NOT NULL DEFAULT 0,
    notes       TEXT          NULL,
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Partial unique index: when site_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_unique_null_site
    ON ad_revenue (user_id, network, date)
    WHERE site_id IS NULL;

-- Partial unique index: when site_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_unique_with_site
    ON ad_revenue (user_id, network, date, site_id)
    WHERE site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ar_user_id ON ad_revenue (user_id, network);
CREATE INDEX IF NOT EXISTS idx_ar_date    ON ad_revenue (date DESC);

ALTER TABLE ad_revenue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own ad revenue"
        ON ad_revenue FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ad_revenue_updated_at
        BEFORE UPDATE ON ad_revenue
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 13. GENERATED IMAGES ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS generated_images (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id     UUID        NULL,
    prompt      TEXT        NOT NULL DEFAULT '',
    title       TEXT        NOT NULL DEFAULT '',
    style       TEXT        NOT NULL DEFAULT 'realistic',
    format      TEXT        NOT NULL DEFAULT 'featured',
    provider    TEXT        NOT NULL DEFAULT 'dall-e-3',
    image_url   TEXT        NOT NULL DEFAULT '',
    size        TEXT        NOT NULL DEFAULT '1792x1024',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gi_user_id    ON generated_images (user_id);
CREATE INDEX IF NOT EXISTS idx_gi_post_id    ON generated_images (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gi_created_at ON generated_images (created_at DESC);

ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users manage own generated images"
        ON generated_images FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── VERIFY ────────────────────────────────────────────────────
-- Quick sanity check — uncomment to confirm all tables created:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN (
--     'cloaked_links','cloaked_link_clicks','link_monitor_alerts',
--     'products','comparison_tables','social_posts',
--     'email_forms','email_subscribers','trending_topics',
--     'outreach_prospects','reports','ad_revenue','generated_images'
--   )
-- ORDER BY tablename;
