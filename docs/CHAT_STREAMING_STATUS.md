# Chat API - Streaming Status Updates

The Chat API now streams real-time status updates during RAG searches, so users can see what's happening.

## What Gets Streamed

### 1. Transient Status Messages
These appear temporarily in the UI but aren't saved to message history:

```
"Searching your saved content for 'marketing'..."
"Found 5 results"
"Response complete"
```

### 2. Search Results Metadata
Persistent data parts that show in the message:

```typescript
{
  query: "marketing",
  totalFound: 5,
  status: "searching" | "complete"
}
```

## Server-Side Implementation

### Status Updates During Tool Execution

```typescript
// When search starts
writer.write({
  type: "data-status",
  data: {
    message: `Searching your saved content for "${query}"...`,
    type: "info",
  },
  transient: true, // Won't be saved to history
});

// When search completes
writer.write({
  type: "data-status",
  data: {
    message: `Found ${results.length} results`,
    type: "success",
  },
  transient: true,
});
```

### Search Metadata (Persistent)

```typescript
// Starting search (loading state)
writer.write({
  type: "data-searchResults",
  id: "search-1",
  data: { query, totalFound: 0, status: "searching" },
});

// After search completes (reconciliation - updates the same part)
writer.write({
  type: "data-searchResults",
  id: "search-1", // Same ID = update existing part
  data: { query, totalFound: results.length, status: "complete" },
});
```

## Client-Side Usage

### Handling Transient Status

```typescript
const [status, setStatus] = useState<string>("");

const { messages } = useChat<ChatUIMessage>({
  api: "/api/chat",
  onData: (dataPart) => {
    // Only transient parts are available here
    if (dataPart.type === "data-status") {
      setStatus(dataPart.data.message);
      
      // Auto-clear after 3 seconds
      setTimeout(() => setStatus(""), 3000);
    }
  },
});

// Display in UI
{status && (
  <div className="status-banner">
    {status}
  </div>
)}
```

### Rendering Search Metadata

```typescript
{messages.map(message => (
  <div key={message.id}>
    {/* Show search progress */}
    {message.parts
      .filter(part => part.type === "data-searchResults")
      .map((part, index) => (
        <div key={index}>
          {part.data.status === "searching" ? (
            <span>🔍 Searching for "{part.data.query}"...</span>
          ) : (
            <span>✅ Found {part.data.totalFound} results</span>
          )}
        </div>
      ))}
    
    {/* Show text content */}
    {message.parts
      .filter(part => part.type === "text")
      .map((part, index) => (
        <div key={index}>{part.text}</div>
      ))}
  </div>
))}
```

## Example Flow

1. **User asks:** "What did they say about marketing?"

2. **UI shows (transient):** "Searching your saved content for 'marketing'..."

3. **Message part added:** `{ query: "marketing", status: "searching", totalFound: 0 }`

4. **RAG search executes** (~1.1s)
   - Embedding generation: ~700ms
   - Vector search: ~430ms

5. **Message part updated:** `{ query: "marketing", status: "complete", totalFound: 5 }`

6. **UI shows (transient):** "Found 5 results"

7. **LLM generates response** with citations from the 5 results

8. **Transient status:** "Response complete"

## Console Logs

Server logs show the full flow:

```
🚀 [Chat API] POST request received
✅ [Chat API] Authenticated user: 50MVpUIZ...
📨 [Chat API] Received 1 messages
🔧 [Chat API] tRPC caller created
🤖 [Chat API] Initializing UI message stream...
📡 [Chat API] Streaming response...

🔍 [Tool: search_saved_content] Executing...
   Query: "marketing"
   Limit: 5

🔍 [RAG Router: searchSaved] Query: "marketing"
   Embedding generated in 717ms
   Query executed in 431ms
✅ [RAG Router: searchSaved] Found 5 results

✅ [Tool: search_saved_content] Found 5 results in 1149ms
   Top result: #400 The Stubborn Genius of James Dyson (similarity: 0.259)
📤 [Tool: search_saved_content] Returning result with 5 items

✨ [Chat API] Stream finished
   Finish reason: stop
   Tool calls: 1
   Response length: XXX chars
```

## Benefits

1. **Real-time feedback** - Users see progress as search happens
2. **Better UX** - No "black box" waiting period
3. **Debugging** - Easy to see what's happening at each step
4. **Performance visibility** - Users understand why responses take time

## Performance

- Embedding: ~700ms
- Vector search: ~430ms
- **Total RAG query: ~1.1s**
- LLM response: varies by complexity

The streaming status updates make this perceived latency much better for users.
