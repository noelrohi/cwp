# Mobile Refresh Bug - Cards Staying on Screen After Snip Creation

## Priority
**Medium** - UX issue affecting mobile users

## Problem
After creating a snip on mobile, cards stay on screen instead of being removed/refreshed properly. This was mentioned by Noel as potentially already fixed, but needs verification.

## Current State
- Unknown if still exists
- Need to test on mobile device
- May have been fixed but not confirmed

## Acceptance Criteria
- [x] Test snip creation flow on mobile device
- [x] Verify cards are removed from view after snip creation
- [x] Check if page/list refreshes properly
- [x] Ensure no stale UI state remains

## Implementation Steps
1. **Test Current Behavior**
   - Open app on mobile device
   - Navigate to signals page
   - Create a snip from a signal card
   - Observe if card disappears/refreshes

2. **If Bug Exists - Fix Options**
   - Check query invalidation in `SnipDialog` component (lines 69-123)
   - Verify all relevant query keys are being invalidated
   - Add mobile-specific refresh logic if needed
   - Consider using optimistic updates for better UX

3. **Verify Fix**
   - Test on multiple mobile devices
   - Test with different network conditions
   - Ensure consistent behavior

## Files to Check
- `/src/components/snip-dialog.tsx` - Snip dialog with query invalidation
- `/src/app/(app)/signals/page.tsx` - Signals list page
- `/src/server/trpc/client.tsx` - tRPC query invalidation

## Notes
- Noel mentioned he may have already fixed this
- Low priority unless confirmed still broken
- May be related to React Query cache invalidation timing on mobile
