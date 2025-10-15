# @framebreak/api-types

Shared TypeScript types for Framebreak Intelligence API.

## Usage

```typescript
import type { AppRouter } from '@framebreak/api-types';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'https://framebreak-intelligence.vercel.app/api/trpc',
      credentials: 'include',
    }),
  ],
});

const result = await trpc.flashcards.createStandalone.mutate({
  front: 'Question',
  back: 'Answer',
  source: 'https://example.com',
});
```

## Type Helpers

```typescript
import type { inferRouterInputs, inferRouterOutputs } from '@framebreak/api-types';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

type CreateFlashcardInput = RouterInput['flashcards']['createStandalone'];
type CreateFlashcardOutput = RouterOutput['flashcards']['createStandalone'];
```

This package provides the tRPC router types for type-safe API clients.
