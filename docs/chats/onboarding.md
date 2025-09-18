1. Orient the user (what’s here?)

Episode explorer (browseable): simple grid/list of ingested podcasts with title, guest, and tags.
System-generated highlights: for each episode, pre-compute ~5 “starter questions” using an LLM:

“What’s Dharmesh’s biggest lesson on SEO?”
“How did HubSpot invent inbound marketing?”
“What’s AEO and why does it matter?”


Display these as clickable chips so the user immediately sees what they can ask.


2. Seed the first query

Auto-suggest in the search box: as soon as the user clicks it, show prompts like:

“Summarize this episode in 3 bullet points”
“What mistakes did the guest say to avoid?”
“What predictions did they make about the future?”


This guides them toward queries your retrieval is guaranteed to answer.


3. Pre-compute value

For each new episode ingested:

Run a script that extracts key claims, “top 3 lessons,” and “1-minute summary.”
Store them as ready-to-serve chunks.
Surface them in onboarding as episode cards with quick actions: “Read key takeaways → Ask your own question.”




4. Personalization hooks (lightweight)

Ask 1 multiple-choice question up front: “What’s your goal?”

Learn from the guest
Explore themes (AI, startups, marketing)
Find actionable tactics


Use their answer to show a curated starter pack (3 suggested episodes + 3 suggested questions). This shrinks the blank space.


5. Progression

Day 1 goal: Get them to ask any question, see citations, and click helpful.
Day 2 goal: Nudge them to save highlights or share a clip (so they see persistent value).
Week 1 goal: Get them back with email / push: “Dharmesh on AEO — did you catch this?” (pull from new ingest).


6. Reduce “what can I ask?” friction

Show a live typing hint: “Try asking: What is AEO?”
Or: “Ask about HubSpot’s early growth story…”
Autocomplete seeded with entities/topics extracted from transcripts.


7. Measure onboarding health
Track:

TTV (time-to-value) = time from signup → first helpful answer.
% of new users who (a) click a starter question, (b) leave feedback.
Average queries in session #1.


🔑 Principle:
Don’t assume new users will know what to type. Treat onboarding like showing off the system’s competence before asking the user to exercise their own curiosity. That way, they’re primed to succeed.

Do you want me to mock up a 1-page onboarding flow wireframe (with episode cards, starter questions, and query box behavior) that you can hand to your developer/designer?
