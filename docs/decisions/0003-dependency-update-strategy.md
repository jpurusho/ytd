# 0003 — Dependency Update Strategy

**Status:** Accepted
**Date:** 2026-11-03

## Context

ytd v1.7.10 has significant outdated dependencies:
- **MUI:** 5.16.7 → 9.5.0 (4 major versions)
- **React:** 18.3.1 → 19.3.1 (1 major version)
- **Electron:** 33.2.0 → 45.2.2 (12 major versions)
- **TypeScript:** 5.7.0 → 7.0.2 (2 major versions)
- **Vite:** 6.0.0 → 8.3.5 (2 major versions)
- **Plus 15+ other packages**

Security, performance, and maintainability require updates, but the large version jumps carry risk of breaking changes.

## Research Findings

### MUI 5 → 9 Migration

**Key Discovery:** MUI v9 supports React 17, 18, **and 19** via peer dependencies.

```json
{
  "react": "^17.0.0 || ^18.0.0 || ^19.0.0",
  "@emotion/react": "^11.5.0",
  "@emotion/styled": "^11.3.0"
}
```

**Version Path:** 5.16.7 → 6.x → 7.x → 8.x → 9.5.0 (staged migration available)

**Breaking Changes (v9.x):**
- Autocomplete elevation: 1 → 8 (visual change)
- New `theme.focusVisible` for focus rings
- Roving tabindex for ToggleButtonGroup
- Support for `data-*` attributes on slotProps

**Upcoming (v10 alpha):**
- More significant breaking changes expected
- Don't upgrade to v10 yet

**Migration Complexity:** Moderate (incremental path exists)

### React 18 → 19 Migration

**Breaking Changes:**
1. **`ref` as prop** — No more `forwardRef` wrapper needed
   ```diff
   - const MyInput = forwardRef((props, ref) => <input ref={ref} />)
   + function MyInput({ref}) { return <input ref={ref} /> }
   ```

2. **Context simplified** — `<Context.Provider>` → `<Context>`
   ```diff
   - <ThemeContext.Provider value="dark">
   + <ThemeContext value="dark">
   ```

3. **Ref callbacks with cleanup** — Can return cleanup function
   ```js
   <input ref={(ref) => {
     // setup
     return () => { /* cleanup */ };
   }} />
   ```

4. **`useFormState` renamed** — Now `useActionState`

**New Features (additive):**
- Actions & async transitions
- `use()` hook (read promises/context)
- `useOptimistic()` for instant UI updates
- `useFormStatus()` for form state
- Document metadata (`<title>`, `<meta>` anywhere)
- Resource preloading APIs

**Migration Complexity:** Low-Moderate
- Most code works as-is
- Codemods available for automated fixes
- Breaking changes are edge cases

### TypeScript 5 → 7 Migration

**Changes:**
- Mostly new features, not breaking changes
- Better type inference
- Improved error messages
- New utility types

**Migration Complexity:** Low (minimal breaking changes)

### Electron 33 → 45 Migration

**Key Areas to Test:**
- IPC handlers (API may have changed)
- Custom protocol (`local-media://`)
- OAuth flow (browser window opening)
- File system access
- Window management
- Auto-updater

**Migration Complexity:** Moderate (need to review changelog thoroughly)

### Vite 6 → 8 Migration

**Changes:**
- Mostly performance and DX improvements
- Plugin API may have minor changes

**Migration Complexity:** Low

## Decision

**Strategy: Staged migration in dependency-aware order**

### Phase 1A: Low-Risk Updates (Week 1)
Update packages with minimal breaking changes first to establish baseline stability:

1. **TypeScript 5.7 → 7.0**
   - Lowest risk
   - Fix any type errors
   - Verify compilation

2. **Vite 6 → 8 & Vitest 4 → 5**
   - Update build tools
   - Test dev server & build
   - Update plugins

3. **Minor dependencies**
   - @vitejs/plugin-react
   - electron-builder
   - Other supporting libraries

### Phase 1B: React Migration (Week 1-2)
React can be updated before OR after MUI (MUI v9 supports both):

4. **React 18 → 19**
   - Update react & react-dom
   - Run React 19 codemods (if available)
   - Fix ref forwarding issues
   - Test Context usage
   - Verify all pages render

**Rationale:** Update React early to take advantage of new features while building error handling & logging infrastructure.

### Phase 1C: MUI Migration (Week 2-3)
MUI is the riskiest update, so do it with solid foundation in place:

5. **MUI 5.16 → 6.x**
   - Update @mui/material, @mui/icons-material
   - Test all pages for visual regressions
   - Fix any component API changes

6. **MUI 6.x → 7.x**
   - Incremental update
   - Visual QA pass
   - Fix deprecations

7. **MUI 7.x → 8.x**
   - Incremental update
   - Visual QA pass

8. **MUI 8.x → 9.5.0**
   - Final MUI update
   - Verify theme.focusVisible works
   - Check Autocomplete elevation change
   - Full visual regression test

**Alternative (Faster):** Jump directly from 5 → 9 and fix issues as they arise. Only use staged approach if direct migration breaks too much.

### Phase 1D: Electron Migration (Week 3-4)
Save Electron for last as it requires most testing:

9. **Electron 33 → 45**
   - Review Electron changelog (33-45)
   - Update electron & electron-builder
   - Test OAuth flow thoroughly
   - Test IPC handlers
   - Test custom protocol
   - Test file operations
   - Test window management
   - Test auto-updater
   - Test on macOS (Windows/Linux if available)

## Migration Order Rationale

**Why TypeScript first?**
- Catches type errors early
- Helps identify issues in other migrations
- Very low risk

**Why React before MUI?**
- MUI v9 supports React 18 & 19 (no blocker either way)
- React 19 features useful for error handling work
- Smaller update scope (easier to isolate issues)

**Why MUI staged?**
- 4 major versions is huge jump
- Visual regressions need careful QA
- Staged approach provides rollback points
- Can skip stages if direct 5→9 works

**Why Electron last?**
- Most complex to test (OAuth, IPC, protocols)
- Want stable foundation first
- Requires most manual verification
- Hardest to rollback if issues found

## Testing Strategy

### After Each Update:
1. **Compilation check:** `npm run build`
2. **Dev server check:** `npm run dev`
3. **Package check:** `npm run dist`
4. **Manual smoke test:**
   - Launch app
   - Sign in (OAuth)
   - Search video
   - Download video
   - Check playlists
   - Test settings

### Before Moving to Next Update:
- All tests passing
- No console errors
- App functional in dev mode
- No visual regressions (compare screenshots)

### Rollback Strategy:
- Keep each update in separate commits
- Test after each commit
- If blocked, revert and document blocker
- Move to next update, return later

## Consequences

### Positive
- ✅ Systematic approach reduces risk
- ✅ Each update independently committable
- ✅ Clear rollback points
- ✅ Testing strategy ensures stability
- ✅ TypeScript catches issues early

### Negative
- ⚠️ Takes longer than "update all at once"
- ⚠️ More git commits (but that's okay)
- ⚠️ Need to test repeatedly

### Risks

**Risk: MUI 5→9 has undocumented breaking changes**
- Mitigation: Stage through 6, 7, 8 to isolate issues
- Fallback: Stay on MUI 5 or 6 if 9 too problematic

**Risk: React 19 breaks component patterns**
- Mitigation: Update React after TypeScript (types catch issues)
- Fallback: Stay on React 18 (MUI v9 supports it)

**Risk: Electron 45 breaks OAuth or IPC**
- Mitigation: Test last, with stable foundation
- Fallback: Stay on Electron 33 temporarily

**Risk: Combinatorial issues (React 19 + MUI 9 conflict)**
- Mitigation: Stage updates, test between
- Fallback: Revert one or both, stay on older versions

## Alternative Considered: "Big Bang" Update

Update everything at once, fix issues as they arise.

**Rejected because:**
- Too many variables changing simultaneously
- Hard to isolate root cause of issues
- Difficult to rollback partially
- Higher risk of getting stuck

**When it might work:**
- If you have comprehensive automated tests (we don't yet)
- If updates are minor (they're not)
- If you can afford downtime (we want working app throughout)

## Success Criteria

- ✅ All dependencies on latest stable versions
- ✅ Zero TypeScript errors
- ✅ All existing features working
- ✅ No console errors
- ✅ Dev & prod builds working
- ✅ OAuth flow functional
- ✅ Downloads working
- ✅ No visual regressions

## Next Actions

1. Create separate task for each update phase
2. Set up visual regression testing (screenshots)
3. Update Phase 1A (TypeScript, Vite)
4. Test & commit
5. Proceed to Phase 1B (React)
6. Continue through phases

## Notes

- Versions checked: 2026-11-03
- MUI latest: 9.5.0 (v10 alpha exists but skip)
- React latest: 19.3.1
- TypeScript latest: 7.0.2
- Electron latest: 45.2.2

**Reference:**
- React 19 blog: https://react.dev/blog/2024/12/05/react-19
- MUI releases: https://github.com/mui/material-ui/releases
