-- ============================================================
-- Migration 000: Base Schema — RankMaster Pro
-- ⚠️  EXISTING DATABASE: Run 004_new_features.sql ONLY.
--     This file is for FRESH INSTALLS where no tables exist.
--     If your app is already running, skip this file entirely.
-- ============================================================
-- If you must run this on an existing DB, every CREATE INDEX
-- is wrapped in DO blocks so unknown columns won't abort.
-- ============================================================

-- ── SETTINGS (global, no user_id — accessed via service role) ─

CREATE TABLE IF NOT EXISTS settings (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    category    TEXT        NOT NULL DEFAULT 'general',
    key         TEXT        NOT NULL,
    value       TEXT        NOT NULL DEFAULT '',
    label       TEXT        NOT NULL DEFAULT '',
    is_secret   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (key)
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_settings_category ON settings (category);
EXCEPTION WHEN undefined_column OR duplicate_table THEN NULL; END $$;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Authenticated users manage settings"
        ON settings FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SITES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sites (
    id                     UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name                   TEXT         NOT NULL,
    url                    TEXT         NOT NULL,
    username               TEXT         NOT NULL DEFAULT '',
    app_password_encrypted TEXT         NOT NULL DEFAULT '',
    niche                  TEXT         NOT NULL DEFAULT '',
    post_count             INTEGER      NOT NULL DEFAULT 0,
    avg_seo_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
    last_synced_at         TIMESTAMPTZ  NULL,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites (user_id);
EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own sites" ON sites FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── TOPIC CLUSTERS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS topic_clusters (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID         NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    pillar_topic    TEXT         NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    authority_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tc_site_id ON topic_clusters (site_id);
EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tc_user_id ON topic_clusters (user_id);
EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE topic_clusters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own clusters" ON topic_clusters FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── KEYWORDS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS keywords (
    id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id        UUID         NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    cluster_id     UUID         NULL REFERENCES topic_clusters(id) ON DELETE SET NULL,
    keyword        TEXT         NOT NULL,
    search_volume  INTEGER      NOT NULL DEFAULT 0,
    difficulty     INTEGER      NOT NULL DEFAULT 0 CHECK (difficulty BETWEEN 0 AND 100),
    cpc            NUMERIC(8,2) NOT NULL DEFAULT 0,
    intent_type    TEXT         NOT NULL DEFAULT 'informational'
                       CHECK (intent_type IN ('informational','commercial','transactional','navigational')),
    serp_features  JSONB        NOT NULL DEFAULT '[]',
    priority_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    status         TEXT         NOT NULL DEFAULT 'discovered'
                       CHECK (status IN ('discovered','researched','targeted','ranking','archived')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_keywords_site_id    ON keywords (site_id);              EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_keywords_user_id    ON keywords (user_id);              EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_keywords_status     ON keywords (site_id, status);      EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_keywords_priority   ON keywords (priority_score DESC);  EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_keywords_cluster_id ON keywords (cluster_id) WHERE cluster_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own keywords" ON keywords FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── POSTS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS posts (
    id                 UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id            UUID         NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    wp_post_id         INTEGER      NULL,
    cluster_id         UUID         NULL REFERENCES topic_clusters(id) ON DELETE SET NULL,
    keyword_id         UUID         NULL REFERENCES keywords(id) ON DELETE SET NULL,
    title              TEXT         NOT NULL DEFAULT '',
    slug               TEXT         NOT NULL DEFAULT '',
    content_html       TEXT         NOT NULL DEFAULT '',
    content_markdown   TEXT         NOT NULL DEFAULT '',
    status             TEXT         NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','review','optimized','published','scheduled')),
    seo_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
    aeo_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
    eeat_score         NUMERIC(5,2) NOT NULL DEFAULT 0,
    readability_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
    snippet_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
    overall_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
    meta_title         TEXT         NOT NULL DEFAULT '',
    meta_description   TEXT         NOT NULL DEFAULT '',
    schema_markup_json JSONB        NOT NULL DEFAULT '{}',
    published_at       TIMESTAMPTZ  NULL,
    last_optimized_at  TIMESTAMPTZ  NULL,
    decay_alert        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_posts_site_id    ON posts (site_id);                         EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_posts_user_id    ON posts (user_id);                         EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts (site_id, status);                 EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_posts_decay      ON posts (decay_alert) WHERE decay_alert = TRUE; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_posts_keyword_id ON posts (keyword_id) WHERE keyword_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own posts" ON posts FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CONTENT RECORDS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_records (
    id                     UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id                UUID         NULL REFERENCES sites(id) ON DELETE SET NULL,
    post_id                UUID         NULL REFERENCES posts(id) ON DELETE SET NULL,
    keyword                TEXT         NOT NULL,
    title                  TEXT         NOT NULL DEFAULT '',
    slug                   TEXT         NOT NULL DEFAULT '',
    content_type           TEXT         NOT NULL DEFAULT 'article'
                               CHECK (content_type IN ('article','cluster','optimized')),
    language               TEXT         NOT NULL DEFAULT 'en',
    ai_provider            TEXT         NOT NULL DEFAULT '',
    ai_model               TEXT         NOT NULL DEFAULT '',
    word_count_target      INTEGER      NOT NULL DEFAULT 0,
    word_count_actual      INTEGER      NOT NULL DEFAULT 0,
    competitor_count       INTEGER      NOT NULL DEFAULT 0,
    section_count          INTEGER      NOT NULL DEFAULT 0,
    internal_link_count    INTEGER      NOT NULL DEFAULT 0,
    external_link_count    INTEGER      NOT NULL DEFAULT 0,
    generation_duration_ms INTEGER      NOT NULL DEFAULT 0,
    overall_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
    seo_score              NUMERIC(5,2) NOT NULL DEFAULT 0,
    aeo_score              NUMERIC(5,2) NOT NULL DEFAULT 0,
    eeat_score             NUMERIC(5,2) NOT NULL DEFAULT 0,
    readability_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
    naturalness_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
    outline_data           JSONB        NOT NULL DEFAULT '{}',
    blueprint_data         JSONB        NOT NULL DEFAULT '{}',
    score_details          JSONB        NOT NULL DEFAULT '{}',
    meta_title             TEXT         NOT NULL DEFAULT '',
    meta_description       TEXT         NOT NULL DEFAULT '',
    site_name              TEXT         NOT NULL DEFAULT '',
    site_url               TEXT         NOT NULL DEFAULT '',
    publish_status         TEXT         NOT NULL DEFAULT 'generated'
                               CHECK (publish_status IN ('generated','queued','draft','published')),
    published_at           TIMESTAMPTZ  NULL,
    wp_post_id             INTEGER      NULL,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cr_user_id    ON content_records (user_id);              EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cr_site_id    ON content_records (site_id) WHERE site_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cr_created_at ON content_records (created_at DESC);      EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE content_records ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own content records" ON content_records FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── BACKLINKS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS backlinks (
    id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID         NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    source_url       TEXT         NOT NULL DEFAULT '',
    target_url       TEXT         NOT NULL DEFAULT '',
    anchor_text      TEXT         NOT NULL DEFAULT '',
    domain_authority INTEGER      NULL CHECK (domain_authority BETWEEN 0 AND 100),
    page_authority   INTEGER      NULL CHECK (page_authority BETWEEN 0 AND 100),
    link_type        TEXT         NOT NULL DEFAULT 'dofollow'
                         CHECK (link_type IN ('dofollow','nofollow','ugc','sponsored')),
    status           TEXT         NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','lost','disavowed')),
    first_seen       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_checked     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bl_site_id ON backlinks (site_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bl_user_id ON backlinks (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bl_status  ON backlinks (site_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE backlinks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own backlinks" ON backlinks FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── INTERNAL LINKS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS internal_links (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID         NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    from_post_id    UUID         NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    to_post_id      UUID         NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    anchor_text     TEXT         NOT NULL DEFAULT '',
    relevance_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_il_site_id      ON internal_links (site_id);      EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_il_from_post_id ON internal_links (from_post_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_il_to_post_id   ON internal_links (to_post_id);   EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE internal_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own internal links" ON internal_links FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── RANK HISTORY ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rank_history (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    keyword_id  UUID        NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    post_id     UUID        NULL REFERENCES posts(id) ON DELETE SET NULL,
    position    INTEGER     NOT NULL,
    url         TEXT        NOT NULL DEFAULT '',
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rh_keyword_id ON rank_history (keyword_id, checked_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rh_site_id    ON rank_history (site_id, checked_at DESC);    EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE rank_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see own rank history" ON rank_history FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── SERP CACHE (shared, no RLS — service role only) ───────────

CREATE TABLE IF NOT EXISTS serp_cache (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    keyword      TEXT        NOT NULL,
    results_json JSONB       NOT NULL DEFAULT '[]',
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    UNIQUE (keyword)
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sc_keyword    ON serp_cache (keyword);     EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sc_expires_at ON serp_cache (expires_at);  EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- ── AUTHORS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS authors (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    slug            TEXT        NOT NULL DEFAULT '',
    bio             TEXT        NOT NULL DEFAULT '',
    credentials     TEXT        NOT NULL DEFAULT '',
    headshot_url    TEXT        NOT NULL DEFAULT '',
    social_twitter  TEXT        NOT NULL DEFAULT '',
    social_linkedin TEXT        NOT NULL DEFAULT '',
    website_url     TEXT        NOT NULL DEFAULT '',
    expertise_areas JSONB       NOT NULL DEFAULT '[]',
    is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_authors_site_id ON authors (site_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_authors_user_id ON authors (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own authors" ON authors FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── A/B TESTS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ab_tests (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    post_id         UUID        NULL REFERENCES posts(id) ON DELETE CASCADE,
    test_name       TEXT        NOT NULL DEFAULT '',
    test_type       TEXT        NOT NULL DEFAULT 'title'
                        CHECK (test_type IN ('title','meta','content')),
    variants        JSONB       NOT NULL DEFAULT '[]',
    status          TEXT        NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','paused','completed')),
    winner_id       TEXT        NULL,
    min_impressions INTEGER     NOT NULL DEFAULT 500,
    auto_optimize   BOOLEAN     NOT NULL DEFAULT TRUE,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_abt_site_id ON ab_tests (site_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_abt_user_id ON ab_tests (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_abt_status  ON ab_tests (status);  EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own ab tests" ON ab_tests FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── AFFILIATE PROGRAMS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_programs (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT         NOT NULL,
    network         TEXT         NOT NULL DEFAULT 'direct',
    commission_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
    commission_type TEXT         NOT NULL DEFAULT 'percentage'
                        CHECK (commission_type IN ('percentage','flat')),
    cookie_duration INTEGER      NOT NULL DEFAULT 30,
    signup_url      TEXT         NOT NULL DEFAULT '',
    notes           TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ap_user_id ON affiliate_programs (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE affiliate_programs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own affiliate programs" ON affiliate_programs FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── AFFILIATE LINKS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_links (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_id    UUID        NOT NULL REFERENCES affiliate_programs(id) ON DELETE CASCADE,
    site_id       UUID        NULL REFERENCES sites(id) ON DELETE SET NULL,
    post_id       UUID        NULL REFERENCES posts(id) ON DELETE SET NULL,
    original_url  TEXT        NOT NULL DEFAULT '',
    affiliate_url TEXT        NOT NULL DEFAULT '',
    anchor_text   TEXT        NOT NULL DEFAULT '',
    utm_source    TEXT        NOT NULL DEFAULT 'rankmaster',
    utm_medium    TEXT        NOT NULL DEFAULT 'affiliate',
    utm_campaign  TEXT        NOT NULL DEFAULT '',
    page_type     TEXT        NOT NULL DEFAULT 'info'
                      CHECK (page_type IN ('money','info','review','comparison')),
    status        TEXT        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','broken')),
    clicks        INTEGER     NOT NULL DEFAULT 0,
    conversions   INTEGER     NOT NULL DEFAULT 0,
    last_clicked  TIMESTAMPTZ NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_al_user_id ON affiliate_links (user_id);                         EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_al_program  ON affiliate_links (program_id);                     EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_al_post_id  ON affiliate_links (post_id) WHERE post_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_al_status   ON affiliate_links (status);                         EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own affiliate links" ON affiliate_links FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── AFFILIATE REVENUE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_revenue (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_id  UUID          NOT NULL REFERENCES affiliate_programs(id) ON DELETE CASCADE,
    month       DATE          NOT NULL,
    amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    clicks      INTEGER       NOT NULL DEFAULT 0,
    conversions INTEGER       NOT NULL DEFAULT 0,
    notes       TEXT          NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (program_id, month)
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_arev_user_id ON affiliate_revenue (user_id, month DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_arev_program ON affiliate_revenue (program_id);          EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE affiliate_revenue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own affiliate revenue" ON affiliate_revenue FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── PUBLISH QUEUE ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS queue (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id      UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    post_id      UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'ready'
                     CHECK (status IN ('ready','review','published','failed')),
    scheduled_at TIMESTAMPTZ NULL,
    published_at TIMESTAMPTZ NULL,
    error        TEXT        NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_queue_user_id ON queue (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_queue_site_id ON queue (site_id);         EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own queue" ON queue FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CONTENT VERSIONS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS versions (
    id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id          UUID         NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    version_number   INTEGER      NOT NULL DEFAULT 1,
    title            TEXT         NOT NULL DEFAULT '',
    content_html     TEXT         NOT NULL DEFAULT '',
    content_markdown TEXT         NOT NULL DEFAULT '',
    overall_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
    change_summary   TEXT         NOT NULL DEFAULT '',
    created_by       TEXT         NOT NULL DEFAULT 'ai',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ver_post_id ON versions (post_id, version_number DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ver_user_id ON versions (user_id);                      EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own versions" ON versions FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── API USAGE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_usage (
    id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider      TEXT          NOT NULL,
    model         TEXT          NOT NULL DEFAULT '',
    task          TEXT          NOT NULL DEFAULT '',
    input_tokens  INTEGER       NOT NULL DEFAULT 0,
    output_tokens INTEGER       NOT NULL DEFAULT 0,
    cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
    session_id    TEXT          NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_au_user_id  ON api_usage (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_au_provider ON api_usage (provider);                 EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users see own api usage" ON api_usage FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── PUBLISHING SCHEDULES ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS publishing_schedules (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    publish_at  TIMESTAMPTZ NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','published','failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ps_site_id    ON publishing_schedules (site_id);    EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ps_publish_at ON publishing_schedules (publish_at); EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE publishing_schedules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own schedules" ON publishing_schedules FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── COMPETITORS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS competitors (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    domain          TEXT        NOT NULL,
    da              INTEGER     NULL,
    monthly_traffic INTEGER     NULL,
    notes           TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_comp_site_id ON competitors (site_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_comp_user_id ON competitors (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own competitors" ON competitors FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CONTENT TASKS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_tasks (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id       UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    task_type     TEXT        NOT NULL
                      CHECK (task_type IN ('optimize','create','refresh','link_build')),
    keyword_id    UUID        NULL REFERENCES keywords(id) ON DELETE SET NULL,
    status        TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','completed','failed')),
    priority      INTEGER     NOT NULL DEFAULT 5,
    scheduled_for TIMESTAMPTZ NULL,
    completed_at  TIMESTAMPTZ NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ctask_site_id ON content_tasks (site_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ctask_user_id ON content_tasks (user_id);         EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE content_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own tasks" ON content_tasks FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── WEBHOOKS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhooks (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL DEFAULT '',
    url         TEXT        NOT NULL,
    events      JSONB       NOT NULL DEFAULT '[]',
    secret      TEXT        NOT NULL DEFAULT '',
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    last_fired  TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_wh_user_id ON webhooks (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users manage own webhooks" ON webhooks FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── TEAM MEMBERS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id     UUID        NULL  REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT        NOT NULL,
    role        TEXT        NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin','editor','viewer')),
    status      TEXT        NOT NULL DEFAULT 'invited'
                    CHECK (status IN ('invited','active','disabled')),
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ NULL
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tm_owner_id ON team_members (owner_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tm_user_id  ON team_members (user_id) WHERE user_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Owners manage own team" ON team_members FOR ALL USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN CREATE TRIGGER trg_settings_updated_at    BEFORE UPDATE ON settings        FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sites_updated_at       BEFORE UPDATE ON sites           FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_keywords_updated_at    BEFORE UPDATE ON keywords        FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_posts_updated_at       BEFORE UPDATE ON posts           FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_tc_updated_at          BEFORE UPDATE ON topic_clusters  FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_cr_updated_at          BEFORE UPDATE ON content_records FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
