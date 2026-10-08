# Prompt Wars collectible branding

Original generated branding for the client visual migration, 15 September 2026. The transparent wordmark and emblem remain UI branding assets. On 8 October 2026 the existing Battle emblem was also selected for the app icon; see the export details below. Generated-video branding remains separate. Both original production images were visually reviewed; their corners have alpha 0.

- `wordmark.png`: 2172 × 724 RGBA. Generated with the built-in image generation tool, no reference image. Prompt: "Create a transparent PNG logo asset with an actual alpha channel: golden fantasy wordmark reading exactly PROMPT WARS in one horizontal line. Confident bevelled collectible card game gold lettering, a subtle compass integrated into the O, clean and legible. Standalone mobile game branding asset. Genuinely transparent background, not checkerboard. No background of any color; outside/between every letter transparent. No objects/scene/phone. Tight margins. Wide horizontal layout. Original branding no third party logos."
- `crossed-quills.png`: 1254 × 1254 RGBA. Generated with the built-in image generation tool using the approved Arena mockup as a visual reference. Requested one round violet medallion, crossed ivory/lavender quills, gold rim, square tight transparent canvas, no text, phone or other objects; readable at 40 points.

The display typeface is separately bundled in `assets/fonts/` under the included SIL Open Font License. All dynamic labels and interactive borders are native UI.

## App icon — 8 October 2026

The user selected the current `crossed-quills.png` Battle emblem. `app-icon-square.png` is the opaque square adaptation produced with the built-in image generation tool; its [generation prompt](app-icon-square.md) records the edit constraints. The in-app Battle artwork remains the original transparent asset.

- `../images/icon.png`: 1024 × 1024 RGB PNG exported from the square adaptation, without alpha or pre-rounded corners.
- `../../ios/PromptWars/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png`: identical native iOS export.
- `../images/adaptive-icon.png`: original transparent Battle emblem resized to 640 × 640, centered with 192 pixels of transparent padding per side on a 1024 × 1024 foreground layer. Barely visible alpha=1 noise inherited from the source is cleared to alpha=0 after resizing; stronger artwork pixels are retained. The configured background is `#0B0B13`. All nontransparent pixels stay within Android's central 66/108 safe circle.
- `../images/favicon.png`: 48 × 48 export from the square app icon.

Exports use the existing Sharp dependency. A native rebuild is required to display the updated launcher icon. The earlier `app-icon-v2.png` and `app-icon-v3.png` files remain unused proposals.
