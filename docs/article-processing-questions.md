# Article Processing - Questions for Usman

Before we build article/blog post processing, we need to understand the concrete use case and constraints.

## Core Use Case

### 1. Discovery & Input
- **How do you find articles to process?**
  - [ ] Manually paste URLs as you find them (Twitter, HN, email newsletters)?
  - [ ] Subscribe to RSS feeds from blogs you follow?
  - [ ] Import from read-it-later services (Pocket, Instapaper, Readwise)?
  - [ ] Browser extension to save while browsing?

- **What sources are you reading?**
  - [ ] AI research blogs (Anthropic, OpenAI, etc.)?
  - [ ] Substack newsletters?
  - [ ] Academic papers (arXiv)?
  - [ ] News sites?
  - [ ] Personal blogs?
  - Example URLs would be helpful

### 2. Volume & Frequency
- **How many articles per week?**
  - [ ] 1-5 articles (manual is fine)
  - [ ] 5-20 articles (need some automation)
  - [ ] 20+ articles (definitely need RSS/automation)

- **When do you want them processed?**
  - [ ] Immediately when I submit URL
  - [ ] Daily batch like podcasts
  - [ ] Doesn't matter

### 3. User Experience

- **How do you want to interact with processed articles?**
  - [ ] Mixed in with podcast signals in daily feed
  - [ ] Separate "Articles" section
  - [ ] Only in chat/RAG (don't need a feed view)
  - [ ] All saved articles in one searchable archive

- **What makes an article "interesting" vs a podcast segment?**
  - Is the criteria different? 
  - Are you looking for different things in articles vs podcasts?

### 4. Features & Scope

- **What do you want to do with articles?**
  - [ ] Get daily signals/highlights (like podcasts)
  - [ ] Full-text search across all articles
  - [ ] Chat/ask questions about content
  - [ ] Just archive for later RAG retrieval
  - [ ] Tag/organize by topic

- **Do you need the original formatting preserved?**
  - [ ] Yes - code blocks, images, etc.
  - [ ] No - plain text is fine

- **Paywalled content?**
  - Do you have subscriptions you want to process?
  - Need to handle login/authentication?

## Technical Constraints

### 5. Content Types
- **Are these all web articles or also:**
  - [ ] PDFs?
  - [ ] YouTube transcripts?
  - [ ] Twitter threads?
  - [ ] Email newsletters (forwarded)?

### 6. Prior Art
- **Have you used similar tools?**
  - Readwise Reader?
  - Matter?
  - Instapaper?
  - What did you like/dislike about them?

## Validation Questions

### 7. The Real Problem
- **What problem are you solving?**
  - "I read interesting articles but forget about them"
  - "I want to connect ideas across articles and podcasts"
  - "I need to research topics and want all my content searchable"
  - "I want AI to surface relevant past reading based on current work"

- **How do you currently handle this?**
  - Bookmarks?
  - Note-taking app?
  - Nothing - just lose the content?

### 8. Success Criteria
- **How will you know this feature is working?**
  - Specific use case: "When I'm researching X, I want to find that article I read about Y"
  - Frequency: "I do this multiple times per week"
  - Current pain: "Right now I can't do this at all / it takes 20 minutes of searching"

## Recommendation Path

Based on your answers, we'll recommend one of these approaches:

**Path A: Manual URL Processing (Simplest)**
- Good if: <10 articles/week, immediate processing, just want RAG/search
- Build: URL input → text extraction → chunk/embed → done
- Time: 1-2 hours

**Path B: RSS Subscription (More Automated)**  
- Good if: 10+ articles/week, specific blogs you follow, want daily batches
- Build: Add "article feeds" alongside podcast feeds, reuse daily pipeline
- Time: 4-6 hours

**Path C: Rich Archive (Full Featured)**
- Good if: Need organizing, tagging, separate UI, full content management
- Build: New content type, dedicated pages, full CRUD
- Time: 8-12 hours

---

## Next Steps

After answering these questions, we'll:
1. Pick the right approach
2. Build a minimal version to validate
3. Test with real articles you want to process
4. Iterate based on actual usage

**Most important: Give us 3-5 specific article URLs you want processed and what you'd want to do with them. That will tell us everything.**
