# Edit Look — proposed editor

Prepared 16 September 2026. Design artifacts only; production screens are unchanged.

- [Visual concept board](concept-board.png): three complete proposed mobile layouts.
- [Interactive prototype](index.html): independent Look, writing, and Gear demonstrations. Each includes the Fighter tab.
- [Audit](../../../docs/audits/2026-09-16-edit-look/README.md): evidence and findings behind this proposal.

## Proposed interaction

The editor opens on **Look** with controls already visible. A compact current-artwork preview sits above Look / Fighter / Gear tabs. Editing content scrolls normally; there is no required hold, drag or drawer expansion. The preview expands only through the explicit **View card** control.

1. **Choose traits:** illustrated art-style choices, color swatches, then grouped silhouette, outfit and presence choices. Existing choices appear in disclosure summaries.
2. **Write your own:** the character preview becomes a compact row while writing. The text field and persistent actions remain above the keyboard. Switching modes retains the written text and guided choices separately.
3. **Choose gear:** the current signature item has its own row. Other items have clear Preview actions. A detail view explains selection versus paid drawing before the item is staged.

The footer separates **Save changes · Free** from **Review & draw · 3 credits**. Status copy distinguishes editing choices from current artwork. A confirmation shows the drawing cost and resulting balance. Paid shuffle has its own visible price and confirmation. All prices and balances in these artifacts are illustrative; the implementation must use server allowances, entitlements and actual prices.

## Try the prototype

Open `index.html` in a browser that permits local HTML. No dependencies or server are needed.

- Switch Look / Fighter / Gear in any phone.
- Choose an art style or palette; expand a trait group.
- Switch to Write my own, enter text, switch away and return. The text remains for this page session.
- Open View card and Previous looks.
- Preview a gear item, then choose it. Selection does not generate artwork.
- Save changes, or review a drawing. Confirmation demonstrates the interaction without making a request or spending credits.
- Use Done in the writing example to dismiss the **illustrated** keyboard.
- Reset mockups restores all sample state.

For a single viewport, append `?screen=look`, `?screen=write`, `?screen=gear` or `?screen=fighter`.

The simulated keyboard is a layout proposal, not a working iOS keyboard. The prototype keeps state in memory only; reload resets it. Production needs account-scoped draft persistence, native keyboard handling, real generation/recovery, active-battle locks, actual render history and the full existing trait inventory. Sample trait groups demonstrate information structure without specifying feature removal. Stat allocation is a preview of the destination, not a new implementation of respec.

## Visual sources and fidelity

The concept board was created with the built-in image-generation tool using the [approved Arena mockup](../2026-09-14-collectible-direction/arena.png) as the visual and fighter reference. [The complete generation prompt](prompt.txt) is included. It is a design illustration, not a native screenshot or screenshot of the HTML prototype. Generated item illustrations and typography may differ from final reusable assets.

The HTML prototype uses bundled Barlow Condensed fonts, existing custom SVG glyphs, current style thumbnails, signature item artwork, the Astral Codex frame and the bundled mystic avatar. It uses sample identity data and has no backend, telemetry or purchase integration. The prototype's bundled masked mystic avatar differs from the female mystic in the approved visual reference; production will use the player's existing fighter identity and artwork consistently.

## Validation and remaining checks

JavaScript syntax, local asset references and interaction state checks are recorded in `verification.json`. These are source checks, not native or browser-layout acceptance.

Browser automation rejected the local file URL under its URL security policy. No alternative route was used to bypass that restriction. The clickable prototype has therefore **not been visually inspected or exercised in a real browser** in this session. The generated concept board was visually reviewed. No screenshots are represented as native app captures.

Before implementation acceptance: inspect the prototype/browser layout; build the real Expo screen; test on small phones and accessibility text sizes; verify VoiceOver/TalkBack, native keyboards, focus restoration, draft recovery, free allowances, paid confirmations, generation failures, active-battle locks and returning to the opener.
