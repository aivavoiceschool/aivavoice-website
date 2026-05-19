# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Marketing website for AivaVoice, a vocal school in Dnipro, Ukraine. Bilingual (Ukrainian default, English), built with Astro 6 + Tailwind CSS 4, deployed as a Cloudflare Worker.

## Commands

```sh
npm run dev       # local dev server at localhost:4321
npm run build     # production build to ./dist/
npm run preview   # preview the build locally
npm run astro check   # type-check .astro files and TS
```

Requires Node >= 22.12.0. There is no test suite or linter — `astro check` is the only static verification.

## Architecture

### Bilingual routing

Every page exists twice: Ukrainian at the site root (`/about/`) and English under `/en/` (`/en/about/`). Both route files in `src/pages/` are **thin wrappers** that import the *same* shared component from `src/components/pages/`:

```
src/pages/about/index.astro      -> imports AboutPage.astro
src/pages/en/about/index.astro   -> imports AboutPage.astro
```

The shared component detects the language itself — never pass language as a prop. The pattern in every page component and in `BaseLayout`/`Header`:

```js
const lang = getLangFromUrl(Astro.url);  // reads first path segment, 'en' or default 'uk'
const i = t(lang);                        // returns the translation object
```

When adding a new page, create the component in `src/components/pages/`, then add **both** wrapper routes (`src/pages/<name>/index.astro` and `src/pages/en/<name>/index.astro`). Exception: `/privacy/` currently has only the Ukrainian route — there is no `/en/privacy/`.

### i18n (`src/i18n/`)

- `uk.ts` is the source of truth — it exports the `Translations` type via `typeof`. `en.ts` must mirror its key structure: a missing key does **not** fail `astro build`, but the English page renders empty at runtime (the component dereferences an undefined key). Keep the two files structurally in sync whenever `uk.ts` changes.
- `index.ts` exposes `t(lang)`, `getLangFromUrl(url)`, `localizedPath(path, lang)`, `defaultLang` (`'uk'`), and `languages`.
- `localizedPath('/about/', lang)` returns `/about/` for `uk` and `/en/about/` for `en`. Always use it for internal links so the language prefix is correct.
- All user-facing copy lives in the translation files, not in components.

### Contact form → Telegram

`ContactPage.astro` and the modal form in `Footer.astro` both post JSON to `src/pages/api/contact.ts`. That endpoint has `export const prerender = false` (it runs as a Cloudflare Worker even though the site is otherwise `output: 'static'`) — this is why the Cloudflare adapter is required; without it `astro build` fails with `NoAdapterInstalled`. The endpoint:

1. Validates name/phone.
2. Optionally verifies a Cloudflare Turnstile token (only if `TURNSTILE_SECRET_KEY` is set; Turnstile widget is currently commented out in `ContactPage.astro`).
3. Sends a formatted message to a Telegram chat via the Bot API.

Secrets are read from the Cloudflare runtime via `import { env } from 'cloudflare:workers'` (typed in `src/env.d.ts`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TURNSTILE_SECRET_KEY`. These are configured in the Cloudflare dashboard (the Worker's Variables and Secrets settings), not in any file in the repo.

### Layout, styling, analytics

- `BaseLayout.astro` wraps every page: it renders `<head>` (meta/OG tags, canonical URL, fonts), `Header`, `Footer`, the GA4 tag, and global client scripts.
- Global scripts in `BaseLayout` handle: scroll-reveal (`IntersectionObserver` adds `.visible` to `.reveal` elements), the header scroll shadow, and delegated GA4 click tracking for `tel:`/Viber/Telegram/Instagram links.
- Styling is Tailwind 4 (configured via the `@tailwindcss/vite` plugin — there is no `tailwind.config.js`). `src/styles/global.css` defines the theme in an `@theme` block (custom `forest`/`gold`/`cream` color scale, `font-heading`/`font-body`) and component classes (`.btn-gold`, `.btn-outline`, `.section-label`, `.section-title`, `.reveal`). Reuse these classes rather than re-deriving styles.
- `BaseLayout.astro` loads both Google Tag Manager (`GTM-MFFS8SQN`) and a GA4 gtag (`GT-P36VBGFC`); both IDs are hardcoded there.

### Deployment

Deployed as a Cloudflare **Worker** named `aivavoice-website` (not a Pages project), built by the `@astrojs/cloudflare` adapter (`astro.config.mjs`). `astro build` produces `dist/client` (static assets) + `dist/server` (the Worker); the adapter also generates `dist/server/wrangler.json` and `.wrangler/deploy/config.json`, so `wrangler` commands run from the repo root pick up the right config automatically. `wrangler.jsonc` holds the Worker `name`, `account_id`, `compatibility_date`, and the `SESSION` KV binding.

Pushing to `main` triggers a Workers Builds (Git-integration) deploy. To deploy a tested build manually without touching production: `npx wrangler versions upload` (returns a preview URL), then `npx wrangler versions deploy <version-id>@100 -y`.

`public/_headers` and `public/_redirects` use Cloudflare's static-asset syntax — **relative paths only** (the Workers parser rejects absolute URLs). Host/scheme redirects (`www`→apex, `http`→`https`) are therefore NOT in `_redirects`; they live in Cloudflare zone config (a Page Rule plus the "Always Use HTTPS" setting). `@astrojs/sitemap` generates the sitemap. The committed lockfile is `package-lock.json` (npm).

`compatibility_date` in `wrangler.jsonc` must be no newer than the `workerd` build inside the installed `miniflare` — if `npm run dev` fails with "This Worker requires compatibility date ... but the newest date supported by this server binary is ...", lower it to the date the error reports (or update `miniflare`/`wrangler`).
