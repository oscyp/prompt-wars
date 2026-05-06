# Prompt Wars Implementation Concept

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
- Prompt lock-in by each player with 24h timeout
- Server-side battle resolution using LLM-as-judge with rubric and double-run
- Tier 0 result reveal (always free): scored card, rubric breakdown, judge "why," animated still
- Tier 1 result reveal (paid or sub): one shared 6-12s AI video per battle via xAI / X AI
- Draws as a first-class outcome
- Player stats and battle history
- Basic rankings and seasonal leaderboard with anti-collusion guardrails
- Credits for video upgrades, subscription for video allowance and cosmetics
- First-time-user offer 24-72h after install
- Push notifications for opponent submitted, result ready, video ready
- Pre-gen prompt moderation and post-gen video moderation
- Report and block flow
- Simple share flow with watermarked video

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
4. Player picks a predefined prompt or writes a custom prompt.
5. Custom prompts pass moderation and length checks.
6. Player locks in the prompt.
7. The battle waits until the opponent also locks in.
8. Backend resolves the battle and creates an AI video generation job.
9. Player receives a result reveal with the generated short video.
10. Stats, rankings, rewards, and wallet transactions are updated.
11. Player can rematch, share, or start a new battle.

The loop should be short enough that a user can complete their first battle within a few minutes, while async waiting states keep the app useful when the opponent has not submitted yet.

## 5. Character Creation

Character creation is required before the first battle. The MVP should keep it expressive but lightweight.

Starter character model:

- Display name
- Archetype
- Avatar or generated portrait reference
- Short battle style description
- Primary trait
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

### 7.1 Structured Prompt Model

A submitted prompt has two parts:

- `move_type`: one of `attack`, `defense`, `finisher`. Adds light rock-paper-scissors mechanics so the game has a real strategy layer beyond writing quality:
  - `attack` beats `finisher` setups
  - `defense` beats `attack`
  - `finisher` beats `defense`
  - same vs. same is neutral
- `text`: the player's free-text prompt, predefined or custom.

Move-type matchups apply a small scoring modifier (capped) and influence the generated result video framing. They do not override clear quality differences, but they create meaningful counter-play.

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

MVP uses an LLM-as-judge approach behind an Edge Function with a fixed rubric. This is the only honest way to score free-text prompts at scale.

Rubric per prompt (each 0-10):

- Clarity
- Originality
- Specificity
- Theme fit
- Character / archetype fit
- Dramatic potential

Procedure:

1. Server packages both prompts blindly (no usernames, no ratings) into a structured judging payload.
2. The judge model is asked to score both prompts on the rubric and return strict JSON.
3. The call is run twice with different seeds. If aggregate scores disagree on the winner, a third tie-breaker call runs.
4. Move-type matchup modifier is applied after rubric scoring, capped.
5. Final winner, per-category scores, and a short "why" explanation are stored on the battle.
6. Players see the per-category breakdown and judge explanation on the result screen. Transparency is the retention lever.
7. Drift control: a frozen judge prompt version is stored on each battle so re-evaluations and audits are reproducible.

Scoring inputs explicitly excluded from MVP: player rating difference, recent streaks, paid items. Rating changes are computed *after* scoring, never as part of it.

### 7.4 Draws

Draws are first-class in MVP. If aggregate rubric difference is below a small epsilon and move-type matchup is neutral, the battle is a draw. Both players get partial XP, a small rating regression toward expected outcome, and the result reveal still plays.

### 7.5 Ranked Battle Constraints

- Only moderated prompts (templates or custom).
- No paid stat modifiers.
- Rating updates use Glicko-2 or Elo with K-factor by tier.
- Timeout: 24 hours to lock prompt. Auto-forfeit on expire.
- Opponent diversity: cannot face the same opponent more than N times per 24h in ranked.
- Full audit log retained.

### 7.6 Unranked And Friend Battles

- Experimental templates allowed.
- Friend challenges via deep link.
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

Every completed battle produces, in order:

1. **Tier 0 - Free, instant.** A scored result card: winner, per-category rubric scores, judge "why," character portraits, prompt quotes, and an animated still or motion-poster generated from a fast image model. Always free, always shown, never blocked by credits.
2. **Tier 1 - Cinematic short, paid or sub.** A 6-12 second AI-generated video composed from both prompts, both characters, and the battle outcome. Costs credits, included in subscription, generated as ONE shared video per battle (both players watch the same clip).
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

Credits gate the optional **video tier** of the result reveal. Tier 0 (text + image still) is always free.

- Onboarding grant: enough free credits for the first 3-5 video reveals so a new player experiences the hero feature without paying.
- Earned: small steady drip from daily play, daily quests, win streaks, season rewards.
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

Single tier in MVP. Indicative ~9.99 USD per month, ~59.99 USD per year.

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
- Username
- Character archetype
- Character customization
- First free battle call-to-action

Main app:

- Home dashboard
- Start battle
- Matchmaking
- Prompt picker
- Custom prompt editor
- Waiting for opponent
- Result reveal
- Battle history
- Rankings
- Profile and stats
- Wallet and subscription
- Settings

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

Async 1v1 dies without opponents. The MVP must guarantee an instant first match.

- Bot opponents seeded with a curated, archetype-appropriate prompt library.
- First battle is always vs a bot, framed as "training," so onboarding never stalls.
- Matchmaking falls back to a bot if no human match is found within a short window.
- Bot wins do not grant ranked rating but do grant XP and credits.
- Bots are clearly labeled. No deception about opponent type.
- Bot pool grows from real human prompts (with consent at submission) anonymized into the template library, building a flywheel.

Matchmaking pairing rules:

- Pair on rating proximity within a widening window over time.
- Avoid same-opponent pairing within a 24h ranked window.
- Avoid pairing accounts on the same network or device fingerprint in ranked.

## 20. Retention And Notifications

Async games live and die on push. This is not optional polish.

Core push events:

- Opponent submitted, your turn.
- Battle result ready.
- Cinematic video ready (if Tier 1 was requested).
- Daily quest available.
- Season ends in 24h, claim rewards.
- Friend challenged you.
- New daily prompt theme.

In-app retention surfaces:

- Daily quest list (3 small tasks, refresh daily).
- Streak meter with mercy day.
- Daily themed prompt with shared global leaderboard.
- Spectate feed of recent public battles.

Notification rules:

- Frequency cap (max ~3 per day default).
- Per-category opt-out in settings.
- No notifications for monetization-only nudges in MVP.
- Quiet hours respected.

## 21. Spectate Feed And Social Sharing

User-generated battles are free content; expose them.

- Public battles can opt in to a global "recent battles" feed (default off in MVP, on by phase 4).
- Players can like and share battles.
- Share export: vertical 9:16 video with watermark and a deep link to the app.
- Friend invite via deep link awards both inviter and invitee a small credit grant after the invitee finishes their first battle.
- All shared content carries an AI-generated content disclosure to comply with platform policies.

## 22. Safety, Moderation, And Platform Compliance

AI-generated UGC video is a high-scrutiny category for app stores. Moderation must be defense-in-depth.

- Pre-gen moderation on prompts: text classifier plus blocklist; reject before any provider call.
- Per-prompt safety constraints injected into the video provider call.
- Post-gen moderation on the generated video: scene classifier and unsafe-content checks before the video is shown.
- AI-content disclosure on every reveal and share.
- No real-person likeness unless explicitly supported and consented.
- Report and block flows on every battle, profile, and shared video.
- Human review queue for reported content with SLA.
- Age gate at signup.
- Region-aware content rules where required.
- Audit log of moderation decisions, retained per platform requirements.

## 23. Telemetry And Analytics Events

Minimum viable event taxonomy (all events versioned, all PII scrubbed):

- `app_open`, `session_start`, `session_end`
- `signup_started`, `signup_completed`
- `onboarding_step_view`, `character_created`
- `battle_created`, `battle_matched`, `battle_bot_matched`
- `prompt_template_selected`, `custom_prompt_submitted`, `prompt_locked`
- `prompt_moderation_blocked`
- `battle_resolved` (with winner, scores, judge version)
- `result_tier0_viewed`
- `video_upgrade_requested`, `video_job_started`, `video_job_succeeded`, `video_job_failed`
- `result_tier1_viewed`
- `share_initiated`, `share_completed`
- `iap_paywall_view`, `iap_purchase_started`, `iap_purchase_succeeded`, `iap_purchase_failed`
- `subscription_started`, `subscription_renewed`, `subscription_cancelled`
- `ftuo_shown`, `ftuo_purchased`, `ftuo_dismissed`
- `notification_sent`, `notification_opened`
- `report_submitted`

All battle and judge events include the frozen judge prompt version so balance and fairness can be debugged historically.

## 24. KPIs And Success Targets

Directional MVP targets, to be tuned post-launch:

- D1 retention: 35 percent or higher
- D7 retention: 15 percent or higher
- D30 retention: 6 percent or higher
- Median battles per DAU: 3+
- Tier 1 video upgrade rate per battle: 15-25 percent
- Free-to-paying conversion by D14: 3-5 percent
- ARPDAU: 0.10-0.20 USD initially, scaling with battle pass
- Subscription monthly churn: under 12 percent
- Crash-free sessions: 99.5 percent
- Median time-to-first-battle from install: under 3 minutes
- Median time-to-result-reveal after both prompts locked: under 5 seconds for Tier 0, under 90 seconds for Tier 1
- Moderation false-negative rate on shared video: under 0.1 percent
