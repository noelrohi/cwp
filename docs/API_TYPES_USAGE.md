# Using @framebreak/api-types in Chrome Extension

This guide shows how to use the `@framebreak/api-types` package in your Chrome extension for type-safe API calls.

## Package Structure

```
packages/api-types/
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript config
├── index.ts          # Exports AppRouter type
└── README.md         # Usage documentation
```

## Installation Options

### Option 1: Publishing to npm (Recommended for Production)

1. **Publish the package:**
   ```bash
   cd packages/api-types
   npm publish --access public  # or --access restricted for private
   ```

2. **Install in Chrome extension:**
   ```bash
   npm install @framebreak/api-types
   # or
   pnpm add @framebreak/api-types
   ```

### Option 2: GitHub Packages (Private Repo)

1. **Update `packages/api-types/package.json`:**
   ```json
   {
     "name": "@your-github-username/api-types",
     "publishConfig": {
       "registry": "https://npm.pkg.github.com"
     }
   }
   ```

2. **Publish:**
   ```bash
   cd packages/api-types
   npm publish
   ```

3. **Install in Chrome extension with `.npmrc`:**
   ```
   @your-github-username:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
   ```

### Option 3: Local Monorepo (Development)

If both projects are in the same monorepo:

```json
{
  "dependencies": {
    "@framebreak/api-types": "workspace:*"
  }
}
```

### Option 4: npm Link (Quick Dev Testing)

```bash
# In framebreak-intelligence/packages/api-types
npm link

# In chrome-extension
npm link @framebreak/api-types
```

## Chrome Extension Setup

### 1. Install Dependencies

```bash
npm install @trpc/client @trpc/tanstack-react-query @tanstack/react-query @framebreak/api-types
```

### 2. Create tRPC Client (`src/lib/trpc-client.ts`)

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

### 3. Create Provider (`src/components/trpc-provider.tsx`)

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

### 4. Wrap Your App

```typescript
import { TRPCProviders } from './components/trpc-provider';

function App() {
  return (
    <TRPCProviders>
      {/* Your extension UI */}
    </TRPCProviders>
  );
}
```

### 5. Use in Components

```typescript
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc-client';

function CreateFlashcard() {
  const trpc = useTRPC();

  const createFlashcard = useMutation(
    trpc.flashcards.createStandalone.mutationOptions()
  );

  const handleCreate = () => {
    createFlashcard.mutate({
      front: 'Question text',
      back: 'Answer text',
      source: 'https://example.com',
      tags: ['tag1', 'tag2'], // optional
    }, {
      onSuccess: (data) => {
        console.log('Created flashcard:', data.id);
      },
      onError: (error) => {
        console.error('Error:', error.message);
      }
    });
  };

  return (
    <button onClick={handleCreate} disabled={createFlashcard.isPending}>
      {createFlashcard.isPending ? 'Creating...' : 'Create Flashcard'}
    </button>
  );
}
```

## Example: Complete Chrome Extension Prompt

Here's the complete prompt to give to your Chrome extension developer:

---

**Implement tRPC client for Framebreak Intelligence API**

1. Install dependencies:
   ```bash
   npm install @trpc/client @trpc/tanstack-react-query @tanstack/react-query @framebreak/api-types
   ```

2. Follow the setup in `/docs/API_TYPES_USAGE.md` to:
   - Create tRPC client with `useTRPC()` hook
   - Set up providers
   - Use mutations with `useMutation(trpc.*.mutationOptions())`

3. Call `flashcards.createStandalone` endpoint:
   - Input: `{ front: string, back: string, source: string, tags?: string[] }`
   - Output: `{ id: string }`

The API is at `https://framebreak-intelligence.vercel.app/api/trpc` and uses better-auth session cookies (already whitelisted for your Chrome extension).

---

## Type Safety Examples

### Get Input/Output Types

```typescript
import type { inferRouterInputs, inferRouterOutputs } from '@framebreak/api-types';
import type { AppRouter } from '@framebreak/api-types';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

// Get specific mutation types
type CreateFlashcardInput = RouterInput['flashcards']['createStandalone'];
type CreateFlashcardOutput = RouterOutput['flashcards']['createStandalone'];
```

### Full Type-Safe Usage

```typescript
const input: CreateFlashcardInput = {
  front: 'What is TypeScript?',
  back: 'A typed superset of JavaScript',
  source: 'https://typescriptlang.org',
  tags: ['programming', 'typescript'],
};

createFlashcard.mutate(input);
```

## Troubleshooting

### Type Errors

If you get type errors about AppRouter not being found:
1. Ensure `@framebreak/api-types` is installed
2. Check that `pnpm-workspace.yaml` exists (if using monorepo)
3. Run `pnpm install` to refresh workspace links

### Authentication Errors

If you get UNAUTHORIZED errors:
1. User must be signed in via better-auth
2. Session cookies must be included (`credentials: 'include'`)
3. Chrome extension origin must be in trustedOrigins (already configured)

### Network Errors

If requests fail:
1. Check Chrome extension has `host_permissions` for the API domain
2. Verify CORS headers (already configured in main app)
3. Check network tab for actual error responses

## Benefits

✅ **Full TypeScript autocomplete** - IntelliSense for all API endpoints  
✅ **Compile-time validation** - Catch errors before runtime  
✅ **Single source of truth** - Types generated from actual API  
✅ **Auto-sync** - Update API, types update automatically  
✅ **Zero runtime overhead** - Only type definitions, no code  

## Maintenance

When the API changes:
1. Types automatically update from `src/server/trpc/root.ts`
2. Republish the package (if using npm)
3. Update in Chrome extension: `npm update @framebreak/api-types`
4. TypeScript will show any breaking changes
