# Confidence Score Filter - Feature Documentation

## Overview

Added confidence score filtering to the Pending Signals tab, allowing users to filter signals by their relevance scores and bulk skip filtered results.

## Features

### 1. Confidence Filter Dropdown

Located next to the episode filter in the Pending tab:

**Filter Options:**
- **All Confidence** - Show all signals (default)
- **High (≥65%)** - Show only high-confidence signals
- **Medium (50-65%)** - Show medium-confidence signals  
- **Low (<50%)** - Show low-confidence signals

### 2. Smart Skip All

The "Skip All" button now respects both filters:
- Skips only the **currently filtered signals**
- Shows count: "Skip All (X)" where X is the filtered count
- Works with both episode filter AND confidence filter combined

### 3. Signal Counter

Shows "Showing X signals" below filters to indicate how many signals match the current filters.

## Use Cases

### Use Case 1: Bulk Skip Low-Confidence Signals
1. Select "Low (<50%)" from confidence filter
2. Review the low-confidence signals briefly
3. Click "Skip All (X)" to skip all low-confidence signals at once
4. This provides negative training data efficiently

### Use Case 2: Focus on High-Confidence Content
1. Select "High (≥65%)" from confidence filter
2. Review only the most relevant signals
3. Save the ones that match your interests
4. Switch to other confidence levels when done

### Use Case 3: Calibrate Model Understanding
1. Select "Medium (50-65%)" - where model is uncertain
2. Your saves/skips in this range teach the model boundaries
3. This is the most valuable training data

### Use Case 4: Episode-Specific Confidence Review
1. Filter by specific episode
2. Then filter by confidence level
3. See how the model scored that episode's content
4. Skip all low-confidence from that episode

## Technical Implementation

### Filter Logic

```typescript
// Confidence ranges match stratified sampling buckets
switch (selectedConfidence) {
  case "high":
    return score >= 0.65;      // ≥65%
  case "medium":
    return score >= 0.5 && score < 0.65;  // 50-65%
  case "low":
    return score < 0.5;        // <50%
  default:
    return true;               // All
}
```

### Skip All Implementation

Instead of using the server's `skipAll` endpoint, we now:
1. Get IDs of **currently filtered signals** only
2. Call individual `action` mutations for each
3. This ensures filters are respected

```typescript
const signalIds = signals.map((s) => s.id);  // signals = filtered list

await Promise.all(
  signalIds.map((signalId) =>
    actionMutation.mutateAsync({ signalId, action: "skipped" }),
  ),
);
```

## UI Layout

**Desktop:**
```
[Episode Filter (300px)]    [Confidence Filter (180px)]

Showing X signals           [Skip All (X)]
```

**Mobile:**
```
[Episode Filter (full width)]

[Confidence Filter (full width)]

Showing X signals
                    [Skip All (X)]
```

## Benefits

1. **Efficient Training**: Bulk skip low-confidence signals to provide negative feedback
2. **Focused Review**: Filter to specific confidence ranges to save time
3. **Model Calibration**: See where model is uncertain, help it learn boundaries
4. **Flexible Workflow**: Combine episode + confidence filters for precise control

## Expected User Behavior

Based on stratified sampling distribution (2% / 22% / 34% / 42%):

- **Low confidence (<50%)**: ~24% of signals → Quick skip for most users
- **Medium (50-65%)**: ~34% of signals → Careful review, train boundaries  
- **High (≥65%)**: ~42% of signals → Higher save rate expected

## Future Enhancements

1. **Save distribution analytics**: Track save rates by confidence band
2. **Smart skip threshold**: "Skip all below X%" slider
3. **Confidence calibration**: Show user's historical save rate per band
4. **Batch actions**: "Save all high confidence" option

## Related Files

- UI: `src/app/(app)/signals/page.tsx`
- Scoring: `src/inngest/functions/daily-intelligence-pipeline.ts`
- Buckets: Defined at score thresholds 0.5 and 0.65
