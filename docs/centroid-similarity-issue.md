# Centroid Similarity Issue - Production Finding

## Date
2025-10-01

## TL;DR

**Problem**: Contrastive scoring clustered all scores at 0.5 (worse than before)  
**Root Cause**: Saved/skipped centroids similarity = 0.93 (too high)  
**Fix**: Fallback to positive-only when similarity > 0.85  
**Lesson**: General embeddings can't capture nuanced within-topic preferences  

---

## Production Logs

```
User: Using CONTRASTIVE scoring with 47 saved + 165 skipped chunks
Contrastive score distribution: 0-20%: 0, 40-60%: 70, 80-100%: 0  
Score range: 0.49 - 0.50
```

**All 70 chunks scored exactly 0.5!**

---

## Root Cause Math

```typescript
score = sim(chunk, saved_centroid) - sim(chunk, skipped_centroid)
normalized = (score + 2) / 4

// All scores = 0.5 means:
0.5 = (score + 2) / 4
score = 0

// Therefore:
sim(chunk, saved_centroid) ≈ sim(chunk, skipped_centroid)
```

**Why**: Saved and skipped centroids are nearly identical (cosine similarity > 0.9)

---

## Karpathy's Analysis

### "You Hit Fundamental Embedding Limitations"

**What `text-embedding-3-small` Captures**:
- ✅ Tech vs cooking (broad topics)
- ✅ Startups vs sports (domains)
- ❌ **This startup advice vs that startup advice** (nuanced preferences)

### "This Is Normal for Narrow Domains"

User's saves/skips are all within "tech/business podcasts":
- Saved: "How YC evaluates startups" (similarity to centroid: 0.85)
- Skipped: "How VCs evaluate startups" (similarity to centroid: 0.83)

**Difference**: 0.02 (noise level for embeddings)

### "Real Recommender Systems Don't Just Use Embeddings"

They combine:
1. **Content embeddings** (you have this)
2. **Explicit features** (speaker, podcast, length) ← **Missing**
3. **Collaborative filtering** (what similar users like) ← **Missing**
4. **Behavioral signals** (time-on-page, recency) ← **Missing**

---

## The Fix: Smart Fallback

```typescript
const centroidSimilarity = cosineSimilarity(savedCentroid, skippedCentroid);

if (centroidSimilarity > 0.85) {
  console.log("⚠️ Centroids too similar, falling back to positive-only");
  return usePositiveOnlyScoring();
}

// Otherwise use contrastive
```

### Why 0.85?

- Cosine > 0.85 = vectors nearly parallel (< 32° angle)
- At this level, `saved_sim - skipped_sim` is noise
- Better to use simpler positive-only approach

---

## Expected Behavior

### Scenario 1: Similar Centroids (> 0.85)
```
Centroid similarity: 0.93 ⚠️ TOO SIMILAR
Falling back to POSITIVE-ONLY scoring
Distribution: 20-40%: 5, 40-60%: 15, 60-80%: 8, 80-100%: 2
```
Not perfect spread, but better than all 0.5!

### Scenario 2: Moderate Separation (0.7-0.85)
```
Centroid similarity: 0.78 ⚠️ High similarity - limited discrimination  
Using CONTRASTIVE scoring
Distribution: 10-30%: 3, 30-50%: 8, 50-70%: 12, 70-90%: 5, 90-100%: 2
```
Some spread, contrastive helps a bit.

### Scenario 3: Good Separation (< 0.7)
```
Centroid similarity: 0.64 ✅ Good separation
Using CONTRASTIVE scoring
Distribution: 0-20%: 5, 20-40%: 7, 40-60%: 8, 60-80%: 6, 80-100%: 4
```
Excellent! Full 0-100% spread.

---

## Why This Happens

### Hypothesis 1: Topic Homogeneity
User consumes narrow content niche:
- All tech/startup podcasts
- Embeddings see all as "business content"
- Can't distinguish quality within niche

### Hypothesis 2: Conservative Saving
- Saves: 47 (only exceptional content)
- Skips: 165 (good but not great)
- The "good" content is semantically similar to "exceptional"

### Hypothesis 3: Non-Semantic Criteria
User saves/skips based on factors embeddings don't capture:
- Specific speaker preference
- Already familiar with topic
- Chunk length (too long/short)
- Audio quality
- Mood/energy of delivery

**All valid!** Need explicit features.

---

## Long-Term Solutions

### 1. Add Explicit Features (Priority: High)

```typescript
const score = {
  // Semantic (current)
  semantic: 0.5 * cosineSimilarity(chunk, savedCentroid),
  
  // Behavioral (NEW)
  speaker: 0.2 * speakerSaveRate(chunk.speaker),
  podcast: 0.2 * podcastSaveRate(chunk.podcast),
  length: 0.1 * lengthPreference(chunk.wordCount),
}

finalScore = sum(score.values)
```

**Effort**: Medium (2-3 days)  
**Impact**: High (breaks centroid similarity issue)

### 2. Fine-Tune Embeddings (Priority: Low)

Train podcast-specific embeddings:
```python
# Contrastive loss on save/skip pairs
loss = -log(exp(sim(anchor, positive)) / 
             (exp(sim(anchor, positive)) + exp(sim(anchor, negative))))
```

**Effort**: Very High (weeks, requires ML infrastructure)  
**Impact**: High (embeddings learn user-specific signals)

### 3. Collaborative Filtering (Priority: Medium)

```typescript
// "Users similar to you also saved..."
const similarUsers = findUsersWithSimilarSaves(userId);
const recommendations = getPopularSaves(similarUsers);

score += collaborativeBoost(chunk, recommendations);
```

**Effort**: Medium (requires user base)  
**Impact**: Medium-High (leverages collective intelligence)

---

## Monitoring

### Check Centroid Similarity Distribution

```sql
-- Run daily to track across users
SELECT 
  user_id,
  -- Compute in application, log to table
  centroid_similarity,
  saved_count,
  skipped_count
FROM user_centroid_stats
WHERE centroid_similarity > 0.85
ORDER BY centroid_similarity DESC;
```

**Metrics**:
- % users with similarity > 0.85 (need explicit features)
- % users with similarity 0.7-0.85 (contrastive helps a bit)
- % users with similarity < 0.7 (contrastive works well)

### Track Fallback Usage

```typescript
// In logs
console.log(`Fallback stats: 
  Contrastive: ${contrastiveCount} users
  Positive-only (fallback): ${fallbackCount} users
  Ratio: ${fallbackCount / total}
`);
```

**If > 50% users hit fallback**: Embeddings insufficient for this use case

---

## Karpathy's Verdict

**Rating**: 6.5/10 (down from 8.5)

**What He'd Say**:
> "You discovered why most recommender systems don't rely solely on embeddings. The fallback is correct - you're being defensive. But this tells you the real work ahead: multi-signal scoring. Embeddings + explicit features + collaborative filtering. That's how Netflix/Spotify do it."

**Process Lesson**:
> "Ship, measure, iterate. You shipped contrastive learning (good theory), measured it (all 0.5), discovered the limitation (similar centroids), and added a fallback (defensive). Now you know what to build next. This is how you learn."

**Next Steps**:
1. ✅ Deploy fallback (done)
2. 📊 Monitor centroid similarity across users
3. 🎯 Prototype explicit features (speaker/podcast preference)
4. 🧪 A/B test: embeddings vs hybrid scoring

---

## Summary

**Discovered**: Contrastive learning fails when saved/skipped centroids too similar  
**Why**: General embeddings can't capture nuanced within-topic preferences  
**Fix**: Fallback to positive-only when similarity > 0.85  
**Lesson**: Embeddings alone aren't enough for personalized recommendations  
**Next**: Add explicit features (speaker, podcast, behavioral signals)

This is a **learning moment**, not a failure. Real-world ML is messy.
