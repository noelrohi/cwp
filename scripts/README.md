# Scripts

## fetch-categories.ts

Fetches all categories from the Podscan API and inserts them into the database.

### Usage

```bash
pnpm fetch-categories <bearer_token>
```

Or directly with tsx:

```bash
tsx scripts/fetch-categories.ts <bearer_token>
```

### Arguments

- `bearer_token`: Your Podscan API bearer token

### Example

```bash
pnpm fetch-categories your_api_token_here
```

## fetch-episodes.ts

Fetches podcast episodes from the Podscan API and inserts them into the database with pagination support.

### Usage

```bash
# Fetch first page only
pnpm fetch-episodes <podcast_id> <bearer_token>

# Fetch specific page
pnpm fetch-episodes <podcast_id> <bearer_token> <page_number>

# Fetch ALL pages automatically
pnpm fetch-episodes <podcast_id> <bearer_token> --all
```

### Arguments

- `podcast_id`: The podcast ID from Podscan (starts with `pd_`)
- `bearer_token`: Your Podscan API bearer token
- `page_number`: Optional page number (defaults to 1)
- `--all`: Fetch all pages automatically

### Examples

```bash
# Get first page only
pnpm fetch-episodes pd_k42yajryg3n5p8ow your_token

# Get specific page (e.g., page 3)
pnpm fetch-episodes pd_k42yajryg3n5p8ow your_token 3

# Get ALL episodes across all pages (recommended)
pnpm fetch-episodes pd_k42yajryg3n5p8ow your_token --all
```

### Features

- Fetches all episodes for a given podcast with **full transcripts** and **word-level timestamps**
- Inserts new episodes or updates existing ones (based on episode_id)
- Creates category relationships through junction table
- **Automatically stores word-level timestamps** in separate table for precise search/analysis
- Handles pagination information
- Includes comprehensive error handling
- Shows progress during execution

## Database Schema

### Core Entities

- **`podcast`** - Podcast information (title, description, hosts)
- **`episode`** - Individual episodes with metadata
- **`person`** - Hosts, guests, and speakers
- **`company`** - Companies mentioned or sponsoring
- **`book`** - Books recommended or mentioned
- **`topic`** - Topics discussed in episodes
- **`category`** - Podcast categories from Podscan API
- **`quote`** - Key quotes from episodes

### Relationships (Junction Tables)

- **`episode_category`** - Episodes ↔ Categories (many-to-many)
- **`episode_person`** - Episodes ↔ People with roles (host/guest/speaker)
- **`episode_company`** - Episodes ↔ Companies with mention types
- **`episode_book`** - Episodes ↔ Books with context
- **`episode_topic`** - Episodes ↔ Topics with relevance scores
- **`podcast_host`** - Podcasts ↔ Hosts with primary/secondary roles

## ~~fetch-transcript.ts~~ ❌ DEPRECATED

**⚠️ This script is no longer needed!** 

The `fetch-episodes` script now automatically includes full transcripts and word-level timestamps when you use the query parameters `show_full_podcast=true&word_level_timestamps=true`.

## fetch-entities.ts

Fetches **Podscan's AI-extracted entities** from episode transcripts using their pre-trained ML models.

### Usage

```bash
# Single episode
pnpm fetch-entities ep_eb98jygz6d2njmga your_bearer_token

# All episodes
pnpm fetch-entities --all your_bearer_token
```

### What It Does

**🤖 Uses Podscan's AI API** (not our own AI SDK) to extract structured entities:

- **🎙️ Hosts** - Show hosts → `person` + `episode_person` tables (role: 'host')
- **👥 Guests** - Episode guests → `person` + `episode_person` tables (role: 'guest')  
- **💰 Sponsors** - Sponsoring companies → `company` + `episode_company` tables (mention_type: 'sponsor')
- **🎬 Producers** - Show producers → `person` + `episode_person` tables (role: 'producer')
- **🏷️ Topics** - Discussion topics → `topic` + `episode_topic` tables
- **🏢 Companies** - Mentioned companies → `company` + `episode_company` tables (mention_type: 'mentioned')
- **📚 Books** - Referenced books → `book` + `episode_book` tables
- **📍 Locations** - (Available but not stored yet)
- **🛍️ Products** - (Available but not stored yet)

### Data Source

✅ **Podscan's pre-processed ML analysis** - their models extract entities from transcripts  
❌ **Not our AI SDK** - we consume their already-extracted structured data

## Complete Workflow

1. **`fetch-categories`** - Populate all Podscan categories
2. **`fetch-episodes`** - Get episode metadata, transcripts, word timestamps, and link categories ⭐ **Use `--all` for complete data**
3. **`fetch-entities`** - Extract all entities and create relationships

### Example Full Pipeline

```bash
# Setup foundational data
pnpm fetch-categories your_token

# Get ALL episode data with transcripts and word timestamps (recommended)
pnpm fetch-episodes pd_k42yajryg3n5p8ow your_token --all

# Extract entities and build relationships
pnpm fetch-entities --all your_token
```

### ✨ What's Included Now

The updated `fetch-episodes` script automatically fetches:
- 📝 **Full transcripts** 
- ⏱️ **Word-level timestamps** (stored in `episode_word_timestamp` table)
- 🏷️ **Categories** (linked via junction table)
- 📊 **Episode metadata**
- 🔗 **All relationships**

### Pagination Options

- **Single page:** Good for testing or getting recent episodes
- **Specific page:** Useful for resuming interrupted fetches  
- **All pages (`--all`):** ⭐ **Recommended** for complete podcast data

## Updated Schema

### New Tables Added:
- **`episode_segment`** - Stores transcript segments with metadata (temperature, confidence, etc.)
- **`episode_word_timestamp`** - Stores individual word timestamps linked to segments for precise search and analysis

This streamlined 3-step pipeline will populate **all tables** and create a comprehensive podcast knowledge graph with word-level precision! 🎯