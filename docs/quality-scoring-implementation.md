# Quality-Based Signal Scoring Implementation

**Status:** ✅ Shipped to Production  
**Date:** October 9, 2025  
**Impact:** Signal scores now range 24-96% (was 66-79%), with clear differentiation of content quality

---

## Problem Statement

### Original Algorithm Issues

**Semantic-Only Scoring (Pure Cosine Similarity):**
```
Score = cosineSimilarity(chunk, saved_centroid)
```

**Two Critical Flaws:**

1. **Single Centroid Assumption**
   - Treated all saved content as having one "topic"
   - Reality: Users save diverse content (investing + psychology + productivity)
   - Result: Scores compressed into narrow 66-79% range

2. **Ignored Content Quality**
   - Semantic embeddings measure "what it's about" not "is it quotable/insightful"
   - User saves based on writing quality: long chunks (+73%), principles (+50%), metaphors (+36%)
   - Embeddings can't capture "this is worth memorizing" vs "this is relevant"

**Example:** Holocaust backstory (long, on-topic) scored 75% despite being low-quality content.

---

## Solution: Multiplicative Quality Boosting

### New Algorithm

```typescript
// 1. Learn quality preferences from snips (flashcards) + saves
qualityProfile = learnUserQualityProfile(userId)
  // Snips (weight 1.0): "This is SO good I'm memorizing it" 
  // Saves (weight 0.26): "This is above average"

// 2. Score semantic similarity (unchanged)
semanticScore = cosineSimilarity(chunk, centroid)  // 0-1

// 3. Extract quality features from content
qualityScore = scoreChunkQuality(chunk.content, qualityProfile)  // 0-1

// 4. Apply multiplicative boost
qualityBoost = calculateBoost(qualityScore)
  // Quality 0.0 → boost = 0.2x (heavily penalize)
  // Quality 0.3 → boost = 1.0x (neutral, typical for saves)
  // Quality 0.5 → boost = 1.5x (good boost)
  // Quality 1.0 → boost = 3.0x (triple the score!)

finalScore = semanticScore × qualityBoost  // clamped 0-1
```

### Quality Features Learned

**14 style features extracted:**
- Length: wordCount, charCount, avgWordLength
- Style: hasQuotes, hasNumbers, hasEmphasis
- Structure: sentenceCount, avgSentenceLength
- Patterns: hasFirstPerson, hasSecondPerson, hasImperative
- Quality proxies: uniqueWordRatio, punctuationDensity
- Insight markers: hasPrinciple, hasContrast, hasMetaphor

**User's learned preferences (example):**
- Prefers long chunks: +73%
- Prefers principle-based content: +50%
- Prefers metaphors: +36%
- Prefers direct address: +42%

---

## Results

### Before vs After (Josh Kushner Episode)

| Metric | Before (Semantic Only) | After (Quality Boost) | Change |
|--------|------------------------|----------------------|--------|
| **Top Score** | 79% | **94%** | +15% ✅ |
| **Score Spread** | 15% (66-79%) | **65%** (29-94%) | +50% ✅ |
| **Top 3 Range** | 79-75% | **94-89%** | Much better |
| **Bottom Scores** | 66% | **29%** | Correct crushing |

### Charlie Songhurst Episode

| Signal | Score | Why High/Low |
|--------|-------|--------------|
| **#1 (96%)** | Startup failure modes by stage | 493 words, framework, multiple metaphors, principles |
| **#2 (92%)** | "Study failure not success" | Contrarian insight, long narrative, actionable |
| **#30 (24%)** | WorkOS sponsor ad | No original insight, marketing copy |

---

## Implementation Details

### Files Changed

1. **`src/server/lib/quality-features.ts`** (NEW)
   - Extracts 14 quality features from text
   - Learns user preferences by comparing snips/saves vs random baseline

2. **`src/server/lib/quality-scoring.ts`** (NEW)
   - Weighted learning: Snips (1.0x) + Saves (0.26x)
   - Prevents overfitting to small snip samples
   - Multiplicative boost formula

3. **`src/inngest/functions/daily-intelligence-pipeline.ts`** (MODIFIED)
   - Integrated quality scoring into 3 scoring paths:
     - Contrastive learning
     - Positive-only fallback
     - Similarity fallback
   - Added transparent diagnostics logging

### Transparent Diagnostics

**Now logs after each signal generation:**
```
📊 Signals Generated: 30
🎯 Scoring Method: contrastive-fallback
✨ Quality Scoring: ENABLED (4 snips + 100 saves)
📈 Score Range: 24.0% - 96.2%
📊 Score Spread: 72.2%
📉 Average Score: 65.9%
```

---

## Why Weighted Learning?

### The Cold Start Problem

**Issue:** With only 4 snips, system could overfit to those specific styles.

**Example:**
- 4 snips only (weight 1.0) → Top score 63.9% ❌ (overfit to 4 patterns)
- 4 snips + 50 saves blended → Top score 94.2% ✅ (generalizes better)

**Solution:** Weighted ensemble prevents overfitting while prioritizing snips

```typescript
if (snipCount < 10 && savedCount > 0) {
  // Blend snip patterns with save patterns
  snipWeight = 1.0
  saveWeight = 0.5 - (snipCount * 0.06)  // Decreases as snips increase
  
  finalPreferences = (snipPrefs × 1.0) + (savePrefs × 0.26)
}
```

**As user creates more snips:**
- 1-5 snips: Save weight 0.44 → 0.20 (high blending)
- 6-9 snips: Save weight 0.20 → 0.10 (medium)
- 10+ snips: Save weight 0.10 (minor augmentation)

---

## Key Insights

### 1. Snips Are Gold Standard
**Why:** User creates flashcard = "This is SO valuable I want to memorize it"  
**vs Saves:** "This is above average, might revisit later"

### 2. Multiplicative > Additive
**Why:** Multiplicative boost creates better differentiation
- High semantic + High quality → 90-100% (exceptional!)
- High semantic + Low quality → 20-40% (correctly crushed)
- Additive would compress scores (e.g., 0.7 + 0.3 = 1.0, but 0.7 + 0.1 = 0.8, only 20% difference)

### 3. Quality ≠ Topic Relevance
**Semantic embeddings:** "This chunk is about investing"  
**Quality features:** "This chunk has principles, metaphors, and is quotable"  
**Both needed** for exceptional signals

---

## What's Next

### Recommended Monitoring

1. **Watch score distribution** - Should see:
   - Top signals: 85-95%+
   - Medium: 60-80%
   - Low quality: <50%

2. **Track user engagement** - Do users snip/save the 90%+ signals?

3. **Quality profile evolution** - As user creates more snips (10+), quality boost becomes more aggressive

### Future Improvements

1. **Add more quality features** (e.g., sentence complexity, vocabulary diversity)
2. **Cluster-specific quality profiles** (different quality for different topics)
3. **Time-decay for old preferences** (recent snips weighted higher)

---

## Standup Talking Points

**What we shipped:**
- Quality-based signal scoring using multiplicative boosting
- Learns from snips (flashcards) as gold standard, saves as secondary signal
- Transparent diagnostics showing scoring method and quality profile

**Impact:**
- Score spread improved from 15% to 65-72%
- Top signals now score 90-96% (was 79% max)
- Low-quality content correctly crushed to 24-30%

**Technical approach:**
- Weighted ensemble learning (snips 1.0x, saves 0.26x) prevents overfitting
- 14 quality features extracted (length, principles, metaphors, etc.)
- Multiplicative boost creates better differentiation than additive

**Why it works:**
- Users select content based on quality/quotability, not just topic
- Semantic embeddings alone can't capture "worth memorizing" signal
- Snips reveal what users find truly exceptional vs just relevant
