-- ============================================================
-- RankMaster Pro — RLS for cloaked_link_clicks
-- Migration: 020_cloaked_link_clicks_rls.sql
--
-- This was the only table without RLS. With RLS disabled it is readable
-- by anyone holding the anon key, and the link-cloak `clicks` view fetched
-- rows by link_id with no ownership check (IDOR). Scope reads to the owner
-- of the parent cloaked link. Inserts come from /go/[slug] via the
-- service-role client, which bypasses RLS, so click recording is unaffected.
-- ============================================================

ALTER TABLE cloaked_link_clicks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Users read own cloaked link clicks"
        ON cloaked_link_clicks FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM cloaked_links cl
            WHERE cl.id = cloaked_link_clicks.link_id
              AND cl.user_id = auth.uid()
        ));
EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;
