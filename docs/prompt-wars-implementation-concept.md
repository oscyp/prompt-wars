# Prompt Wars Implementation Concept

> Document version: v3 (designer-adjusted). Changes vs. v2: shorter ranked timeout, theme-after-matchmaking decision layer, cinematic Tier 0, judge calibration + appeals, identity additions to character creation, daily meta promoted into MVP, realistic KPI targets, accessibility and compliance hardening.

## 1. Product Vision

Prompt Wars is a mobile-first competitive game where players battle through prompts. Each player builds a character, enters a 1v1 war, selects a predefined generated prompt or writes a custom prompt, and locks in their submission. When both players are ready, the backend resolves the battle and generates a short AI video that dramatizes the result.

The first version should feel simple, fast, and social: create a character, join a battle, choose a prompt, see an AI-generated outcome, earn progress, and climb rankings. The long-term opportunity is a game where prompt writing, character identity, cosmetics, ranked seasons, and shareable AI result videos create a strong replay loop.

## 2. Stack Recommendation

Use the local `/Users/patdom/sources/remedy` project as the baseline implementation style.

Recommended stack:

- React Native with Expo SDK 55
- React Native 0.83.2
- Expo Router for route groups and navigation
- Supabase Auth, Postgres, Realtime, Storage, and Edge Functions
- Supabase migrations for database evolution
- RevenueCat via `react-native-purchases` for subscriptions and in-app purchases
- Jest and `jest-expo` for tests
- EAS for development, preview, and production builds
- yarn scripts aligned with the local Remedy project conventions

Suggested route groups:

```txt
app/
  (auth)/
  (onboarding)/
  (tabs)/
  (battle)/
  (profile)/
  _layout.tsx
```

Suggested tabs:

- Home
- Battles
- Create
- Rankings
- Profile

## 3. MVP Scope

The MVP should optimize for async turn-based 1v1 battles. This avoids the complexity of live socket rooms while still supporting real player-versus-player competition.

MVP features:

- Account creation and sign-in
- First-run character creation with free starter archetypes
- Prompt template selection
- Custom prompt entry with moderation
- Structured prompts: move type (attack / defense / finisher) plus text
- Bot opponents for first battle and as a fallback when matchmaking is empty
- Async 1v1 battle creation, friend challenge by deep link, and matchmaking
- Theme-after-matchmaking constraint reveal (both players write under the same constraint)
- Prompt lock-in by each player with 2h ranked timeout / 8h friend-challenge timeout
- Auto-enqueue a second battle to a different opponent immediately after lock-in (parallel queue)
- Server-side battle resolution using LLM-as-judge with rubric, double-run, length normalization, and judge calibration
- Player appeal flow for ranked losses (capped 1/day)
- Tier 0 result reveal (always free, cinematic): scored card, rubric breakdown, judge "why," 9:16 motion poster with character voice line, music sting, per-move-type animation
- Tier 1 result reveal (paid or sub): one shared 6-12s AI video per battle via xAI / X AI
- 3 free Tier 1 video reveals in the first 7 days for every new account
- Draws as a first-class outcome
- Player stats and battle history
- Daily themed prompt with shared global leaderboard, daily quests, win-streak meter with mercy day
- Rival auto-tagging on most-played opponent; prompt journal of personal best-rated prompts
- Basic rankings (Glicko-2) and seasonal leaderboard with anti-collusion guardrails
- Newbie matchmaking bucket (under 10 ranked battles only matched to newbies or bots)
- Credits for video upgrades, subscription ("Prompt Wars+") for video allowance and cosmetics
- First-time-user offer 24-72h after install
- Push notifications: opponent submitted, result ready, video ready, daily quest, friend challenge (max 2/day, must-send only on result-ready)
- Pre-gen prompt moderation, post-gen video moderation, blurred-until-cleared preview
- Report and block flow, 18+ rating, no minor accounts at signup
- Share flow: watermarked 9:16 video AND scored result-card image export

Out of scope for MVP:

- Real-time simultaneous battles
- Guilds or clans
- Large tournaments
- Creator marketplaces
- Advanced replay editing
- Web3 ownership or trading
- Pay-to-win boosts

## 4. Core Game Loop

1. Player signs up or signs in.
2. Player creates a character during onboarding.
3. Player enters matchmaking, accepts a challenge, or starts an unranked battle.
4. Once both players are matched, the **battle theme is revealed to both** with a per-side visible timer.
5. Player picks a predefined prompt or writes a custom prompt under the shared theme constraint.
6. Custom prompts pass moderation and length checks.
7. Player locks in the prompt. Player is immediately auto-enqueued for a second parallel battle against a different opponent.
8. The battle waits until the opponent also locks in (2h ranked / 8h friend timeout).
9. Backend resolves the battle (LLM-as-judge, double-run, length-normalized, calibrated).
10. Tier 0 cinematic reveal plays for both players: motion poster, voice line, music sting, scored card.
11. Optional Tier 1 video upgrade (credits or sub allowance), one shared video for both players.
12. Stats, rankings, rewards, and wallet transactions are updated. Player may file one appeal/day on a ranked loss.
13. Player can rematch, share (video or scored card image), or start a new battle.

The loop should be short enough that a user can complete their first battle within a few minutes, while async waiting states keep the app useful when the opponent has not submitted yet. The auto-enqueued second battle ensures the player always has a next action.

## 5. Character Creation

Character creation is required before the first battle. The MVP should keep it expressive but lightweight, while giving the player enough surface area to feel ownership. Identity drives retention.

Starter character model:

- Display name
- Archetype
- Avatar or generated portrait reference
- Short battle style description
- Primary trait
- **Battle cry**: one free-text line (max 60 chars), shown on every result reveal and shareable card
- **Signature color**: applied to UI accents, frame, and reveal card
- Cosmetic frame or title

Starter archetypes (all free, all available from day one):

- The Strategist: precise, tactical, rewards Defense moves
- The Trickster: creative, chaotic, rewards unexpected angles
- The Titan: direct, powerful, rewards Attack moves
- The Mystic: poetic, abstract, rewards Originality
- The Engineer: structured, technical, rewards Specificity

Archetypes are baseline content and must always be free. Archetype effects influence narrative flavor and small, capped scoring modifiers (no more than ~5 percent of total score), never raw win probability. Cosmetics, subscriptions, and shop items must never gate or boost an archetype. Any new archetype added later must ship as a free unlock through play, not a paid wall, to preserve competitive trust.

Progression ideas:

- Level from battle participation and wins
- Titles from achievements
- Cosmetic frames from seasons
- Avatar effects from subscriptions or shop purchases
- Prompt style badges from repeated play patterns
- **Rivals**: the opponent a player has battled most over the last 30 days is auto-tagged as their rival, with a badge in match search and reveal screens. Manual override possible.

## 6. Prompt System

Players can either select a predefined generated prompt or create their own.

Predefined prompts:

- Curated by category and difficulty
- Safe for all ranked play
- Rotated daily or seasonally
- Useful for new users who do not know what to write
- Can include tags like cinematic, funny, heroic, villainous, tactical, absurd, or dramatic

Custom prompts:

- Player-authored text with length limits
- Moderated before lock-in
- Scored for relevance, originality, clarity, and character alignment
- Stored with battle context for auditability
- Never sent directly to a client-visible provider key

Recommended prompt limits for MVP:

- Minimum: 20 characters
- Soft target: 80-400 characters
- Maximum: 800 characters
- One prompt per player per battle
- No edits after lock-in

Prompt categories for templates:

- Opening attack
- Defense reversal
- Final move
- Taunt
- Strategy
- Chaos
- Cinematic finisher

## 7. Battle Mechanics

Battles are resolved server-side. AI is used as a structured judge of prompt quality, but the resolution pipeline, scoring, tie-breaks, and rating updates are owned by the backend. The client never decides outcomes.

Decision-making layer (MVP): once both players are matched, the **battle theme is revealed to both** before either writes their prompt. Both write under the same constraint, in parallel, with a visible per-side timer. This is what turns the game from a writing exercise into a battle. Best-of-3 rounds and per-match wagers are explicit phase 4+ extensions.

### 7.1 Structured Prompt Model

A submitted prompt has two parts:

- `move_type`: one of `attack`, `defense`, `finisher`. Adds light rock-paper-scissors mechanics so the game has a real strategy layer beyond writing quality:
  - `attack` beats `finisher` setups
  - `defense` beats `attack`
  - `finisher` beats `defense`
  - same vs. same is neutral
- `text`: the player's free-text prompt, predefined or custom.

Move-type matchups apply a small scoring modifier (capped) and influence the generated result video framing. They do not override clear quality differences, but they create meaningful counter-play.

Move-type must be **legible** to be strategic. Required surfaces in MVP:

- Show opponent's last 5 move types on the prompt-entry screen.
- Show counter-pick win rate per move type vs. the opponent's archetype.
- On the result screen, explicitly state any modifier applied (e.g., "Defense countered Attack: +12% modifier").

### 7.2 Battle State Machine

```txt
created
  -> matched
    -> waiting_for_prompts
      -> resolving
        -> result_ready (text and image preview always available)
          -> generating_video (optional, gated by credits or sub)
            -> completed
      -> expired             (timeout before both prompts locked)
      -> canceled             (player or system cancel)
      -> moderation_failed    (prompt rejected at lock-in)
  -> generation_failed        (video tier failed; battle still completes with fallback reveal)
```

Key property: `result_ready` is reachable without ever generating a video. The video step is an optional upgrade, not a blocker for closing the battle, updating ratings, or showing a result.

### 7.3 LLM-as-Judge Scoring

MVP uses an LLM-as-judge approach behind an Edge Function with a fixed rubric. This is the only honest way to score free-text prompts at scale, but LLM judges drift, are sycophantic, and reward verbosity. Defense-in-depth is required.

Rubric per prompt (each 0-10):

- Clarity
- Originality
- Specificity
- Theme fit
- Character / archetype fit
- Dramatic potential

Procedure:

1. Server packages both prompts blindly (no usernames, no ratings, no archetype names, no theme name in natural language) into a structured judging payload. Archetype and theme are passed as opaque structured fields the judge cannot pattern-match on stylistically.
2. The judge model is asked to score both prompts on the rubric and return strict JSON.
3. **Length normalization**: per-category scores are normalized against word-count buckets so longer prompts cannot win on volume alone. Cap the marginal benefit of length above the soft target (400 chars).
4. The call is run twice with different seeds. If aggregate scores disagree on the winner, a third tie-breaker call runs.
5. Move-type matchup modifier is applied after rubric scoring, capped.
6. Final winner, per-category scores, normalized scores, and a short "why" explanation are stored on the battle.
7. Players see the per-category breakdown and judge explanation on the result screen. Transparency is the retention lever.
8. Drift control: a frozen judge prompt version is stored on each battle so re-evaluations and audits are reproducible.

**Calibration set**: a frozen library of ~200 prompt pairs with known correct winners. The live judge runs against this set nightly; if accuracy drops below threshold, the current judge model/prompt version is frozen and an incident is opened. New judge versions must beat the current version on the calibration set before promotion. Judge versions ship at season boundaries only, so mid-season ratings stay stable.

**Player appeal flow**: a player can appeal a ranked loss, capped at 1/day. Appeals enqueue the battle for a third independent judge run with a different model; if the result flips, the original rating change is reversed and the appeal is logged. Even rare appeals materially improve trust.

Scoring inputs explicitly excluded from MVP: player rating difference, recent streaks, paid items. Rating changes are computed *after* scoring, never as part of it.

### 7.4 Draws

Draws are first-class in MVP. If aggregate rubric difference is below a small epsilon and move-type matchup is neutral, the battle is a draw. Both players get partial XP, a small rating regression toward expected outcome, and the result reveal still plays.

### 7.5 Ranked Battle Constraints

- Only moderated prompts (templates or custom).
- No paid stat modifiers.
- Rating updates use **Glicko-2** (chosen for sparse async play; rating deviation grows during inactivity).
- Timeout: **2 hours** to lock prompt in ranked. Auto-forfeit on expire.
- After lock-in, the player is automatically enqueued for a second battle against a different opponent so there is always another action available.
- A player can send one "poke" notification per battle after 30 minutes of opponent inactivity.
- Opponent diversity: cannot face the same opponent more than N times per 24h in ranked.
- Newbie bucket: accounts with under 10 ranked battles are only matched to other newbies or bots.
- Full audit log retained.

### 7.6 Unranked And Friend Battles

- Experimental templates allowed.
- Friend challenges via deep link.
- Timeout: **8 hours** to lock prompt (longer than ranked, accommodates real-life friend cadence).
- No ranking penalty.
- Still moderated. Still subject to anti-abuse caps.

### 7.7 Anti-Cheat And Anti-Collusion

Prompt battles are extremely vulnerable to win-trading. Required safeguards from MVP:

- Server-side rate limits on battles created, prompts submitted, and ranked matches per hour and per day.
- Opponent diversity requirement for ranked rating gains.
- Heuristic detection of suspicious win-trade patterns (same pair, alternating wins, low prompt quality).
- Shadow rating that lags public rating during anomaly review.
- Manual review queue for top-leaderboard accounts.
- No rating gain when both prompts fall below a minimum quality floor.

## 8. AI Result Reveal Pipeline

The result reveal is the emotional payoff. AI video is the hero format, but it must not be the gate to closing a battle. Video is slow, expensive, and failure-prone, so the reveal is built as **tiers**, not a single must-succeed pipeline.

### 8.1 Tiered Reveal

Tier 0 must be the wow moment for free users. A static scorecard is utility, not theater — players judge the app on their first result, so Tier 0 is engineered to *feel* cinematic even though it is templated and cheap.

Every completed battle produces, in order:

1. **Tier 0 - Free, instant, cinematic.** Always free, always shown, never blocked by credits. Includes:
   - 9:16 motion poster generated from a fast image model, with parallax and subtle motion.
   - Per-move-type canned animation overlay (3-second sting per attack/defense/finisher).
   - Music sting (one of ~6 tracks selected by archetype + outcome).
   - Character voice line: a TTS read of the winner's battle cry.
   - Scored result card: winner, per-category rubric scores, judge "why," character portraits, prompt quotes, signature-color theming, applied move-type modifier.
2. **Tier 1 - Cinematic short, paid or sub.** A 6-12 second AI-generated video composed from both prompts, both characters, and the battle outcome. Costs credits, included in subscription, generated as ONE shared video per battle (both players watch the same clip). New accounts receive **3 free Tier 1 reveals in the first 7 days** to anchor the hero feature before any paywall pressure.
3. **Tier 2 - Highlight reel (later phase).** Stitched best moments from the season; for sharing.

This structure protects unit economics, makes the app usable when the provider is degraded, and turns video into a desire-driven upgrade instead of a tax on every battle.

### 8.2 Provider Strategy

- Default video provider: xAI / X AI / Grok video generation, kept behind an `AiVideoProvider` adapter.
- The judge LLM and the image-still model can be different providers from the video model. Keep three adapters: `AiJudgeProvider`, `AiImageProvider`, `AiVideoProvider`.
- Provider API keys live only in Supabase Edge Function secrets.
- Cost guardrails: per-user daily generation cap, global circuit breaker if provider error rate or cost exceeds a threshold.

### 8.3 Video Generation Flow

1. Battle reaches `result_ready`. Tier 0 result is shown immediately.
2. If both players (or one paying player; see 8.5) are entitled to a video and request it, server creates one `video_jobs` row with status `queued` for the battle.
3. Edge Function composes the provider prompt from both characters, both prompts, the winner, and tone hints derived from move types.
4. Edge Function submits to the video provider.
5. Job state: `queued -> submitted -> processing -> succeeded | failed`.
6. On success, the video is copied from the provider into Supabase Storage and a thumbnail is generated. Provider URLs are not used as long-term references.
7. Clients subscribe to the job via Supabase Realtime and play the video when ready.
8. Push notification fires when the video is ready if the user has left the screen.

### 8.4 Video Prompt Composition

Includes:

- Character names, archetypes, and visual descriptors
- Battle theme
- Move types and matchup outcome
- Both player prompts (sanitized)
- Winner and loser framing
- Desired tone derived from archetypes and move types
- Runtime target 6-12 seconds for MVP
- Mobile-safe composition (vertical 9:16)
- No real person likeness unless explicitly supported and consented
- Safety exclusions and platform policy constraints

### 8.5 Who Pays For The Video

Simple rule: video tier is per-battle, not per-player. One generation, both watch.

- If either player is a subscriber, the video is generated within the subscriber's monthly allowance.
- If neither is a subscriber, either player can spend credits to upgrade the battle to video; the other watches free.
- A player can also pre-commit to "always cinematic" in settings (auto-spend credits or use sub allowance).

This converts video from a tax into a status / generosity moment, which historically performs well for ARPDAU.

### 8.6 Failure And Refund

- Pre-gen prompt moderation rejects unsafe prompts before any provider call. Credits are not charged.
- Post-gen video moderation runs before publishing to the result screen. Unsafe outputs are quarantined, the player is refunded, and the battle keeps its Tier 0 result.
- Provider submission failure retries with exponential backoff up to a small cap.
- Hard timeout (e.g., 5 minutes) refunds credits and keeps Tier 0 visible.
- Storage copy failure keeps the battle completed and offers a retry.
- All failures log a sanitized provider request ID for support.

## 9. Stats, Rankings, And Progression

Player stats:

- Total battles
- Wins
- Losses
- Draws
- Win rate
- Current streak
- Best streak
- Ranked rating
- Season rank
- Favorite archetype
- Prompt template usage
- Custom prompt usage
- Videos generated
- Shares initiated

Battle history:

- Opponent
- Character used
- Prompt type
- Result
- Score summary
- Video thumbnail
- Created and completed timestamps

Rankings:

- Global leaderboard
- Friends leaderboard later
- Seasonal leaderboard
- Archetype-specific leaderboard later
- Ranked tiers such as Bronze, Silver, Gold, Platinum, Diamond, Champion

Progression:

- XP for battle completion
- Bonus XP for wins and streaks
- Season rewards for rank placement
- Cosmetic unlocks
- Prompt mastery badges

## 10. Monetization

Primary MVP monetization: **credits + subscription**, layered with a **first-time-user offer** and a path to a **battle pass** in phase 4. Pricing below is directional and must be validated with live A/B tests; what matters here is the structure.

### 10.1 Credits

Credits gate the optional **video tier** of the result reveal. Tier 0 (cinematic motion poster + voice line + scored card) is always free.

- Onboarding grant: 3 free Tier 1 video reveals in the first 7 days so a new player experiences the hero feature without paying.
- Earned (the F2P spine, must support a daily-active free player to feel the hero feature roughly weekly):
  - Daily login streak credit reward (escalating, with a mercy day).
  - Daily quest completion (3 small tasks/day).
  - Win-streak milestones.
  - Season placement rewards.
  - **Judge a friend's battle** minigame: rate a public battle on the rubric; if your scoring agrees with the live judge within tolerance, earn a tiny credit, hard daily cap. This also produces calibration signal.
- Purchased: consumable packs.
- Refunds: automatic on provider or moderation failure.
- Cost transparency: credit cost is shown before prompt lock-in, never as a surprise after.

Indicative starting price ladder (validate live):

| Pack     | Credits | USD   | Notes              |
|----------|---------|-------|--------------------|
| Starter  | 10      | 1.99  | impulse            |
| Standard | 30      | 4.99  | best value badge   |
| Big      | 80      | 9.99  | anchor             |
| Whale    | 200     | 19.99 | rare buyer         |

One credit equals one battle upgraded to video.

### 10.2 Subscription

Single tier in MVP, branded **Prompt Wars+**. Indicative ~9.99 USD per month, ~59.99 USD per year. Subscriptions sell on identity and badge as much as allowance — Prompt Wars+ members display a visible badge on their character card and result reveals.

- Monthly video allowance large enough that an engaged daily player rarely runs out.
- Cosmetic frames, titles, avatar effects, and reveal styles.
- Priority generation queue where provider and fairness constraints allow.
- Extra saved video history (free tier auto-prunes after N battles).
- Expanded custom prompt draft slots.
- Never grants ranked stat advantage.

### 10.3 First-Time-User Offer (FTUO)

A one-time, time-boxed offer surfaced 24-72 hours after install for non-payers who completed at least one battle. Higher value than standard packs, exclusive cosmetic. This single mechanic typically lifts D7 ARPU meaningfully and should land in MVP.

### 10.4 Cosmetics And Battle Pass (Phase 4+)

- Cosmetic shop: frames, titles, avatar effects, reveal styles. Strictly cosmetic.
- Seasonal battle pass with free and premium tracks tied to play activity, not pay activity. Tracks should not require purchase to make play meaningful, only to unlock cosmetics.
- Paid challenge packs and sponsored prompt template events are optional.
- Rewarded ads only as a small free credit top-up path, with a hard daily cap, never on the result screen.

### 10.5 Purchase Layer

- RevenueCat via `react-native-purchases`, matching the local Remedy dependency.
- Server-side entitlement validation through Supabase Edge Functions before any credit grant or sub benefit is unlocked.
- Mirror RevenueCat events into Supabase via webhook for auditability and double-write safety.
- Battle integrity must never depend on purchase state.

### 10.6 Anti-Pay-To-Win Rules (Hard Constraints)

- No paid stat boosts.
- No paid scoring modifiers.
- No paid archetypes.
- No paid prompt templates that score better than free templates.
- No paid bypass of moderation.
- Subscription only buys: more video reveals, cosmetics, convenience, history.

### 10.7 Conversion Principles

- First battle is free, fully featured (Tier 0), and impressive.
- Onboarding free credits guarantee at least one video reveal moment.
- Credit cost is transparent before lock-in.
- Failed generation never costs the player.
- Subscriptions feel like creative expansion, not a competitive requirement.

## 11. Technical Architecture

Client responsibilities:

- Auth screens and session handling
- Character creation UI
- Prompt template browsing
- Custom prompt editor
- Battle status screens
- Result reveal and video playback
- Wallet and subscription screens
- Profile, stats, and rankings
- Push notifications for opponent submission and result readiness

Backend responsibilities:

- Battle creation and matchmaking
- Prompt validation and moderation dispatch
- Battle resolution
- AI video job creation
- Secure provider API calls
- Storage persistence
- Wallet transactions
- Purchase validation and entitlement sync
- Rankings and season aggregation
- Abuse reporting and audit logs

Supabase services:

- Auth: email, Apple, Google, and optional anonymous guest upgrade later
- Postgres: source of truth for gameplay state
- Realtime: battle/job status updates
- Storage: generated videos, thumbnails, avatar assets
- Edge Functions: matchmaking, resolution, moderation, xAI / aiX calls, purchase webhooks
- Row Level Security: restrict players to their own data and public leaderboard data

Suggested scripts based on Remedy:

```json
{
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios",
  "test": "jest",
  "test:ci": "jest --ci --passWithNoTests",
  "lint": "expo lint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "supabase:login": "supabase login",
  "supabase:init": "supabase init",
  "supabase:link": "supabase link",
  "supabase:new-migration": "supabase migration new",
  "supabase:migrate": "supabase db push",
  "supabase:reset": "supabase db reset"
}
```

## 12. Suggested Supabase Schema

Core tables:

```txt
profiles
characters
prompt_templates
battles
battle_prompts
video_jobs
videos
wallet_transactions
purchases
subscriptions
rankings
seasons
moderation_events
reports
```

`profiles`:

- `id` references auth user
- `username`
- `display_name`
- `avatar_url`
- `rating`
- `current_season_id`
- `created_at`
- `updated_at`

`characters`:

- `id`
- `profile_id`
- `name`
- `archetype`
- `style_description`
- `avatar_asset_url`
- `cosmetic_config`
- `level`
- `is_active`

`prompt_templates`:

- `id`
- `title`
- `body`
- `category`
- `difficulty`
- `tags`
- `is_ranked_safe`
- `active_from`
- `active_until`

`battles`:

- `id`
- `mode`
- `status`
- `theme`
- `player_one_id`
- `player_two_id`
- `player_one_character_id`
- `player_two_character_id`
- `winner_id`
- `score_payload`
- `rating_delta_payload`
- `seed`
- `created_at`
- `completed_at`

`battle_prompts`:

- `id`
- `battle_id`
- `profile_id`
- `prompt_template_id`
- `custom_prompt_text`
- `prompt_type`
- `moderation_status`
- `locked_at`

`video_jobs`:

- `id`
- `battle_id`
- `provider`
- `provider_job_id`
- `status`
- `attempt_count`
- `request_payload_hash`
- `error_code`
- `created_at`
- `updated_at`

`videos`:

- `id`
- `battle_id`
- `video_job_id`
- `storage_path`
- `thumbnail_path`
- `duration_ms`
- `visibility`
- `created_at`

`wallet_transactions`:

- `id`
- `profile_id`
- `amount`
- `currency_type`
- `reason`
- `battle_id`
- `purchase_id`
- `created_at`

`entitlements` (derived view, source of truth for feature gates):

- `profile_id`
- `is_subscriber`
- `subscription_tier`
- `monthly_video_allowance_remaining`
- `cosmetic_unlocks`
- `priority_queue`
- `updated_at`

Server-side feature gates query this view, never raw RevenueCat or `subscriptions` rows.

`judge_runs`:

- `id`
- `battle_id`
- `judge_prompt_version`
- `model_id`
- `seed`
- `raw_scores`
- `normalized_scores`
- `winner`
- `is_tiebreaker`
- `is_appeal`
- `created_at`

`appeals`:

- `id`
- `battle_id`
- `profile_id`
- `status`
- `original_winner`
- `appeal_winner`
- `rating_reverted`
- `created_at`
- `resolved_at`

`rivals`:

- `profile_id`
- `rival_profile_id`
- `battles_count_30d`
- `last_battle_at`
- `is_manual_override`

## 13. Security, Safety, And Trust

Required safeguards:

- Enable RLS on all user and gameplay tables.
- Keep xAI / aiX API keys server-side only.
- Use Edge Functions or an equivalent secure backend for provider calls.
- Never trust client-submitted battle outcomes.
- Store locked prompts immutably.
- Moderate custom prompts before generation.
- Rate limit prompt submissions, battle creation, and video requests.
- Use signed URLs for private video playback.
- Provide report and block controls.
- Log moderation decisions and provider failures.
- Keep purchase validation server-side.

RLS principles:

- A player can read their own profile and public leaderboard profiles.
- A player can read battles they participate in.
- A player can insert prompts only for their own active battle slot.
- A player cannot update battle results directly.
- Only service-role Edge Functions can resolve battles, create video jobs, or grant paid credits.

## 14. Screen Plan

Onboarding:

- Welcome
- Auth
- Age gate (18+)
- Username
- Character archetype
- Character customization (battle cry, signature color)
- First free battle call-to-action (vs. bot, persona-disguised)

Main app:

- Home dashboard (daily theme, daily quests, streak meter, rival panel)
- Start battle
- Matchmaking
- Theme reveal
- Prompt picker (with opponent's last 5 move types + counter-pick win rate)
- Custom prompt editor (with voice-to-text)
- Waiting for opponent (with one-tap poke after 30 min)
- Result reveal (Tier 0 cinematic; Tier 1 upgrade CTA with cost shown before commit)
- Appeal sheet (1/day on ranked losses)
- Battle history
- Prompt journal
- Rankings (global, seasonal, daily theme leaderboard)
- Profile and stats
- Wallet and subscription (Prompt Wars+)
- Judge-a-friend minigame
- Settings (notification categories, accessibility, dyslexia font, locale)

Result reveal should prioritize the generated short video. Text explanation should support the video, not replace it unless generation fails.

## 15. MVP Roadmap

Phase 1: Concept prototype

- Create Expo app scaffold
- Implement app navigation skeleton
- Add Supabase auth
- Build character creation screens
- Seed local prompt templates

Phase 2: Playable async MVP

- Add battle tables and RLS
- Implement matchmaking or challenge flow
- Add prompt lock-in
- Resolve battles server-side
- Show result summaries without video

Phase 3: AI video integration

- Add video job pipeline
- Integrate xAI / aiX provider adapter
- Store generated videos
- Add result reveal playback
- Add retries, timeouts, refunds, and fallback result states

Phase 4: Stats, rankings, and economy

- Add rankings and seasons
- Add stats screens
- Add credit wallet
- Add purchase and subscription flows through RevenueCat
- Add server-side entitlement validation

Phase 5: Retention and polish

- Push notifications
- Sharing
- Rematches
- Cosmetic progression
- Moderation/reporting improvements
- Manual QA on iOS and Android

## 16. Acceptance Criteria For First Build

The first playable implementation is successful when:

- A new user can sign up and create a character.
- A user can start or join an async battle.
- A user can select a predefined prompt or submit a custom prompt.
- A battle waits for both prompts before resolving.
- The backend determines and stores the result.
- A video generation job is created after resolution.
- The result screen can display generated video when available and fallback content when not.
- Stats update after battle completion.
- Rankings can show at least a basic ordered list.
- Credits are consumed and refunded correctly for video generation.
- Subscription entitlement can grant monthly credits or cosmetic access.
- xAI / aiX keys are never exposed to the mobile client.

## 17. Key Risks

- AI video cost may be too high for frequent free battles.
- Provider generation latency may make result reveals feel slow.
- Moderation must be strong enough for user-generated prompts.
- Prompt quality scoring can feel unfair if not explained carefully.
- Ranked play must avoid paid advantage.
- Storage and bandwidth costs can grow quickly if videos are permanent.
- App store review may scrutinize AI-generated content, subscriptions, and user safety flows.

## 18. Recommended Next Step

Start with a non-video async battle prototype. Prove the core loop first: character creation, structured prompt + move type, LLM-judged resolution with visible rubric, Tier 0 result reveal, stats, and rankings. Bot opponents from day one so the prototype is playable solo. Attach the Tier 1 video pipeline only after the gameplay state machine, judge stability, and anti-collusion guardrails are proven.

## 19. Cold Start, Bots, And Matchmaking

Async 1v1 dies without opponents. The MVP must guarantee an instant first match, and the first match must not feel like a tutorial.

- Bot opponents seeded with a curated, archetype-appropriate prompt library, **separate from the human-facing template library** so users cannot memorize bot prompts.
- Each bot has a plausible persona: name, archetype, avatar, battle cry, signature color. First-battle screenshots must be indistinguishable from real PVP at a glance.
- First battle is always vs a bot, framed lightly as a "warm-up," but the bot is tuned to **lose 55-60% of the time in week 1**, then drift toward 50% as the player's rating stabilizes. Never below 40% for new users.
- After the first battle, the player is *immediately* enqueued for a real human match (with bot fallback) so PVP cadence starts on session 1.
- Matchmaking falls back to a bot if no human match is found within 60 seconds.
- Bot wins do not grant ranked rating but do grant XP and credits.
- Bots are clearly labeled in the post-match summary (not pre-match) to avoid sandbagging while preserving honesty.
- Bot prompt pool is curated by the team, never from real player submissions, to avoid consent and content-rights ambiguity.

Matchmaking pairing rules:

- Initial rating band: ±50 Glicko points.
- Widen by ±25 every 15 seconds.
- Hard cap: ±400.
- Bot fallback at 60 seconds if no human in band.
- Newbies (under 10 ranked battles) only matched to other newbies or bots.
- Avoid same-opponent pairing within a 24h ranked window.
- Avoid pairing accounts on the same network or device fingerprint in ranked.
- Daily theme battles use a separate matchmaking pool with relaxed rating bands.

## 20. Retention And Notifications

Async games live and die on push. This is not optional polish. iOS 17+ Focus filtering and Android adaptive notifications punish over-sending, so cap aggressively.

Core push events:

- **Battle result ready** (must-send; the only category that ignores quiet hours by default off, opt-in to override).
- Opponent submitted, your turn.
- Cinematic video ready (if Tier 1 was requested).
- Daily quest available.
- Season ends in 24h, claim rewards.
- Friend challenged you.
- New daily prompt theme.
- Rival is online.
- Opponent has been idle 30 min (one-tap "poke," sender-initiated).

In-app retention surfaces (all in MVP, not deferred):

- Daily quest list (3 small tasks, refresh daily, with reward sizes balanced against §10.1 F2P spine).
- Streak meter with one mercy day per week.
- Daily themed prompt with shared global leaderboard.
- Prompt journal: a personal collection of the player's best-rated prompts, shareable.
- Rival panel: most-played opponent over 30 days, head-to-head record, quick rematch.
- Spectate feed of recent public battles (default off in MVP, on by phase 4).

Notification rules:

- Frequency cap: **max 2 per day default**, hard cap regardless of categories.
- `result_ready` is the only must-send category.
- Per-category opt-out in settings.
- No notifications for monetization-only nudges in MVP.
- Quiet hours respected by default.
- Account-farm guard: FTUO and onboarding credits gated by passing a lightweight signup-time anti-abuse signal (device fingerprint, IP velocity, attestation where supported).

## 21. Spectate Feed And Social Sharing

User-generated battles are free content; expose them. Most shares on TikTok/Reels are images, not videos, so both formats must ship.

- Public battles can opt in to a global "recent battles" feed (default off in MVP, on by phase 4).
- Players can like and share battles.
- Share export, both formats:
  - **Vertical 9:16 video** with watermark, AI-disclosure tag, and a deep link to the app (Tier 1 battles).
  - **Scored result-card image** with character portraits, signature colors, battle cry, scores, and a deep link (every battle, Tier 0+).
- Friend invite via deep link awards both inviter and invitee a small credit grant after the invitee finishes their first battle.
- All shared content carries an AI-generated content disclosure to comply with platform policies.
- Hashtag and ASO guidance: "AI battle video" trend keywords drive TikTok/Shorts as the primary acquisition funnel; share captions are pre-filled with handle + hashtag set.

## 22. Safety, Moderation, And Platform Compliance

AI-generated UGC video is a high-scrutiny category for app stores. Moderation must be defense-in-depth, and compliance posture must be explicit at submission time.

Store-readiness commitments (must be reviewable by Apple/Google):

- App rated **18+**. No minor accounts at signup; failed age gate hard-blocks account creation.
- All UGC video previews are **blurred until post-gen moderation passes**.
- UGC report SLA: under 24 hours from report to reviewer action.
- AI-disclosure label on every reveal, every share, every public profile asset.

Moderation pipeline:

- Pre-gen moderation on prompts: text classifier plus blocklist; reject before any provider call.
- Per-prompt safety constraints injected into the video provider call.
- Post-gen moderation on the generated video: scene classifier and unsafe-content checks before the video is shown; preview blurred until checks pass.
- No real-person likeness unless explicitly supported and consented.
- Report and block flows on every battle, profile, and shared video.
- Human review queue for reported content with the 24h SLA above.
- Region-aware content rules where required.
- Audit log of moderation decisions, retained per platform requirements.
- Storage retention tier: free-tier user videos auto-prune after 14 days; Prompt Wars+ keeps full history. Reduces storage cost growth and provides a sub benefit.

Localization & judge fairness:

- Judge rubric and prompt instructions must be localized per supported locale to avoid English-bias scoring. Calibration set is mirrored per locale.
- Battles are matched within locale where pool size allows; cross-locale ranked battles use an English-normalized judge call with reduced rating swing.

## 22a. Accessibility

Product-readiness for store features and broad reach requires accessibility from MVP.

- Dynamic type support across all screens.
- Voice-over labels on the result screen and all primary CTAs.
- Captions auto-generated on every Tier 1 video.
- Color-blind-safe move-type icons (shape + color, not color alone).
- Dyslexia-friendly font option in settings.
- Voice-to-text supported in the custom prompt editor for users for whom typing on mobile is the friction.

## 23. Telemetry And Analytics Events

Minimum viable event taxonomy (all events versioned, all PII scrubbed):

- `app_open`, `session_start`, `session_end`
- `signup_started`, `signup_completed`
- `onboarding_step_view`, `character_created`
- `battle_created`, `battle_matched`, `battle_bot_matched`
- `theme_revealed`
- `prompt_template_selected`, `custom_prompt_submitted`, `prompt_locked`
- `prompt_moderation_blocked`
- `battle_resolved` (with winner, scores, judge version, calibration accuracy at time of run)
- `appeal_submitted`, `appeal_resolved`
- `result_tier0_viewed`
- `video_upgrade_requested`, `video_job_started`, `video_job_succeeded`, `video_job_failed`
- `result_tier1_viewed`
- `share_initiated` (format: video | image), `share_completed`
- `daily_quest_completed`, `daily_theme_entered`
- `judge_minigame_played`, `judge_minigame_credit_earned`
- `rival_assigned`, `rival_rematch_started`
- `iap_paywall_view`, `iap_purchase_started`, `iap_purchase_succeeded`, `iap_purchase_failed`
- `subscription_started`, `subscription_renewed`, `subscription_cancelled`
- `ftuo_shown`, `ftuo_purchased`, `ftuo_dismissed`
- `notification_sent`, `notification_opened`, `poke_sent`
- `report_submitted`

All battle and judge events include the frozen judge prompt version so balance and fairness can be debugged historically.

## 24. KPIs And Success Targets

Directional MVP targets for a brand-new IP with no audience advantage. Set so missing them triggers an honest pivot, not reassurance. Top-decile aspirations are tracked separately.

Launch targets (must hit to continue investing as designed):

- D1 retention: **25-30 percent**
- D7 retention: **8-12 percent**
- D30 retention: **3-5 percent**
- Median battles per DAU: 3+
- Tier 1 video upgrade rate per battle: 10-18 percent (matures toward 15-25 percent post-FTUO)
- Free-to-paying conversion by D14: 2-4 percent
- ARPDAU: 0.08-0.15 USD initially, scaling with battle pass
- Subscription monthly churn: under 14 percent
- Crash-free sessions: 99.5 percent
- Median time-to-first-battle from install: under 3 minutes
- Median time-to-result-reveal after both prompts locked: under 5 seconds for Tier 0, under 90 seconds for Tier 1
- Moderation false-negative rate on shared video: under 0.1 percent
- Judge calibration accuracy: above 90 percent on the frozen calibration set, checked nightly
- Appeal flip rate: under 5 percent (above this means the judge is unstable)
- Cost per resolved battle (Tier 0 only): under target threshold; circuit breaker if exceeded

Top-decile stretch (signals the game is breakout, not a benchmark to plan around):

- D1 35%+, D7 15%+, D30 6%+
- Tier 1 upgrade 25%+
- ARPDAU 0.20+ USD
