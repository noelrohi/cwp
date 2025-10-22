# Production Readiness Checklist

A guide for verifying that code changes are production-ready before committing.

## Quick Commands

```bash
# Run all checks at once
pnpm tsc --noEmit && pnpm lint && echo "✅ All checks passed!"

# Individual checks
pnpm tsc --noEmit           # TypeScript type checking
pnpm lint                    # Biome linting
pnpm format                  # Auto-fix formatting issues
```

## Pre-Commit Checklist

### 1. ✅ TypeScript Type Safety

**Check for type errors:**
```bash
pnpm tsc --noEmit
```

**Expected output:**
```
✅ No errors found
```

**Common issues:**
- Missing type annotations
- Incorrect types from external libraries
- Union type narrowing needed

**Fix:**
- Add proper type guards: `if (obj && typeof obj === "object" && "prop" in obj)`
- Use explicit type annotations
- Narrow union types with `instanceof` or type predicates

---

### 2. ✅ Linting & Code Quality

**Check linting:**
```bash
pnpm lint
```

**Expected output:**
```
Checked N files in Xms. No fixes applied.
```

**Auto-fix formatting issues:**
```bash
pnpm format
```

**Common issues:**
- Formatting inconsistencies
- Unused variables/imports
- Implicit `any` types
- Suspicious code patterns

**Fix:**
- Run `pnpm format` to auto-fix most issues
- Remove unused imports/variables
- Add explicit types where needed

---

### 3. ✅ Review Unstaged Changes

**Check what files have changed:**
```bash
git status --short
```

**Review each changed file:**
```bash
git diff <file>
```

**Verify:**
- ✅ All changes are intentional
- ✅ No debug code (console.logs, commented code)
- ✅ No hardcoded values (API keys, secrets)
- ✅ No unnecessary files (temp files, artifacts)

---

### 4. ✅ Clean Up Dead Code

**Check for unused imports:**
```bash
# Lint will catch most unused imports
pnpm lint | grep "unused"
```

**Check for dead code:**
- Unused functions
- Commented-out code blocks
- Old implementations left in files
- Test/debug code

**Remove:**
```bash
# Delete unused files
rm src/path/to/unused-file.ts

# Or use git to track deletions
git rm src/path/to/unused-file.ts
```

---

### 5. ✅ Verify Dependencies

**Check if new dependencies are added:**
```bash
git diff package.json
```

**Verify:**
- ✅ Dependencies are in correct section (`dependencies` vs `devDependencies`)
- ✅ Versions are pinned or use acceptable ranges
- ✅ No unnecessary dependencies
- ✅ Lock file is updated: `git diff pnpm-lock.yaml`

---

### 6. ✅ Test Imports & Exports

**Check for broken imports:**
```bash
pnpm tsc --noEmit
```

**Verify:**
- ✅ All imports resolve correctly
- ✅ No circular dependencies
- ✅ Exports match usage

**Common issues:**
- Importing from deleted files
- Importing non-existent exports
- Missing barrel exports in index files

---

### 7. ✅ Database Schema Changes

**If schema changed, verify:**
```bash
git diff src/server/db/schema/
```

**Check:**
- ✅ Migration needed? (manual verification)
- ✅ Nullable vs required fields correct
- ✅ Indexes on foreign keys
- ✅ Default values appropriate

---

### 8. ✅ API/tRPC Changes

**If tRPC routers changed:**
```bash
git diff src/server/trpc/routers/
```

**Verify:**
- ✅ Input validation with Zod schemas
- ✅ Authorization checks (`protectedProcedure`)
- ✅ Error handling
- ✅ Return types match frontend expectations

---

### 9. ✅ Frontend Components

**If React components changed:**
```bash
git diff src/components/ src/app/
```

**Verify:**
- ✅ No hardcoded strings (use i18n if needed)
- ✅ Accessibility (labels, ARIA attributes)
- ✅ Loading states
- ✅ Error states
- ✅ Responsive design (mobile/desktop)

---

### 10. ✅ Environment Variables

**If new env vars added:**
```bash
grep -r "process.env" --include="*.ts" --include="*.tsx"
```

**Verify:**
- ✅ Document in `.env.example`
- ✅ Never commit actual `.env` file
- ✅ Validation/fallback values
- ✅ Type-safe access (use Zod schema)

---

## Advanced Checks

### Check Specific File Types

**Check only modified TypeScript files:**
```bash
pnpm tsc --noEmit $(git diff --name-only --diff-filter=ACMR | grep '\.tsx\?$' | tr '\n' ' ')
```

**Lint only modified files:**
```bash
git diff --name-only --diff-filter=ACMR | grep '\.tsx\?$' | xargs pnpm biome check
```

### Verify No Secrets

**Check for potential secrets:**
```bash
git diff | grep -i -E "(api_key|secret|password|token)" | grep -v "\.env\.example"
```

**Expected:** No matches or only legitimate variable names

### Check Bundle Size Impact

**If worried about bundle size:**
```bash
# Build and check size
pnpm build
du -sh .next/static/chunks/
```

---

## Commit Guidelines

### Good Commit Practice

1. **Review changes one last time:**
   ```bash
   git diff --staged
   ```

2. **Commit with descriptive message:**
   ```bash
   git commit -m "feat: implement YouTube episode sync with search-based matching"
   ```

3. **Push and verify CI/CD passes:**
   ```bash
   git push
   # Watch CI/CD pipeline
   ```

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation
- `style`: Formatting, missing semicolons
- `test`: Adding tests
- `chore`: Maintenance

**Example:**
```
feat: implement YouTube episode sync with search-based matching

- Add YouTube search API integration
- Create manual episode matching dialog
- Add YouTube transcript support for cost savings
- Clean up old playlist-based matching code

Closes #123
```

---

## Common Pitfalls

### ❌ Don't Commit

- Debug/test files (`scripts/test-*.ts`, `scripts/debug-*.ts`)
- Temp data files (`*.json` in project root)
- Console.logs for debugging
- Commented-out code
- `.env` files with secrets
- `node_modules/` (should be in `.gitignore`)
- Build artifacts (`.next/`, `dist/`, etc.)

### ✅ Always Include

- Type definitions for new features
- Updated `.env.example` for new env vars
- Updated documentation if APIs changed
- Migration files if schema changed
- Tests for new critical features

---

## Emergency Rollback

**If something breaks after commit:**

```bash
# Revert last commit (keep changes)
git reset --soft HEAD~1

# Revert last commit (discard changes)
git reset --hard HEAD~1

# Revert specific file
git checkout HEAD~1 -- path/to/file.ts
```

---

## Tools & Resources

### IDE Integration

**VS Code:**
- Install Biome extension for real-time linting
- Enable "Format on Save"
- Enable "Organize Imports on Save"

**Settings:**
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  }
}
```

### Git Hooks (Optional)

**Pre-commit hook to auto-check:**

Create `.husky/pre-commit`:
```bash
#!/bin/sh
pnpm tsc --noEmit && pnpm lint
```

---

## Summary

**Before every commit, run:**

```bash
# 1. Type check
pnpm tsc --noEmit

# 2. Lint
pnpm lint

# 3. Format
pnpm format

# 4. Review changes
git status
git diff

# 5. Commit if all good
git add .
git commit -m "feat: your feature description"
```

**Red flags:**
- TypeScript errors
- Lint errors (except pre-existing)
- Uncommitted changes you don't recognize
- Large number of files changed unexpectedly

**Green flags:**
- Clean type checking
- Clean linting (or only pre-existing errors)
- All changes are intentional
- Good commit message ready
