-- ============================================================
-- RankMaster Pro — Average order value for affiliate programs
-- Migration: 019_affiliate_avg_order_value.sql
--
-- Revenue attribution for PERCENTAGE-commission programs needs an order
-- value to estimate earnings (revenue = conversions x AOV x rate/100).
-- Without it the attribution funnel was multiplying conversions by the
-- raw percentage, producing meaningless numbers. AOV defaults to 0, in
-- which case percentage revenue is reported as 0 (unknown) rather than
-- a fabricated figure.
-- ============================================================

ALTER TABLE affiliate_programs
    ADD COLUMN IF NOT EXISTS avg_order_value NUMERIC(10,2) NOT NULL DEFAULT 0;
