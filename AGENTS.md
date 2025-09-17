# Agent Guidelines for CWP

## Build/Lint/Test Commands
- `pnpm lint` - Run Biome linter and checker
- `pnpm format` - Format code with Biome
- No test runner configured - check with user if tests needed

## Code Style Guidelines
- **Formatting**: 2-space indentation, Biome formatter enforced
- **Imports**: Use `@/` path alias for src/, organize imports automatically
- **Types**: Use TypeScript with explicit types, `type` imports for type-only
- **Components**: Export named functions, use `React.ComponentProps` for props
- **Naming**: camelCase variables, PascalCase components, kebab-case files
- **Error Handling**: Use Zod for validation, React Hook Form for forms
- **File Structure**: Components in `/components/ui/`, pages in `/app/`

## Framework Specifics
- Next.js 15 with App Router and Turbopack
- React 19 with modern patterns
- Biome for linting/formatting (not ESLint/Prettier)

## Styling/UI Guidelines
- Use Tailwind CSS and shadcn/ui
- Never use hardcoded colors, use shadcn tokens from ./src/globals.css
- Never use shadcn card as component
