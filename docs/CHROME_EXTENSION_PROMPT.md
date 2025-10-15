# Chrome Extension Implementation Prompt

Give this exact prompt to the developer working on the Chrome extension repository:

---

## Task: Implement tRPC Client for Framebreak Intelligence API

### Context

The main Framebreak Intelligence app has exported a type-safe API package `@framebreak/api-types` that contains the `AppRouter` type. This gives you full TypeScript autocomplete and type checking for all API endpoints.

The API uses better-auth for authentication, and your Chrome extension origin is already whitelisted in the trusted origins.

### Installation

```bash
npm install @trpc/client @trpc/tanstack-react-query @tanstack/react-query
```

Then install the types package (choose one method):

**Option A: Published npm package**
```bash
npm install @framebreak/api-types
```

**Option B: GitHub Packages (if private)**
```bash
# Add .npmrc:
# @your-org:registry=https://npm.pkg.github.com
npm install @framebreak/api-types
```

**Option C: npm link (for local development)**
```bash
# In framebreak-intelligence/packages/api-types
npm link

# In your chrome-extension repo
npm link @framebreak/api-types
```

### Implementation

#### 1. Create `src/lib/trpc-client.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@framebreak/api-types';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function createTRPCClientInstance() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'https://framebreak-intelligence.vercel.app/api/trpc',
        credentials: 'include',
      }),
    ],
  });
}
```

#### 2. Create `src/components/trpc-provider.tsx`

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { TRPCProvider, makeQueryClient, createTRPCClientInstance } from '../lib/trpc-client';

export function TRPCProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());
  const [trpcClient] = useState(() => createTRPCClientInstance());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

#### 3. Wrap Your App Root

```typescript
import { TRPCProviders } from './components/trpc-provider';

function App() {
  return (
    <TRPCProviders>
      {/* Your extension UI components */}
    </TRPCProviders>
  );
}

export default App;
```

#### 4. Use in Components

```typescript
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc-client';

function CreateFlashcardButton() {
  const trpc = useTRPC();

  const createFlashcard = useMutation(
    trpc.flashcards.createStandalone.mutationOptions()
  );

  const handleCreate = () => {
    createFlashcard.mutate(
      {
        front: 'Question/Statement',
        back: 'Answer/Details',
        source: 'https://example.com/source-url',
        tags: ['optional', 'tags'],
      },
      {
        onSuccess: (data) => {
          console.log('Flashcard created with ID:', data.id);
        },
        onError: (error) => {
          console.error('Failed to create flashcard:', error.message);
        },
      }
    );
  };

  return (
    <button onClick={handleCreate} disabled={createFlashcard.isPending}>
      {createFlashcard.isPending ? 'Creating...' : 'Create Flashcard'}
    </button>
  );
}
```

### API Endpoint: `flashcards.createStandalone`

**Input Schema:**
```typescript
{
  front: string;        // 1-500 chars - Question/Statement
  back: string;         // 1-5000 chars - Answer/Details
  source: string;       // 1-500 chars - Source URL or description
  tags?: string[];      // Optional array of tag strings
}
```

**Output Schema:**
```typescript
{
  id: string;           // Created flashcard ID
}
```

**Validation:**
- All required fields must be non-empty after trimming
- `front` max 500 characters
- `back` max 5000 characters
- `source` max 500 characters
- Returns `BAD_REQUEST` error with Zod validation details on invalid input
- Returns `UNAUTHORIZED` error if user not authenticated

### Authentication

The API requires a valid better-auth session. Ensure:
1. User is signed in via better-auth before making API calls
2. Session cookies are automatically included with `credentials: 'include'`
3. Handle `UNAUTHORIZED` errors by prompting user to sign in

### Type Safety Benefits

You get full autocomplete and type checking:

```typescript
const trpc = useTRPC();

// ✅ TypeScript knows all available endpoints
trpc.flashcards.createStandalone
trpc.flashcards.list
trpc.flashcards.update
// ... etc

// ✅ Input validation at compile time
createFlashcard.mutate({
  front: 'Question',
  back: 'Answer',
  source: 'URL',
  wrongField: 'error' // ❌ TypeScript error!
});

// ✅ Output type is known
createFlashcard.data?.id // string | undefined
```

### Troubleshooting

**Type errors about AppRouter:**
- Ensure `@framebreak/api-types` is installed
- Run `npm install` to refresh
- Check import path is correct

**UNAUTHORIZED errors:**
- User must be signed in with better-auth
- Check session cookies are being sent
- Verify extension has proper host permissions

**CORS errors:**
- Chrome extension origin is already whitelisted
- Check `manifest.json` has `host_permissions` for API domain

### Complete Example

```typescript
// src/features/create-flashcard.tsx
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc-client';
import { useState } from 'react';

export function CreateFlashcardForm() {
  const trpc = useTRPC();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [source, setSource] = useState('');

  const createFlashcard = useMutation(
    trpc.flashcards.createStandalone.mutationOptions()
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    createFlashcard.mutate(
      { front, back, source },
      {
        onSuccess: (data) => {
          console.log('Created:', data.id);
          setFront('');
          setBack('');
          setSource('');
        },
        onError: (error) => {
          alert(`Error: ${error.message}`);
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Question"
        required
        maxLength={500}
      />
      <textarea
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Answer"
        required
        maxLength={5000}
      />
      <input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Source URL"
        required
        maxLength={500}
      />
      <button type="submit" disabled={createFlashcard.isPending}>
        {createFlashcard.isPending ? 'Creating...' : 'Create Flashcard'}
      </button>
    </form>
  );
}
```

### Testing

Test the integration:
1. Ensure user is authenticated
2. Call the `createStandalone` mutation
3. Verify flashcard is created and ID is returned
4. Check error handling for validation and auth errors
5. Verify TypeScript autocomplete works in your IDE

---

That's it! You now have a fully type-safe tRPC client that stays in sync with the API automatically.
