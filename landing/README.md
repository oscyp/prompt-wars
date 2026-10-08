# Prompt Wars — Landing Page

A standalone, zero-build marketing site for **Prompt Wars**, the competitive AI
prompt-battle game. Pure HTML/CSS/JS — no framework, no build step, no
dependencies — so it deploys to any static host and stays decoupled from the
Expo mobile app.

## Why standalone (not the Expo web build)

A marketing landing page and the app have different jobs: the landing page is
SEO-critical, must load instantly, and changes on a marketing cadence. Keeping it
as flat static files means it can ship to a CDN independently of app releases and
never drags in the React Native web bundle.

## Files

```
landing/
├── index.html          # Arena landing page (semantic HTML + SEO + JSON-LD)
├── arena.css           # Screenshot-free Arena layout and responsive styling
├── arena.js            # Store availability and real launch-notification signup
├── vercel.json         # Extensionless legal URL rewrites
├── .vercelignore       # Excludes non-effective legal drafts and local-only files
├── privacy-policy.html # Static privacy policy for the landing/app legal links
├── terms-and-conditions.html # Static terms of service / AI content policy
├── account-deletion.html # Public in-app/email deletion instructions and retained-data disclosure
├── release-social-auth/ # Non-effective legal drafts; exclude from public deployments
├── styles.css          # Existing legal-page design system (preserved)
├── script.js           # Existing legal-page progressive enhancement (preserved)
├── site.webmanifest    # PWA manifest
├── robots.txt          # Crawl directives + sitemap pointer
├── sitemap.xml         # Single-page sitemap with image entry
└── assets/
    ├── logo.svg            # Header / footer logomark
    ├── favicon.svg         # Favicon (SVG)
    ├── apple-touch-icon.png
    ├── icon-192.png        # PWA icon
    ├── icon-512.png        # PWA icon
    ├── og-image.svg        # Source for the social-share card
    └── og-image.png        # 1200×630 Open Graph / Twitter image
```

## Design

The approved Arena design uses an obsidian canvas, antique gold, lavender,
self-hosted Barlow display fonts and promotional fantasy illustrations. It contains
no app screenshots. `arena.css` and `arena.js` are separate from the legacy files
used by legal pages. The hero artwork is optimized as WebP and loaded eagerly;
secondary illustrations load lazily.

Platform buttons remain visibly **Coming soon** while the corresponding public
store URL in `arena.js` is empty. They open a real launch-notification form using
`POST /api/subscribe`; success requires a successful HTTP response and `{ok:true}`.
Configure only verified public App Store / Google Play URLs once those releases
are live. Do not use App Store Connect or Play Console administrative URLs.

## SEO / sharing

- Descriptive `<title>` + meta description, canonical URL, theme-color
- Open Graph + Twitter `summary_large_image` cards
- `VideoGame` and `FAQPage` JSON-LD structured data
- `robots.txt` + `sitemap.xml`, semantic landmarks, alt text

The public domain is `https://promptwars.gg/`. On 8 October 2026, live response
headers identify Vercel and `/api/subscribe` returns the expected method restriction.
Existing PNG social cards, icons, manifest, legal pages and support email are retained.
The legal pages are available at their `.html` URLs; Vercel rewrites also serve
`/privacy-policy` and `/terms-and-conditions` to match their canonical URLs.

## Preview locally

```bash
cd landing
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

Deploy this `landing/` directory to the existing Vercel project serving
`promptwars.gg`. There is no frontend build step. Keep the existing project and its
server-side `RESEND_API_KEY` / optional `RESEND_FROM` environment settings so the
`api/subscribe.js` function continues working. Do not print or bundle those values.

After authenticating and verifying the linked project, use the Vercel CLI from this
directory. `.vercelignore` excludes `release-social-auth/`, README, local environment
files and archives. Verify the resulting upload inventory before production deploy.
Never publish the repository root or the mockup/output folders as the site.

The staged social-authentication/13+ notices must not replace the current public
policies until that separate release is activated. Follow
[`release-social-auth/README.md`](release-social-auth/README.md) for its coordinated
publication. Preserve the app's public `.html` legal URLs, `#support`, and the legacy
navigation anchors `#how`, `#features`, `#archetypes`, `#faq`, and `#get`.

A static-only host will not run `api/subscribe.js`. Do not report signup success if
that endpoint is unavailable or returns HTML. Verify success and failure behavior
with intercepted test responses, without sending real test-email signups.
