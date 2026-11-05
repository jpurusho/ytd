---
title: Defer Virtual Scrolling to Phase 3
date: 2026-11-05
status: accepted
---

# Context

Phase 2 modernization plan included virtual scrolling for the Library page (which can display up to 1000 items). After analysis, deferring this to Phase 3 makes more sense.

## Why defer?

**Complexity vs. benefit:**
- Library table has: sorting, multi-select, column toggling, custom row actions, responsive layout
- Virtualizing requires: custom cell rendering, scroll position management, selection state sync, header alignment
- Estimated implementation: 4-6 hours for table + grid views
- Current 1000-item limit performs acceptably on modern hardware

**Better ROI available:**
- React.memo optimizations prevent unnecessary re-renders across entire app
- Event-driven updates already eliminated polling overhead  
- Zustand + TanStack Query provide caching and state efficiency
- These give 80% of performance wins for 20% of effort

**Real-world usage:**
- Most users have <500 library items
- Library is paginated at 1000 items already
- Search/filter reduce visible items further
- No performance complaints logged

## Decision

**Phase 2:** Skip virtual scrolling, complete React.memo optimizations  
**Phase 3:** Revisit virtual scrolling if:
- Users report library performance issues
- Library grows beyond 1000 items commonly
- React.memo gains are insufficient

## Implementation notes for Phase 3

When implementing virtual scrolling later:

**Grid view** (simpler):
- Use `react-window` FixedSizeGrid
- Wrap Paper cards in grid cells
- Preserve selection state across virtual window

**Table view** (complex):
- Use `react-window` FixedSizeList for tbody only
- Keep thead static for proper column alignment
- Consider `react-virtualized-auto-sizer` for responsive sizing
- Alternative: MUI X DataGrid Pro (paid, but handles virtualization + sorting + selection)

**Testing:**
- Generate 5000+ item library
- Test scroll performance
- Verify selection state persists
- Check sorting/filtering still works
