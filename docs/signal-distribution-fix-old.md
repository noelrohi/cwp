# Quick Fix Guide: Signal Distribution Problem

## The Bug
```typescript
// ❌ CURRENT (BROKEN)
return sorted.slice(0, 30);  // Only top 30 = narrow 60-80% band
```

## The Fix
```typescript
// ✅ FIXED (STRATIFIED SAMPLING)
// Distribution: 10% low, 20% med-low, 40% mid, 20% med-high, 10% high
const stratify = [
  { min: 0.0, max: 0.3, count: 3 },   // Low (exploration)
  { min: 0.3, max: 0.5, count: 6 },   
  { min: 0.5, max: 0.7, count: 12 },  // Medium (bulk)
  { min: 0.7, max: 0.85, count: 6 },  
  { min: 0.85, max: 1.0, count: 3 },  // High
];
```

## Why It Matters

**Current UX**: User only sees 60-80% confidence signals
- No low scores to skip → No negative training signal
- Can't teach model what to avoid
- Misleading "everything looks 70% good"

**Fixed UX**: User sees full range 0-100%
- Low scores to skip → "Model was right to score low"
- Medium scores → Real uncertainty
- High scores → Clear wins
- Model learns boundaries faster

## Before/After

### Before Fix
```
Current Distribution (50 signals):
60-70%: ████████████████████████████ (78%)
70-80%: ███████ (22%)
```

### After Fix
```
Expected Distribution (30 signals):
0-30%:   ███ (10%)  ← NEW: Can skip these
30-50%:  ██████ (20%)  
50-70%:  ████████████ (40%)
70-85%:  ██████ (20%)
85-100%: ███ (10%)  ← High confidence
```

## Testing
```bash
# Before
pnpm tsx scripts/check-pending-signals.ts <userId>
# Should show: 60-80% clustered

# After  
pnpm tsx scripts/check-pending-signals.ts <userId>
# Should show: Full 0-100% distribution
```

## File to Edit
`src/inngest/functions/daily-intelligence-pipeline.ts`

Function: `filterRankedChunks()` (lines 593-608)
