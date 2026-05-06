-- Prompt Wars Initial Migration
-- Phase 0: Migration chain initialization
-- This migration establishes the migration timeline for the Prompt Wars backend.
-- Feature schema will be added in subsequent migrations during Phase 1+.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Phase 0 complete. Next migrations will add:
-- - Core gameplay tables (profiles, characters, battles, prompts)
-- - Video pipeline tables (video_jobs, videos)
-- - Economy tables (wallet_transactions, purchases, subscriptions, entitlements view)
-- - Judge tables (judge_runs, appeals, judge_calibration_sets)
-- - Social tables (rivals, reports, moderation_events)
-- - Rankings tables (rankings, seasons)
-- - RLS policies for all user-facing tables
-- - Indexes for common queries (active battles, player history, rankings)
-- - Database functions for server-owned state transitions
