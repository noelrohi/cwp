# Export API

Export your saved signals as JSON for use with external tools (Exocortex, RAG systems, etc).

## Endpoint

```
GET https://framebreak-intelligence.vercel.app/api/export
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `userId` | Yes | - | Your user ID (find it in the sidebar menu → "Copy User ID") |
| `mode` | No | `full` | Export mode (see below) |
| `since` | No | - | ISO date to filter signals saved after this date |

## Export Modes

| Mode | Description |
|------|-------------|
| `full` | All saved signals without embeddings |
| `exocortex` | All saved signals with 1536-dim embeddings (larger file) |
| `incremental` | Only signals saved since a specific date |

## Examples

```bash
# Full export
curl "https://framebreak-intelligence.vercel.app/api/export?userId=YOUR_USER_ID"

# With embeddings for RAG/vector search
curl "https://framebreak-intelligence.vercel.app/api/export?userId=YOUR_USER_ID&mode=exocortex"

# Only signals saved since Dec 1st
curl "https://framebreak-intelligence.vercel.app/api/export?userId=YOUR_USER_ID&since=2024-12-01"

# Save to file
curl "https://framebreak-intelligence.vercel.app/api/export?userId=YOUR_USER_ID" -o signals.json
```

## Response Format

```json
{
  "version": "1.0",
  "exported_at": "2024-12-09T10:30:00Z",
  "export_mode": "full",
  "user_id": "abc123",
  "document_count": 42,
  "documents": [
    {
      "id": "signal_xyz",
      "type": "signal",
      "source": {
        "type": "episode",
        "title": "Episode Title",
        "podcast": "Podcast Name",
        "published_at": "2024-11-15T...",
        "url": "https://..."
      },
      "content": {
        "title": "Signal title",
        "summary": "AI-generated insight summary",
        "excerpt": "Key quote from transcript",
        "speaker": "Guest Name",
        "transcript_context": "Full transcript chunk...",
        "timestamp_start": 1234,
        "timestamp_end": 1290
      },
      "metadata": {
        "relevance_score": 0.92,
        "saved_at": "2024-12-05T...",
        "tags": ["strategy", "growth"],
        "notes": "User notes if any"
      },
      "embedding": [0.123, -0.456, ...]
    }
  ]
}
```

> **Note:** The `embedding` field (1536-dimensional vector) is only included when `mode=exocortex`.

## Finding Your User ID

1. Click your profile in the bottom-left sidebar
2. Click **"Copy User ID"**

## UI Export

You can also export directly from the app:

1. Go to **Signals → Episodes** or **Signals → Articles**
2. Click the **Export** dropdown button
3. Choose your export mode
