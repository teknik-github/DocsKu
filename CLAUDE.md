# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

The package manager is pnpm (pinned via `packageManager` in `package.json`).

- `pnpm dev`: dev server at http://localhost:3000 (`pnpm dev -H 0.0.0.0` to expose it on the network)
- `pnpm build` / `pnpm start`: production build and server. The build prerenders docs pages from the database, so PostgreSQL must be running.
- `pnpm lint`: ESLint (flat config in `eslint.config.mjs`, using `eslint-config-next` core-web-vitals + typescript)
- Type-check: `pnpm exec tsc --noEmit`
- Database: `pnpm db:up` (docker compose, Postgres on 127.0.0.1:5491), `pnpm db:generate` (migration from `db/schema.ts` into `db/migrations/`), `pnpm db:migrate`, `pnpm db:seed [--force]`, `pnpm db:studio`

- Production: `pnpm prod:deploy` (`deploy/deploy.sh`) starts Postgres, runs the `migrate` service (drizzle-kit, `migrator` stage), builds the `runner` image, and starts `app` on `127.0.0.1:${APP_PORT:-3020}` (`docker-compose.prod.yml` layered on `docker-compose.yml`, settings in `.env.production`). There is no bundled reverse proxy; the owner's own proxy terminates HTTPS, hence `TRUST_PROXY=1`. The image build uses host networking and the `default` builder, because `next build` (standalone output) prerenders from the database at `127.0.0.1:5491`. `.dockerignore` excludes `.env*`, since `next build` would read them into the image. The container runs as uid 10001 (no host account) with `storage/uploads` bind-mounted. `GET /api/health` checks the DB.

Env: `.env` holds `POSTGRES_PASSWORD` for docker compose. `.env.local` holds `DATABASE_URL`, `CRON_SECRET`, `UPLOAD_DIR`, and `ENCRYPTION_KEY` (optionally `AI_API_KEY`, `SITE_URL`, `TRUST_PROXY`, `SCHEDULER_URL`). See `.env.example`.

There is no test framework. Changes have been verified with ad-hoc Playwright scripts.

## Stack and architecture

This is a documentation site styled after platform.claude.com/docs, with a Ghost-like dashboard at `/admin`. It runs on **Next.js 16.4 / React 19.3** (App Router), with PostgreSQL through Drizzle ORM (`db/`) and a TipTap v3 block editor. There is no `src/` directory, and `@/*` maps to the repo root. UI text and sample content are in Indonesian.

### Content model

- Page bodies are **TipTap/ProseMirror JSON** (`jsonb`), not Markdown. Custom block nodes are `callout`, `cardGroup`/`card`, `steps`/`step`, `tabs`/`tab`, `codeGroup`, and `accordion`, and `codeBlock` carries extra `title`/`highlight`/`lineNumbers` attributes. A new block type has to be added in three places: the editor node (`components/admin/editor/nodes.tsx`), the public renderer (`lib/content/render.tsx`), and the Markdown export (`lib/content/markdown.ts`).
- Each `pages` row holds two copies. The **live** columns (`title`/`description`/`content`) are what visitors see. The **working copy** (`draftTitle`/`draftDescription`/`draftContent`) is what the editor autosaves. Publishing copies working → live, and `hasChanges` flags unpublished edits. Statuses are `draft`, `scheduled`, and `published`.
- Navigation and site settings are JSON in the `settings` table (keys `navigation` and `site`; types in `lib/site-types.ts`). Navigation refers to pages by id. `lib/data/site.ts` resolves it into tabs that contain only published pages, so a page must be published **and** listed in navigation to appear in the sidebar and search.
- The home page (`/`) is the single `pages` row with `kind = 'home'` (slug `_home`, at most one by a partial unique index). `/admin/home` creates it as a draft from `lib/content/home-template.ts` on first use. Until it is published, `app/(site)/page.tsx` renders the built-in `BuiltInHome`. Docs queries filter `kind = 'doc'`. The `hero` block (only offered in the home editor) renders through `components/blocks/hero.tsx`, and `.prose-home` styles `##` headings as home sections.
- `db/seed/run.mts` converts the sample MDX in `db/seed/docs/` into TipTap JSON (`db/seed/mdx-to-doc.ts`). Those files are seed data only and are not read at runtime.

### Rendering and caching

- Public reads in `lib/data/site.ts` are `"use cache"` with `cacheLife("max")` and tags `pages`, `navigation`, and `settings`. Dashboard server actions call `updateTag(...)`. The scheduler route uses `revalidateTag(tag, { expire: 0 })`, because `updateTag` only works in server actions. Writing to the DB outside the app (for example `db:seed`) leaves the in-memory cache stale until the server restarts.
- Code blocks are highlighted server-side with Shiki in `lib/content/highlight.ts`, using dual light/dark themes styled by `.code-block` CSS. The TOC ids come from `headingIds()` in `lib/content/doc.ts`, which the renderer consumes in the same order.
- Routes: `app/(site)/` is the public site (its layout loads settings, navigation, and the search index). `app/admin/(auth)` holds login and first-run setup, `app/admin/(panel)` holds the dashboard shell and pages, and `app/admin/(editor)/pages/[id]` is the full-screen editor. `app/(site)/preview/[id]` is the signed-in draft preview. `app/media/[file]` serves uploads, `app/admin/api/media` handles upload and listing, and `app/api/internal/publish-scheduled` is ticked every minute by `instrumentation.ts`.

### AI Write

- AI Write talks to any OpenAI-compatible chat API, with DeepSeek as the default (`https://api.deepseek.com`, models `deepseek-flash` / `deepseek-v4-pro`). Settings live in `settings` under key `ai`, and the API key is encrypted with AES-256-GCM using `ENCRYPTION_KEY` (`lib/crypto.ts`). `AI_API_KEY` in env overrides the stored key, which is never sent to the client.
- `app/admin/api/ai/route.ts` streams NDJSON events (`text` / `thinking` / `error`) from `lib/ai/client.ts`, with prompts built server-side in `lib/ai/prompts.ts`. DeepSeek thinking mode is enabled by default upstream, so requests send `thinking: { type: "disabled" }` unless the setting is turned on. `reasoning_content` is never shown.
- Editor side (`components/admin/editor/ai-*.tsx`): the result is previewed as plain text, then converted from Markdown to HTML with `marked` (raw HTML escaped) and inserted with `insertContentAt`. The target range is remapped through every transaction while the panel is open.

### AI Chat (agent)

- `lib/ai/agent.ts` runs a tool-calling loop (max 6 model turns) through `streamAgentTurn`. Read tools (`search_pages`, `read_page`, `get_site_structure`) execute on the server. The proposal tools (`propose_new_page`, and `propose_page_edit` when a page is open) never write anything: they emit a proposal whose Markdown/MDX is converted to TipTap JSON by `lib/content/mdx-to-doc.ts` (falling back to plain Markdown if the MDX is invalid).
- Conversations are stored per user in `ai_conversations` (`lib/ai/conversations.ts`, actions in `app/admin/_actions/chat.ts`). `app/admin/api/agent/route.ts` owns persistence: it saves the user message, runs the agent, and stores the reply (text, tool labels, proposals, token usage) even if the stream is cut off, while streaming `AgentEvent` NDJSON. The UI is `components/admin/ai-chat.tsx` (`layout="panel"` beside the editor, showing that page's chats; `layout="page"` at `/admin/ai`, with a history column). It includes a per-chat model picker (`listChatModels`) and rename/delete. Applying an edit saves a revision first. "Buat draf" calls `createDraftFromProposal`, which re-converts the Markdown on the server. Chat Markdown is rendered with raw HTML escaped and unsafe link/image URLs removed.
- Auto-compaction: when the history to send exceeds `COMPACT_AT_CHARS`, everything but the last `KEEP_RECENT` messages is summarised into `summary` / `compactedCount`. Only the summary (in the system prompt) and the newer messages are sent; the UI still shows the full transcript with a divider. `compactConversation` forces it.
- Token savings: the agent's system prompt holds only fixed instructions plus the summary, and the editor's page context is prepended to the **latest** user message only. That way the prompt prefix (tools, system, older history) is byte-identical between requests and hits DeepSeek/OpenAI prompt caching. `stream_options.include_usage` reports usage, including cache hits (`Usage` in `lib/ai/client.ts`, shown under each reply). AI Write also has an in-memory answer cache (`lib/ai/response-cache.ts`, 1 h, keyed by model, settings, and prompt). `fresh: true` bypasses it ("Coba lagi", description).
- The AI settings model field auto-detects models through `GET {baseUrl}/models` (`fetchAiModels`), with manual entry as a fallback.

### Automation

`lib/automation.ts` runs when a person publishes or schedules a doc page (`publishWorkingCopy` in `app/admin/_actions/pages.ts`, shared by `publishPage` and `createDraftFromProposal`). Switches live in settings key `automation` (`AutomationSettings`, defaults `DEFAULT_AUTOMATION` in `lib/data/site.ts`, form under Pengaturan → Otomatisasi). `prepareForPublish` makes one AI request (`completeChat`, JSON reply, 25 s timeout, silently skipped if AI is off or fails) for a missing description and meta title/description, and on a first publish for the navigation section. It also swaps a placeholder `tanpa-judul…` slug for one from the title (`lib/slug.ts`). `pages.navSection` holds the editor's choice: a section id, `"none"`, or null (AI or the first section decides). The first publish appends the page to that section with `addToNavigation`, and the scheduler route does the same when a scheduled page goes live. Re-publishing never touches the navigation. The publish result's `filled` tells the editor what changed (shown as the "Otomatis:" banner). The agent still never publishes. Its `propose_new_page` takes `section` and `publish_at` (the latest user message carries the current WIB time), and the chat offers "Buat & jadwalkan" / "Buat & terbitkan" / "Buat semua & jadwalkan", which run only when clicked. Bulk apply awaits each `updateProposal`, because every call rewrites the stored chat. Generated covers come from `app/cover/[...slug]/route.tsx` (`next/og`, published pages only), rendered per `?shape=` (`card` 16:10, `wide` 2.2:1, default 1200×630 for OG) so `object-cover` never crops their text. Use `generatedCover(slug, shape, color)` for the place the image is shown. The colour (`automation.coverColor`: preset id, `"mixed"`, or `#rrggbb`, palette and contrast logic in `lib/cover-palette.ts`) is read from settings by the route and sits in the URL only to bust browser caches. `getPageCards` and the doc page's OG image fall back to them when `automation.cover` is on.

### SEO

Pages carry `seo` / `draftSeo` (`PageSeo`: title, description, image, noindex), which follow the same draft→publish flow and revisions. `lib/seo.ts` builds Next metadata (a custom meta title is `absolute`, with no site suffix). Set `SITE_URL` so relative OG images such as `/media/...` resolve.

### Docs themes

`site.layout` (`DocsLayout`: `docs` | `hybrid` | `ghost`, default `docs`) picks how `/docs` looks. Admins set it under **Tema** (`/admin/theme`, `components/admin/theme-picker.tsx`, action `saveTheme`). `saveSiteSettings` leaves it alone. `docs` is the sidebar layout. `hybrid` shows a card hub per section, a centred article with breadcrumb and "Di bagian ini", and dropdown tabs in the header. `ghost` shows a hero, `?topik=` chips (`topicSlug` in `lib/navigation.ts`), a grid with featured pages first, and a blog-style article with "Tulisan lain". The branching happens in `app/(site)/docs/layout.tsx` (sidebar only for `docs`), `docs/page.tsx`, `docs/[...slug]/page.tsx`, `preview/[id]/page.tsx`, and `components/site-header.tsx`. Views live in `components/publication/`, and card data comes from `getPageCards()`. To add a theme, extend `DocsLayout`, the zod enum in `app/admin/_actions/site.ts`, `LAYOUTS` in the picker, and those branches.

Pages also have `coverImage` / `draftCoverImage` (draft→publish, stored in revisions; picked above the title in the editor) and `featured`, which applies immediately through `setFeatured` and is not part of the draft. Cards without a cover show a generated gradient (`CoverArt`).

### Auth

Sessions live in the DB. The cookie `docsku_session` holds a random token, and the `sessions.id` column stores its SHA-256. Passwords use scrypt (`lib/auth/`). `lib/auth/dal.ts` is the data access layer, and every admin page and server action calls `requireUser` / `requireAdmin` / `authorize` itself, because layouts are not a security boundary. Roles: `admin` can do everything; `editor` can work with pages and media but not navigation, settings, or users.

There is no `proxy.ts`. Every `/admin/api/*` route handler calls `isSameOrigin` (`lib/auth/request.ts`) before anything else; server actions get Next's own origin check. Forwarded headers (`X-Forwarded-For`/`-Host`) are trusted only with `TRUST_PROXY=1`, so failed logins are limited per account (10 per 15 min) and, behind a trusted proxy, also per IP (in-memory, `lib/auth/rate-limit.ts`). Security headers (`frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS when `x-forwarded-proto: https`) come from `headers()` in `next.config.ts`; `/media/*` gets `default-src 'none'` through a later rule, because a later rule replaces the same header key. The scheduler only calls its own `PORT` (or `SCHEDULER_URL`), never a guessed port.

### Gotchas

- Block drag-and-drop is custom (`components/admin/editor/block-handle.tsx`), because the official TipTap drag handle imports Yjs collaboration packages. A plugin reports the hovered top-level block through a small pub/sub bus, so the editor doesn't re-render on every mouse move. Drops are handled in `handleDrop` (upper half of a block inserts before it, lower half after) with a custom drop line. Keyboard shortcuts are Alt+↑/↓.
- The editor uses `enableContentCheck`. If a stored document contains a node type the editor doesn't know, it locks read-only and never autosaves, because otherwise TipTap would replace the document with an empty one. Register every new node in the `extensions` list of `page-editor.tsx`.
- Server action arguments drop objects with a null prototype, and ProseMirror creates node `attrs` that way. Always send `JSON.parse(JSON.stringify(editor.getJSON()))` (`docJSON` in `page-editor.tsx`).
- React 19 resets forms after an action runs, so server actions return the submitted `values` (see `keepValues` in `lib/validation.ts`) and inputs use them as `defaultValue`.
- Files with `"use server"` may only export async functions. Shared zod schemas and types live in `lib/validation.ts`.
- Dynamic admin pages keep the page component synchronous and put `requireUser()`, `searchParams`, and DB reads in an async child under `<Suspense>`. Without that, the dev overlay reports an "uncached data outside Suspense" error. `app/admin/layout.tsx` sets `instant = false`.
- Use SQL `now()` instead of `new Date()` in queries that run while rendering. Cache Components rejects `new Date()` during prerender.
- Next 16 blocks dev assets for non-localhost origins. `next.config.ts` adds the machine's IPs and `DEV_ORIGINS` to `allowedDevOrigins`.

Per `AGENTS.md`, the bundled docs in `node_modules/next/dist/docs/` (`01-app/` for the App Router) are the source of truth for Next.js APIs. Read them instead of relying on prior knowledge.

`next.config.ts` turns on several non-default behaviors that affect how code must be written:

- **`cacheComponents: true`**: Data is uncached by default. Cache async functions and components explicitly with the `"use cache"` directive (plus `cacheLife`/`cacheTag` from `next/cache`). Uncached async work (DB queries, `cookies()`, `headers()`, `params`, `searchParams`) must sit inside a `<Suspense>` boundary. `dynamicParams` is not allowed, so call `notFound()` instead, and `generateStaticParams` must return at least one param. See `01-getting-started/08-caching.md` and `02-guides/migrating-to-cache-components.md`.
- **`partialPrefetching: true`**: `<Link>` prefetches only the route's static/cached "App Shell". URL-dependent data goes behind Suspense, and sidebar links use `<Link prefetch={true}>`. See `02-guides/adopting-partial-prefetching.md`.
- **`reactCompiler: true`**: The React Compiler auto-memoizes components, so manual `useMemo`/`useCallback`/`memo` are usually unnecessary.
- **Tailwind CSS v4 via Turbopack**: Tailwind is wired through a `turbopack.rules` loader (`@tailwindcss/turbopack`) for `*.css` instead of PostCSS, and there is no `postcss.config` or `tailwind.config`. Theme tokens are CSS variables in `app/globals.css` (`:root` / `.dark`) exposed through `@theme inline` (`bg-page`, `text-fg-muted`, `border-line`, `text-accent`, …).

Route props use Next's globally generated helper types (`PageProps<"/docs/[...slug]">`, `LayoutProps<"/">`, `RouteContext<"/media/[file]">`), generated into `.next/types`.
