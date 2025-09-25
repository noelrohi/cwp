# Daily Intelligence System Sequence

## Core Workflow

```
Review → Save/Skip → Model improves → Better signals tomorrow
```

## Daily Sequence

### 2:00 AM - Automated Pipeline
1. **Fetch new episodes** from podcast sources
2. **Process transcripts** with consistent chunking:
   - Min words: 400
   - Max words: 800
   - Use speaker turns: True
3. **Generate embeddings** for all chunks
4. **Score signals** based on relevance and importance
5. **Store results** for daily review

### 8:00 AM - Daily Review Interface
```
┌─────────────────────────────────────┐
│  Today's Signals (30)               │
├─────────────────────────────────────┤
│                                     │
│ [1] McKinsey cuts 5000 consultants │
│     All-In • 2:35 • Score: 0.92    │
│     "The fundamental shift is..."   │
│     [Save] [Skip]                  │
│                                     │
│ [2] Figma's governance model       │
│     Innovation Show • 9:08 • 0.88  │
│     "Unlike Adobe's file-based..."  │
│     [Save] [Skip]                  │
│                                     │
└─────────────────────────────────────┘
```

### Continuous Learning
- **Save actions**: Train model on positive examples
- **Skip actions**: Train model on negative examples  
- **Background optimization**: Adjust scoring weights weekly
- **No manual training**: Implicit feedback only

## Architecture Principles

### What to Avoid
- ❌ Manual parameter tweaking
- ❌ One-off similarity searches
- ❌ Empty "Saved Chunks" sections
- ❌ Complex configuration UIs

### What to Build
- ✅ Automated daily pipeline
- ✅ Simple review interface
- ✅ Background model learning
- ✅ Consistent chunking settings

## Configuration (Hidden)

```python
# config.py
CHUNK_SETTINGS = {
    'min_words': 400,    # Set once, forget
    'max_words': 800,
    'use_speaker_turns': True
}

PIPELINE_SETTINGS = {
    'run_time': '02:00',
    'max_daily_signals': 30,
    'min_confidence_score': 0.7
}
```

## Focus Areas

1. **Signal Quality**: Improve relevance scoring through feedback
2. **Review Efficiency**: Minimize time to review daily signals
3. **Automation**: Reduce manual intervention to zero
4. **Learning**: Model improves continuously from user actions

This is a signal finder, not a transcript analysis tool.