-- ============================================================
-- Migration 006: New Feature Tables — Round 3
-- Refresh Workflow, Deals, Snippet Optimizations,
-- Link Opportunities, CWV Results, Humanizer Results,
-- Writers, Team Tasks, Proposals, Multilang Content,
-- BSR Tracker, Playground Runs
-- Run AFTER 005_new_features_2.sql
-- All policies wrapped in DO blocks (safe re-run)
-- ============================================================

-- Ensure set_updated_at() function exists (created in 000)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── REFRESH WORKFLOW ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_workflows (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id       UUID        NOT NULL,
    site_id       UUID        NULL,
    post_title    TEXT        NOT NULL DEFAULT '',
    stage         TEXT        NOT NULL DEFAULT 'flagged'
                      CHECK (stage IN ('flagged','planned','in_progress','review','published','measuring')),
    priority      TEXT        NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('critical','high','medium','low')),
    refresh_type  TEXT        NOT NULL DEFAULT 'fix_decay',
    assignee_email TEXT       NULL,
    score_before  NUMERIC(5,2) NOT NULL DEFAULT 0,
    score_after   NUMERIC(5,2) NULL,
    score_lift    NUMERIC(5,2) NULL,
    refresh_plan  JSONB       NULL,
    notes         TEXT        NOT NULL DEFAULT '',
    flagged_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    refreshed_at  TIMESTAMPTZ NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rw_user_id ON refresh_workflows (user_id, stage); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rw_post_id ON refresh_workflows (post_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE refresh_workflows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own workflows" ON refresh_workflows FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_rw_updated BEFORE UPDATE ON refresh_workflows FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── DEALS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deals (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_name   TEXT        NOT NULL,
    affiliate_url  TEXT        NOT NULL DEFAULT '',
    original_url   TEXT        NULL,
    deal_type      TEXT        NOT NULL DEFAULT 'sale',
    discount_value TEXT        NOT NULL DEFAULT '',
    coupon_code    TEXT        NOT NULL DEFAULT '',
    expires_at     TIMESTAMPTZ NULL,
    post_id        UUID        NULL,
    site_id        UUID        NULL,
    program_id     UUID        NULL,
    notes          TEXT        NOT NULL DEFAULT '',
    is_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    is_expired     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_deals_user_id   ON deals (user_id, is_active); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_deals_expires_at ON deals (expires_at) WHERE expires_at IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own deals" ON deals FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_deals_updated BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SNIPPET OPTIMIZATIONS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS snippet_optimizations (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id           UUID        NULL,
    keyword           TEXT        NOT NULL DEFAULT '',
    snippet_type      TEXT        NOT NULL DEFAULT 'paragraph',
    confidence        TEXT        NOT NULL DEFAULT 'medium',
    optimized_content TEXT        NOT NULL DEFAULT '',
    html              TEXT        NOT NULL DEFAULT '',
    word_count        INTEGER     NOT NULL DEFAULT 0,
    reasoning         TEXT        NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_so_user_id ON snippet_optimizations (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE snippet_optimizations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own snippets" ON snippet_optimizations FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── LINK OPPORTUNITIES ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS link_opportunities (
    id                  UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id             UUID         NULL,
    from_post_id        UUID         NOT NULL,
    to_post_id          UUID         NOT NULL,
    anchor_text         TEXT         NOT NULL DEFAULT '',
    insertion_context   TEXT         NOT NULL DEFAULT '',
    relevance           NUMERIC(3,2) NOT NULL DEFAULT 0,
    reason              TEXT         NOT NULL DEFAULT '',
    status              TEXT         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','injected','dismissed')),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lo_user_id     ON link_opportunities (user_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_lo_from_post_id ON link_opportunities (from_post_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE link_opportunities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own link opps" ON link_opportunities FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── CORE WEB VITALS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cwv_results (
    id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id           UUID         NULL,
    post_id           UUID         NULL,
    url               TEXT         NOT NULL,
    strategy          TEXT         NOT NULL DEFAULT 'mobile',
    lcp               INTEGER      NULL,
    lcp_score         NUMERIC(3,2) NULL,
    cls               NUMERIC(5,3) NULL,
    cls_score         NUMERIC(3,2) NULL,
    inp               INTEGER      NULL,
    ttfb              INTEGER      NULL,
    performance_score INTEGER      NOT NULL DEFAULT 0,
    opportunities     JSONB        NOT NULL DEFAULT '[]',
    checked_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cwv_user_id ON cwv_results (user_id, checked_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_cwv_url     ON cwv_results (url); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE cwv_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own CWV results" ON cwv_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── HUMANIZER RESULTS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS humanizer_results (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id             UUID        NULL,
    original_word_count INTEGER     NOT NULL DEFAULT 0,
    humanized_word_count INTEGER    NOT NULL DEFAULT 0,
    ai_score_before     INTEGER     NOT NULL DEFAULT 0,
    ai_score_after      INTEGER     NOT NULL DEFAULT 0,
    changes_count       INTEGER     NOT NULL DEFAULT 0,
    techniques_applied  JSONB       NOT NULL DEFAULT '[]',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE humanizer_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own humanizer results" ON humanizer_results FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── WRITERS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS writers (
    id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name             TEXT         NOT NULL,
    email            TEXT         NOT NULL,
    rate_per_word    NUMERIC(6,4) NOT NULL DEFAULT 0,
    rate_per_post    NUMERIC(8,2) NOT NULL DEFAULT 0,
    specialties      JSONB        NOT NULL DEFAULT '[]',
    posts_completed  INTEGER      NOT NULL DEFAULT 0,
    avg_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_writers_owner_id ON writers (owner_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE writers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Owners manage own writers" ON writers FOR ALL USING (auth.uid() = owner_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── TEAM TASKS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_tasks (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    writer_id         UUID        NULL REFERENCES writers(id) ON DELETE SET NULL,
    post_id           UUID        NULL,
    site_id           UUID        NULL,
    task_type         TEXT        NOT NULL DEFAULT 'write'
                          CHECK (task_type IN ('write','edit','optimize','research','publish')),
    title             TEXT        NOT NULL,
    keyword           TEXT        NOT NULL DEFAULT '',
    deadline          DATE        NULL,
    word_count_target INTEGER     NOT NULL DEFAULT 0,
    word_count_actual INTEGER     NOT NULL DEFAULT 0,
    priority          TEXT        NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('urgent','high','normal','low')),
    status            TEXT        NOT NULL DEFAULT 'assigned'
                          CHECK (status IN ('assigned','in_progress','review','approved','published','rejected')),
    feedback          TEXT        NOT NULL DEFAULT '',
    completed_at      TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tt_owner_id   ON team_tasks (owner_id, status); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tt_writer_id  ON team_tasks (writer_id) WHERE writer_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tt_deadline   ON team_tasks (deadline) WHERE deadline IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE team_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Owners manage own tasks" ON team_tasks FOR ALL USING (auth.uid() = owner_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_team_tasks_updated BEFORE UPDATE ON team_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── PROPOSALS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposals (
    id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name      TEXT          NOT NULL,
    client_website   TEXT          NOT NULL DEFAULT '',
    client_niche     TEXT          NOT NULL DEFAULT '',
    agency_name      TEXT          NOT NULL DEFAULT '',
    monthly_budget   NUMERIC(10,2) NOT NULL DEFAULT 0,
    proposal_data    JSONB         NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_prop_user_id ON proposals (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own proposals" ON proposals FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── MULTILANG CONTENT ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS multilang_content (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_post_id   UUID        NULL,
    site_id          UUID        NULL,
    target_language  TEXT        NOT NULL,
    action_type      TEXT        NOT NULL DEFAULT 'translate',
    title            TEXT        NOT NULL DEFAULT '',
    content          TEXT        NOT NULL DEFAULT '',
    meta_title       TEXT        NOT NULL DEFAULT '',
    meta_description TEXT        NOT NULL DEFAULT '',
    hreflang_tag     TEXT        NOT NULL DEFAULT '',
    slug_suggestion  TEXT        NOT NULL DEFAULT '',
    word_count       INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ml_user_id        ON multilang_content (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ml_source_post_id ON multilang_content (source_post_id) WHERE source_post_id IS NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE multilang_content ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own translations" ON multilang_content FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── BSR TRACKER ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bsr_tracker (
    id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id         UUID          NULL,
    asin            TEXT          NULL,
    product_url     TEXT          NULL,
    affiliate_url   TEXT          NULL,
    label           TEXT          NOT NULL DEFAULT '',
    category        TEXT          NOT NULL DEFAULT '',
    current_bsr     INTEGER       NULL,
    lowest_bsr      INTEGER       NULL,
    highest_bsr     INTEGER       NULL,
    current_price   NUMERIC(10,2) NULL,
    alert_threshold INTEGER       NOT NULL DEFAULT 1000,
    last_checked    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bsr_user_id ON bsr_tracker (user_id); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE bsr_tracker ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own BSR trackers" ON bsr_tracker FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bsr_history (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tracker_id  UUID          NOT NULL REFERENCES bsr_tracker(id) ON DELETE CASCADE,
    bsr         INTEGER       NULL,
    price       NUMERIC(10,2) NULL,
    checked_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bsr_h_tracker_id ON bsr_history (tracker_id, checked_at DESC); EXCEPTION WHEN undefined_column THEN NULL; END $$;
ALTER TABLE bsr_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own BSR history" ON bsr_history FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;

-- ── PLAYGROUND RUNS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playground_runs (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt           TEXT        NOT NULL DEFAULT '',
    task             TEXT        NOT NULL DEFAULT 'content_writing',
    providers_tested JSONB       NOT NULL DEFAULT '[]',
    success_count    INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE playground_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users own playground runs" ON playground_runs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
