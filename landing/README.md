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
├── arena.js            # Existing iOS launch-notification signup
├── analytics.js        # Consent-gated Google Analytics 4
├── analytics.css       # Shared analytics choice panel
├── vercel.json         # Extensionless legal URL rewrites
├── .vercelignore       # Excludes non-effective legal drafts and local-only files
├── privacy-policy.html # Static privacy policy for the landing/app legal links
├── terms-and-conditions.html # Static terms of service / AI content policy
├── account-deletion.html # Public in-app/email deletion instructions and retained-data disclosure
├── release-social-auth/ # Non-effective legal drafts; exclude from public deployments
├── styles.css          # Existing legal-page design system (preserved)
├── script.js           # Existing legal-page progressive enhancement (preserved)
├── favicon.ico         # Browser fallback with 16/32/48px Battle emblem
├── site.webmanifest    # PWA manifest
├── robots.txt          # Crawl directives + sitemap pointer
├── sitemap.xml         # Single-page sitemap with image entry
└── assets/
    ├── logo.svg            # Header / footer logomark
    ├── favicon.png         # 48px Battle emblem favicon
    ├── apple-touch-icon.png
    ├── icon-192.png        # PWA icon
    ├── icon-512.png        # PWA icon
    ├── og-arena-20261008.jpg # Current 1200×630 Arena social-share card
    └── og-image.png        # Matching legacy image URL for cached metadata
```

## Design

The approved Arena design uses an obsidian canvas, antique gold, lavender,
self-hosted Barlow display fonts and promotional fantasy illustrations. It contains
no app screenshots. `arena.css` and `arena.js` are separate from the legacy files
used by legal pages. The hero artwork is optimized as WebP and loaded eagerly;
secondary illustrations load lazily.

Google Play buttons link directly to the verified public listing for
`gg.promptwars.app`, including without JavaScript. Apple badges are disabled and
visibly **Coming soon** because app `6788787677` has no public listing yet. The
separate iOS notification button retains the existing `POST /api/subscribe` flow;
success requires a successful HTTP response and `{ok:true}`. When iOS is live,
replace both disabled badges with verified public store links and update the
availability text and structured data. Do not use store administrative URLs.

## SEO / sharing

- Descriptive `<title>` + meta description, canonical URL, theme-color
- Open Graph + Twitter `summary_large_image` cards
- `VideoGame` and `FAQPage` JSON-LD structured data
- `robots.txt` + `sitemap.xml`, semantic landmarks, alt text

The public domain is `https://promptwars.gg/`. On 8 October 2026, live response
headers identify Vercel and `/api/subscribe` returns the expected method restriction.
The social-share card follows the Arena artwork and slogan. Its versioned JPEG URL
is shared by Open Graph, Twitter metadata, structured data and the sitemap. The
legacy PNG URL also serves the new artwork. Sharing platforms control their page
and message-preview caches. Legal pages and support email are retained. Browser and
home-screen icons use the approved Battle emblem (`assets/branding/app-icon-square.png`
in the app repository), resized without changing its artwork. Icon URLs are versioned
to refresh cached branding. Manifest icons use `purpose: "any"` to avoid mask clipping.
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

## Website measurement (31 October 2026)

GA4 measurement ID: `G-Q17QEN6GLW`. Property: `561785035`; web stream: `16244678280`; account: `379285196`.
The shared `analytics.js` is loaded on the homepage, privacy policy, terms, and
account-deletion page. Google itself is not loaded until analytics is accepted.
The equally weighted Accept/Reject panel is nonblocking; the footer's **Analytics
settings** button reopens it. The choice is stored under
`promptwars.analytics-consent.v1`. Rejection/withdrawal disables collection and
clears `_ga` cookies; browser storage failures fail closed on the next page load.
Advertising consent always remains denied. Google signals and ad personalization
are disabled. Website query strings and fragments are excluded from the reported
page URL, and only the referrer's origin is retained. No form values or email
addresses are sent. First-party analytics cookies expire after 180 days.

Campaign attribution is passed explicitly through these six fields only:
`utm_source` → `campaign_source`, `utm_medium` → `campaign_medium`,
`utm_campaign` → `campaign_name`, `utm_id` → `campaign_id`,
`utm_content` → `campaign_content`, and `utm_term` → `campaign_term`.
Use non-personal campaign identifiers of 1–80 ASCII letters, digits, underscores,
or hyphens, starting with a letter or digit (for example, `newsletter`, `email`,
`android_launch`, `launch-2026`, `hero`, `prompt_battles`). Use lowercase consistently.
Never place names, email addresses, phone numbers, account IDs, or other personal
information in campaign tags. Email/URL punctuation, spaces/free text, overlong
values, duplicate parameters, and phone-like strings of seven or more digits,
underscores, or hyphens are rejected. Unknown query parameters are never forwarded.
This format filter is not a general personal-data detector: campaign authors must
keep the permitted labels non-personal. Full query strings still never enter
`page_location` or `page_referrer`.

| Event | Trigger | Parameters |
| --- | --- | --- |
| `page_view` | Once per document, only after consent | Sanitized page location and referrer from configuration |
| `app_store_clicked` | An available store link is clicked, after consent | `store_platform` (`Android`), `placement` (`hero` or `join`) |

Page views are sent explicitly with `send_page_view: false` to avoid an automatic
initial duplicate. Keep enhanced measurement disabled in this web stream, including
automatic outbound clicks, forms, scrolling, search, video, downloads, and history-change
page views. This static site uses real document loads; anchors should not create
new page views.
`app_store_clicked` is configured as a key event, counted once per session, with
no default monetary value. Raw clicks remain available in event reports. It measures
store visits, not installs. No App Store event fires while the iOS badge is disabled.

Search Console uses the verification meta tag on the homepage. Submit
`https://promptwars.gg/sitemap.xml` for the `https://promptwars.gg/` URL-prefix
property after deploying. Keep the verification tag when changing analytics.

Before publishing, verify first-visit reject/accept, remembered choices,
withdrawal, a blocked-storage browser, one page view per load, both Play links,
the existing iOS notification dialog, and all four public pages. Do not send real
test-email signups. Staged `release-social-auth/` pages remain excluded and unchanged.
