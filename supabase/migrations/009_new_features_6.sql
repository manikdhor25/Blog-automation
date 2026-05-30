-- ============================================================
-- Migration 009: New Feature Tables — Round 6
-- Auto-Blogger, Click Tracker, Topical Authority, Keyword Alerts,
-- Monetization Scores, Content Grades, Competitor Spy,
-- Niche Research, CRO Analyses, Notifications,
-- Press Releases, Keyword Clusters, FAQ Results, Bulk Op Logs
-- Run AFTER 008_new_features_5.sql
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── AUTO-BLOGGER SCHEDULES ───────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_blog_schedules (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID        NOT NULL,
    niche            TEXT        NOT NULL DEFAULT '',
    frequency        TEXT        NOT NULL DEFAULT 'weekly'
                         CHECK (frequency IN ('daily','every_2_days','twice_weekly','weekly')),
    post_type        TEXT        NOT NULL DEFAULT 'mixed',
    word_count       INTEGER     NOT NULL DEFAULT 1500,
    keywords         JSONB       NOT NULL DEFAULT '[]',
    auto_publish     BOOLEAN     NOT NULL DEFAULT FALSE,
    publish_status   TEXT        NOT NULL DEFAULT 'draft',
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    next_run         TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
    last_run         TIMESTAMPTZ NULL,
    posts_generated  INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_abs_user_id ON auto_blog_schedules (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE auto_blog_schedules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own schedules" ON auto_blog_schedules FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_abs_updated BEFORE UPDATE ON auto_blog_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── AUTO-BLOGGER RUNS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_blog_runs (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id          UUID        NOT NULL,
    schedule_id      UUID        NULL REFERENCES auto_blog_schedules(id) ON DELETE SET NULL,
    keyword          TEXT        NOT NULL DEFAULT '',
    title            TEXT        NOT NULL DEFAULT '',
    slug             TEXT        NOT NULL DEFAULT '',
    word_count       INTEGER     NOT NULL DEFAULT 0,
    content_preview  TEXT        NOT NULL DEFAULT '',
    status           TEXT        NOT NULL DEFAULT 'generated'
                         CHECK (status IN ('generated','publishing','published','failed')),
    provider         TEXT        NOT NULL DEFAULT '',
    wp_post_id       INTEGER     NULL,
    post_data        JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_abr_user_id ON auto_blog_runs (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE auto_blog_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own blog runs" ON auto_blog_runs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── TRACKED LINKS (Click Tracker) ────────────────────────────

CREATE TABLE IF NOT EXISTS tracked_links (
    id                  UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tracking_id         TEXT          NOT NULL UNIQUE,
    destination_url     TEXT          NOT NULL DEFAULT '',
    label               TEXT          NOT NULL DEFAULT '',
    affiliate_program   TEXT          NULL,
    post_id             UUID          NULL,
    site_id             UUID          NULL,
    expected_commission NUMERIC(8,2)  NULL,
    total_clicks        INTEGER       NOT NULL DEFAULT 0,
    unique_clicks       INTEGER       NOT NULL DEFAULT 0,
    conversions         INTEGER       NOT NULL DEFAULT 0,
    total_revenue       NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tl_user_id ON tracked_links (user_id, total_clicks DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tl_tracking_id ON tracked_links (tracking_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE tracked_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own tracked links" ON tracked_links FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── LINK CLICKS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS link_clicks (
    id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    link_id           UUID          NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
    tracking_id       TEXT          NOT NULL DEFAULT '',
    referrer          TEXT          NULL,
    user_agent        TEXT          NULL,
    ip_hash           TEXT          NULL,
    converted         BOOLEAN       NOT NULL DEFAULT FALSE,
    commission_amount NUMERIC(10,2) NULL,
    order_id          TEXT          NULL,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lc_user_id ON link_clicks (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lc_link_id ON link_clicks (link_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own link clicks" ON link_clicks FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── TOPICAL AUTHORITY SCORES ─────────────────────────────────

CREATE TABLE IF NOT EXISTS topical_authority_scores (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID        NULL,
    niche             TEXT        NOT NULL DEFAULT '',
    overall_score     INTEGER     NOT NULL DEFAULT 0,
    grade             TEXT        NOT NULL DEFAULT 'C',
    topic_count       INTEGER     NOT NULL DEFAULT 0,
    gaps_count        INTEGER     NOT NULL DEFAULT 0,
    quick_wins_count  INTEGER     NOT NULL DEFAULT 0,
    score_data        JSONB       NOT NULL DEFAULT '{}',
    analyzed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tas_user_id ON topical_authority_scores (user_id, analyzed_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE topical_authority_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own authority scores" ON topical_authority_scores FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── KEYWORD ALERTS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS keyword_alerts (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id             UUID        NULL,
    keyword             TEXT        NOT NULL DEFAULT '',
    alert_type          TEXT        NOT NULL DEFAULT 'enters_top_10',
    threshold_position  INTEGER     NULL,
    change_threshold    INTEGER     NULL,
    notify_email        BOOLEAN     NOT NULL DEFAULT TRUE,
    notify_webhook      BOOLEAN     NOT NULL DEFAULT FALSE,
    webhook_url         TEXT        NULL,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    trigger_count       INTEGER     NOT NULL DEFAULT 0,
    last_triggered      TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ka_user_id ON keyword_alerts (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ka_keyword ON keyword_alerts (keyword); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE keyword_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own keyword alerts" ON keyword_alerts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── KEYWORD ALERT HISTORY ────────────────────────────────────

CREATE TABLE IF NOT EXISTS keyword_alert_history (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_id          UUID        NOT NULL REFERENCES keyword_alerts(id) ON DELETE CASCADE,
    keyword           TEXT        NOT NULL DEFAULT '',
    previous_position INTEGER     NULL,
    current_position  INTEGER     NOT NULL,
    message           TEXT        NOT NULL DEFAULT '',
    triggered_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_kah_user_id ON keyword_alert_history (user_id, triggered_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE keyword_alert_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own alert history" ON keyword_alert_history FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── MONETIZATION SCORES ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS monetization_scores (
    id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id           UUID          NULL,
    site_id           UUID          NULL,
    title             TEXT          NOT NULL DEFAULT '',
    score             INTEGER       NOT NULL DEFAULT 0,
    grade             TEXT          NOT NULL DEFAULT 'C',
    revenue_potential NUMERIC(10,2) NOT NULL DEFAULT 0,
    quick_wins_count  INTEGER       NOT NULL DEFAULT 0,
    score_data        JSONB         NOT NULL DEFAULT '{}',
    scored_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ms_user_id ON monetization_scores (user_id, score DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_ms_post_unique ON monetization_scores (user_id, post_id) WHERE post_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE monetization_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own monetization scores" ON monetization_scores FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CONTENT GRADES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_grades (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id       UUID        NULL,
    title         TEXT        NOT NULL DEFAULT '',
    overall_score INTEGER     NOT NULL DEFAULT 0,
    overall_grade TEXT        NOT NULL DEFAULT 'C',
    dimensions    JSONB       NOT NULL DEFAULT '{}',
    priorities    JSONB       NOT NULL DEFAULT '[]',
    grade_data    JSONB       NOT NULL DEFAULT '{}',
    graded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cg_user_id ON content_grades (user_id, overall_score DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_cg_post_unique ON content_grades (user_id, post_id) WHERE post_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE content_grades ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own content grades" ON content_grades FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── COMPETITOR SPY RESULTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS competitor_spy_results (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    competitor_url      TEXT        NOT NULL DEFAULT '',
    domain              TEXT        NOT NULL DEFAULT '',
    estimated_traffic   INTEGER     NOT NULL DEFAULT 0,
    estimated_da        INTEGER     NOT NULL DEFAULT 0,
    keywords_found      INTEGER     NOT NULL DEFAULT 0,
    result_data         JSONB       NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_csr_user_id ON competitor_spy_results (user_id, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE competitor_spy_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own spy results" ON competitor_spy_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── NICHE RESEARCH RESULTS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS niche_research_results (
    id                TEXT        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seed_niche        TEXT        NULL,
    budget            TEXT        NOT NULL DEFAULT 'moderate',
    time_commitment   TEXT        NOT NULL DEFAULT 'part_time',
    niches_count      INTEGER     NOT NULL DEFAULT 0,
    result_data       JSONB       NOT NULL DEFAULT '[]',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE niche_research_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE niche_research_results ALTER COLUMN id TYPE UUID USING id::UUID; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users own niche results" ON niche_research_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CRO ANALYSES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_analyses (
    id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id           UUID         NULL,
    cro_score         INTEGER      NOT NULL DEFAULT 0,
    current_ctr       NUMERIC(5,2) NULL,
    optimized_ctr     NUMERIC(5,2) NULL,
    quick_wins_count  INTEGER      NOT NULL DEFAULT 0,
    result_data       JSONB        NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE cro_analyses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own cro analyses" ON cro_analyses FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── NOTIFICATIONS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL DEFAULT 'system',
    title       TEXT        NOT NULL DEFAULT '',
    message     TEXT        NOT NULL DEFAULT '',
    link        TEXT        NULL,
    priority    TEXT        NOT NULL DEFAULT 'medium',
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_notif_user_id ON notifications (user_id, is_read, created_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own notifications" ON notifications FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── PRESS RELEASES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS press_releases (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    headline     TEXT        NOT NULL DEFAULT '',
    company_name TEXT        NOT NULL DEFAULT '',
    news_angle   TEXT        NOT NULL DEFAULT '',
    word_count   INTEGER     NOT NULL DEFAULT 0,
    status       TEXT        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','published')),
    result_data  JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE press_releases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own press releases" ON press_releases FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── KEYWORD CLUSTER RESULTS ──────────────────────────────────

CREATE TABLE IF NOT EXISTS keyword_cluster_results (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    input_count    INTEGER     NOT NULL DEFAULT 0,
    cluster_count  INTEGER     NOT NULL DEFAULT 0,
    niche          TEXT        NULL,
    result_data    JSONB       NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE keyword_cluster_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own cluster results" ON keyword_cluster_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── FAQ RESULTS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faq_results (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id     UUID        NULL,
    keyword     TEXT        NOT NULL DEFAULT '',
    faq_count   INTEGER     NOT NULL DEFAULT 0,
    result_data JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE faq_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own faq results" ON faq_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── BULK OP LOGS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bulk_op_logs (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation         TEXT        NOT NULL DEFAULT '',
    items_processed   INTEGER     NOT NULL DEFAULT 0,
    items_succeeded   INTEGER     NOT NULL DEFAULT 0,
    details           JSONB       NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bulk_op_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own bulk logs" ON bulk_op_logs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
