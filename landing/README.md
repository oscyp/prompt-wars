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
├── index.html          # The page (semantic HTML + SEO + JSON-LD)
├── styles.css          # Design system (dark canvas, purple brand, move-type accents)
├── script.js           # Progressive enhancement (nav, scroll-reveal, FAQ, waitlist)
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

The visual language mirrors the app (`constants/Colors.ts`):

- **Canvas** `#0B0B0F` dark, **brand** purple `#8B5CF6` → `#7C3AED`
- **Move-type accents** — Attack `#EF4444`, Defense `#3B82F6`, Finisher `#8B5CF6`
- **Type** — Space Grotesk (display) + Inter (body) via Google Fonts
- Fully responsive (mobile-first), accessible (skip link, focus styles, ARIA,
  reduced-motion support), and usable with JavaScript disabled.

## SEO / sharing

- Descriptive `<title>` + meta description, canonical URL, theme-color
- Open Graph + Twitter `summary_large_image` cards
- `VideoGame` and `FAQPage` JSON-LD structured data
- `robots.txt` + `sitemap.xml`, semantic landmarks, alt text

> The public landing domain is `https://promptwars.gg/`. Re-generate `og-image.png`
> from `og-image.svg` if you change the art (`sips -s format png
> assets/og-image.svg --out assets/og-image.png`). Wire the waitlist form in
> `script.js` to your email provider, and drop in real App Store / Google Play
> links once available.

## Preview locally

```bash
cd landing
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

Upload the `landing/` folder to any static host (Netlify, Vercel, Cloudflare
Pages, GitHub Pages, S3 + CloudFront). No build command; output directory is the
folder itself.
