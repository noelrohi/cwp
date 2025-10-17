# Scripts Directory

Utility and testing scripts for the Framebreak Intelligence system.

## Production Utilities

### Episode & Signal Management
- **`check-episode-processed.ts`** - Verify episode processing status
  ```bash
  pnpm tsx scripts/check-episode-processed.ts <episode-id>
  ```

- **`check-pending-signals.ts`** - Monitor signal processing queue
  ```bash
  pnpm tsx scripts/check-pending-signals.ts
  ```

- **`check-recent-chunks.ts`** - Debug recent transcript chunks
  ```bash
  pnpm tsx scripts/check-recent-chunks.ts
  ```

- **`regenerate-signals.ts`** - Regenerate signals for an episode
  ```bash
  pnpm tsx scripts/regenerate-signals.ts <episode-id>
  ```

### User Management
- **`check-user-stats.ts`** - View user statistics (saves, skips, preferences)
  ```bash
  pnpm tsx scripts/check-user-stats.ts <user-id>
  ```

- **`get-user-id.ts`** - Find user ID by email or other identifier
  ```bash
  pnpm tsx scripts/get-user-id.ts <email>
  ```

### Podcast-Specific
- **`check-doac-episodes.ts`** - Check DOAC (Diary of a CEO) episode status
  ```bash
  pnpm tsx scripts/check-doac-episodes.ts
  ```

## Scoring System Tests

### Current Model Validation (Grok-4-fast)
- **`test-grok-4-fast.ts`** - Test Grok-4-fast variance and consistency
  ```bash
  pnpm tsx scripts/test-grok-4-fast.ts
  ```
  Tests the same signal 5 times to verify low variance (±5%)

- **`test-delta-signals.ts`** - Test on real Delta Airlines signals
  ```bash
  pnpm tsx scripts/test-delta-signals.ts
  ```
  Validates scoring on real production data, shows improvements over old system

- **`test-novelty-enabled.ts`** - Full pipeline test with novelty detection
  ```bash
  pnpm tsx scripts/test-novelty-enabled.ts
  ```
  Tests complete scoring pipeline including novelty detection and diagnostics

## Analysis & Tuning

- **`analyze-usman-patterns.ts`** - Analyze user preference patterns
  ```bash
  pnpm tsx scripts/analyze-usman-patterns.ts
  ```
  Examines save/skip patterns to improve scoring

- **`diagnose-centroid-similarity.ts`** - Debug embedding centroids
  ```bash
  pnpm tsx scripts/diagnose-centroid-similarity.ts
  ```
  Validates embedding-based scoring is working correctly

- **`tune-hybrid-heuristics.ts`** - Tune heuristic filters
  ```bash
  pnpm tsx scripts/tune-hybrid-heuristics.ts
  ```
  Adjust thresholds for heuristic garbage detection

- **`validate-user-embeddings.ts`** - Validate embedding quality
  ```bash
  pnpm tsx scripts/validate-user-embeddings.ts
  ```
  Check that embeddings are generated and stored correctly

## External Integrations

- **`test-readwise-api.ts`** - Test Readwise API integration
  ```bash
  pnpm tsx scripts/test-readwise-api.ts
  ```
  Validate Readwise highlight syncing

## Archived Scripts

See `/scripts/archive/` for obsolete scripts kept for historical reference.

## Common Workflows

### Debug Low-Quality Signals
1. Check recent chunks: `pnpm tsx scripts/check-recent-chunks.ts`
2. Test scoring: `pnpm tsx scripts/test-novelty-enabled.ts`
3. Analyze patterns: `pnpm tsx scripts/analyze-usman-patterns.ts`

### Validate Scoring Changes
1. Test variance: `pnpm tsx scripts/test-grok-4-fast.ts`
2. Test real data: `pnpm tsx scripts/test-delta-signals.ts`
3. Check embeddings: `pnpm tsx scripts/validate-user-embeddings.ts`

### Monitor Production
1. Check processing: `pnpm tsx scripts/check-episode-processed.ts <episode-id>`
2. Check signals: `pnpm tsx scripts/check-pending-signals.ts`
3. Check user stats: `pnpm tsx scripts/check-user-stats.ts <user-id>`
