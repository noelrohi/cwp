-- Migration: Remove signals, embeddings, and related tables
-- Run this AFTER deploying the code changes from PR #6
--
-- Expected savings: ~330+ MB
--   - transcript_chunk.embedding column + HNSW index: ~300 MB
--   - daily_signal table: ~8 MB
--   - Other signal tables: ~1 MB
--
-- IMPORTANT: Run during low-traffic period as VACUUM FULL locks tables

-- ============================================
-- STEP 1: Drop signal-related tables
-- ============================================

-- Drop in order respecting foreign key dependencies
DROP TABLE IF EXISTS meta_signal_like CASCADE;
DROP TABLE IF EXISTS meta_signal CASCADE;
DROP TABLE IF EXISTS flashcard CASCADE;
DROP TABLE IF EXISTS saved_chunk CASCADE;
DROP TABLE IF EXISTS daily_signal CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;

-- ============================================
-- STEP 2: Drop embedding column from transcript_chunk
-- ============================================

-- This removes the vector(1536) column and its HNSW index
ALTER TABLE transcript_chunk DROP COLUMN IF EXISTS embedding;

-- ============================================
-- STEP 3: Drop signals_generated_at columns if they exist
-- ============================================

ALTER TABLE episode DROP COLUMN IF EXISTS signals_generated_at;
ALTER TABLE article DROP COLUMN IF EXISTS signals_generated_at;

-- ============================================
-- STEP 4: Reclaim disk space
-- ============================================

-- VACUUM FULL rewrites tables and reclaims space
-- WARNING: This locks tables - run during maintenance window
VACUUM FULL transcript_chunk;
VACUUM FULL episode;
VACUUM FULL article;

-- Regular VACUUM ANALYZE to update statistics
VACUUM ANALYZE;

-- ============================================
-- STEP 5: Verify cleanup
-- ============================================

-- Check remaining tables (should not include signal tables)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check transcript_chunk columns (should not include embedding)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'transcript_chunk'
ORDER BY ordinal_position;

-- Check new database size
SELECT pg_size_pretty(pg_database_size(current_database())) as total_size;

-- Check table sizes
SELECT
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
