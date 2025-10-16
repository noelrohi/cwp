# Readwise Integration Guide

Sync your Readwise documents (articles, highlights, and newsletters) into your library for processing and signal generation.

## ✅ What's Ready

- ✅ Database schema with `integrations` table
- ✅ Readwise API v3 client (full HTML content)
- ✅ TRPC endpoints (connect, disconnect, sync with filters)
- ✅ Dedicated integration page with sync dialog
- ✅ Rate limiting (10 syncs/hour)
- ✅ Duplicate detection
- ✅ Location filtering (New, Later, Archive, Feed)

## 🚀 Quick Start

### 1. Get Your Readwise API Token

1. Go to https://readwise.io/access_token
2. Sign in to your Readwise account
3. Copy your API token

### 2. Connect in App

1. Navigate to **Integrations** → **Readwise** (in sidebar)
2. Click **Connect Readwise**
3. Paste your API token
4. Click **Connect**

### 3. Sync Documents

1. Click **Sync Documents** button
2. Choose sync options:
   - **Location filter**: All, Inbox (New), Later, Archive, or Feed
   - **Reset sync history**: Re-import all documents (ignores last sync date)
3. Click **Sync Documents** in the dialog
4. Documents appear in your dashboard!

## 📧 How to Add Content

### Forward Newsletters/Articles to Readwise

1. Get your personal forwarding email at: https://read.readwise.io/add-to-library
2. Forward any newsletter or article to YOUR unique Readwise email
3. Readwise processes the content (usually takes 1-5 minutes)
4. Click **Sync Documents** in your app
5. Full articles with content become available!

### Or Use Readwise Reader

- Save web articles directly to Readwise Reader
- Import from RSS feeds
- Highlight in Kindle
- Import from Instapaper/Pocket/Matter
- All documents sync to your app with full content

## 🎯 What Gets Synced

**One article per document (max 100 per sync):**
```
Title: Original document title
Author: From document metadata
Source: "readwise"
URL: Original source URL (if available)
Content: Full HTML converted to Markdown
Notes: Your Readwise notes (if any)
```

**Document content structure:**
```markdown
[Full article content in Markdown]

---

**Notes:** Your Readwise notes (if added)
```

## 🔄 Sync Behavior

### Sync Dialog Options

**Location Filter:**
- **All locations** (default): Syncs documents from all Readwise locations
- **Inbox (New)**: Only new, unread documents
- **Later**: Documents you've saved for later
- **Archive**: Archived documents
- **Feed**: RSS feed items

**Reset Sync History:**
- When enabled: Re-imports ALL documents regardless of last sync date
- When disabled: Only syncs new/updated documents since last sync
- Useful for initial full sync or if something went wrong

### Sync Process
- Click "Sync Documents" button
- Fetches up to 100 documents per sync
- Uses Readwise API v3 with `withHtmlContent=true`
- Converts HTML to Markdown automatically
- Skips duplicates (tracks by Readwise document ID)
- Rate limit: 10 syncs/hour

### Incremental Sync (Default)
- Only syncs NEW/UPDATED documents since last sync
- Uses `updatedAfter` timestamp filter
- Won't duplicate existing content
- Efficient for regular syncing

## 📊 After Sync

Documents from Readwise:
1. ✅ Appear in dashboard with "pending" status
2. ✅ Click "Process Article" to generate AI summary
3. ✅ Content is chunked and embedded
4. ✅ Can generate signals from processed articles
5. ✅ Searchable in your library
6. ✅ Filter by source: Click "View synced documents" or visit `/dashboard?source=readwise`

## 🔐 Security

- API token stored in database
- Never exposed to client
- TRPC protected procedures only
- Rate limited to prevent abuse
- Can disconnect anytime (articles remain)

## 📈 Sync Status

The Readwise integration page shows:
- **Connection status**: Connected/Disconnected badge
- **Last synced**: Timestamp of last successful sync
- **Total synced**: Number of documents imported
- **Sync button**: Opens dialog with filtering options
- **View synced documents**: Direct link to filtered dashboard

## ❓ Troubleshooting

**"Invalid token" error:**
- Check token is correct from readwise.io/access_token
- Make sure no extra spaces
- Try generating new token

**"Too many requests" error:**
- Rate limit: 10 syncs/hour
- Wait and try again later

**No articles created after sync:**
- Check Readwise actually has documents (visit https://read.readwise.io)
- Look in dashboard for source: "readwise" or click "View synced documents"
- Check sync dialog response for "skipped X duplicates"
- Try using "Reset sync history" option

**Documents not showing up:**
- Make sure you clicked "Sync Documents" after forwarding emails
- Readwise needs time to process forwarded emails (~1-5 min)
- Check your Readwise Reader library first at https://read.readwise.io
- Verify correct location filter (try "All locations")

## 💡 Pro Tips

### Gmail Filter for Auto-Forward

1. Get your personal Readwise email from: https://read.readwise.io/add-to-library
2. Set up Gmail filter:
   - Has the words: `"unsubscribe"`
   - Forward to: `your-email@readwise.io` (your unique address)
3. Auto-forwards newsletters!

Then just sync in your app weekly.

### Best Practices

- ✅ Use "All locations" for first sync to import everything
- ✅ Sync once a day or when you add documents
- ✅ Manually process articles (click "Process Article" button) before generating signals
- ✅ Use location filters to organize syncing (e.g., only "New" items)
- ✅ Check Readwise Reader first if sync seems empty
- ✅ Use "View synced documents" link to see what's imported
- ❌ Don't spam sync button (rate limited to 10/hour)

## 🔮 Future Enhancements

Possible Phase 2 features:
- ✅ Location filtering (DONE)
- ✅ Duplicate detection (DONE)
- ✅ Full HTML content sync (DONE)
- Auto-sync every 6 hours via Inngest cron
- Sync progress UI with live updates
- Filter by Readwise tags/categories
- Auto-process articles after sync
- Batch operations (process all pending)

## 📝 Technical Details

### Readwise API Endpoints Used

```
GET /api/v2/auth - Verify token
GET /api/v3/list - Fetch documents (with HTML content)
  - Query params: pageCursor, updatedAfter, location, withHtmlContent
  - Returns: Full document list with HTML content
```

### Data Flow

```
Readwise API v3
  ↓
Fetch up to 100 documents with HTML content
  ↓
For each document:
  - Check if already imported (by readwiseId)
  - Skip if duplicate
  - Convert HTML to Markdown (using turndown)
  - Append Readwise notes if present
  - Create article record (status: "pending")
  ↓
User manually processes articles:
  - Click "Process Article" button
  - Generate AI summary
  - Chunk content
  - Generate embeddings
  ↓
Ready for signal generation!
```

### Rate Limits

**Your app:** 10 syncs/hour (Upstash Redis)  
**Readwise API:** Generous, unlikely to hit

### Database Schema

```sql
integration:
  - id (uuid)
  - userId (fk to user)
  - provider ("readwise")
  - accessToken (api token)
  - metadata (jsonb: lastSyncAt, totalItemsSynced)
  - createdAt, updatedAt

article:
  - source: "readwise" | "rss" | "email"
  - url: original source_url (nullable)
  - readwiseId: unique document ID (for duplicate detection)
  - rawContent: full HTML converted to Markdown
  - status: "pending" (requires manual processing)
  - (rest same as other articles)
```

## 🎉 Success!

You now have:
- ✅ Email → Readwise → Your App pipeline
- ✅ Full article content (not just highlights)
- ✅ Flexible sync options (location filters, reset sync)
- ✅ Duplicate detection (no re-imports)
- ✅ AI summaries of full documents
- ✅ Searchable document library with filtering
- ✅ Signal generation from processed articles
- ✅ Clean, dedicated integration page

No more manual copy/paste from newsletters and articles!

## 📍 Navigation

- **Integrations overview**: Sidebar → Integrations (collapsible)
- **Readwise page**: Sidebar → Integrations → Readwise
- **View synced docs**: Click "View synced documents" or visit `/dashboard?source=readwise`
