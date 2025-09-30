# Context Documents for LLM Sessions

This directory contains context documents that should be provided to Claude Code or other LLMs in future sessions to maintain continuity and system understanding.

## Available Context Files

### signal-validation.llm.txt
**Purpose**: Complete guide for validating and debugging the embedding-based signal recommendation system.

**When to use**:
- User reports poor recommendations
- Investigating why signals score high/low
- Testing changes to scoring logic
- Onboarding new developers to the personalization system

**What's included**:
- System architecture overview
- All validation scripts and their usage
- How to interpret metrics
- Common issues and fixes
- Step-by-step debugging workflows
- Success criteria

**Quick start**:
```bash
# Full validation workflow
pnpm validate:embeddings <userId>
pnpm validate:stats <userId>
pnpm tsx scripts/check-pending-signals.ts <userId>
pnpm tsx scripts/analyze-saved-content.ts <userId>

# Or use the web UI
# Navigate to /debug and click "Validation" tab
```

## Adding New Context Files

When creating context for future sessions:

1. Use `.llm.txt` extension for LLM-optimized documents
2. Use `.md` for human-readable documentation
3. Keep context files focused on specific systems/features
4. Include practical examples and commands
5. Document common failure modes and solutions
6. Keep success criteria clear and measurable

## Using These Files in Future Sessions

When starting a new Claude Code session and working on related systems:

1. Reference the context file: `@docs/context/signal-validation.llm.txt`
2. Or paste relevant sections into your prompt
3. Claude will use this to understand the system without re-discovery