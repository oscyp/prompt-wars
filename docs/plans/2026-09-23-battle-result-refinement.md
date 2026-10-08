# Battle Result Screen Refinement

Approved by the user on 2026-09-23. Client presentation only; preserve the current working tree, game rules, rewards, purchases, moderation, appeals, recovery and audio behavior. No backend change, dependency, version bump, deployment or submission. Android native validation remains blocked.

## 1. Branded verdict and spacing

Restore the bundled wordmark and two battle-recorded equipped avatars. Keep the viewer left, with name, archetype and role; bots use “AI opponent · Practice”. Show one Victory/Defeat/Draw/No contest heading and one unbroken series score between avatars at ordinary size. Small winner glyph and KO beside the score. Add compact authoritative final HP bars only with known current/max values; no duplicate Final HP panel. Large text/narrow layouts put score on its own row and allow fighter information to stack. No contest suppresses original score, KO, winner and HP as the current verdict; expanded played-round records remain available with explicit reference-only wording. Legacy single omits series score. Reviewed/unrated states remain visible. Theme/deciding rule go in details. Use 16-point horizontal gutters, 20-point section gaps, 16-point padding, 8–12-point internal gaps, emphasized shared gold verdict frame and restrained supporting frames.

## 2. Cinematic and sharing

Order: verdict; available cinematic or compact pending/recovery state; sharing and Replay reveal; rewards/progress; eligible purchase offer; expandable Battle details; existing appeal/safety. Arena/Battle Again remain persistent, Battle Again primary.

Use paused contained video in a 220-point preview, with Play cinematic overlay. Cinematic · Round N resolves from the actual job's recorded round, never inferred from final round. Legacy unknown round omits number. Explicit Play opens existing native full-screen controls and only then plays, preserving current audio defaults. Close pauses/retains position and returns focus without scrolling; completed replay starts at zero. Pause on blur/background. Presentation failure offers retry without generation. Keep signing/generation states distinct and retries read-only. Historical media says Before review and cannot be shared as current.

Remove result-screen captions/transcript UI, caption fetching and caption-specific errors; leave stored records, media files and other consumers unchanged. No new CC/subtitle integration.

Share card / Share video use secondary GameButtons, side by side at width >=390 and fontScale <=1.15, stacked otherwise. Card works without cinematic; video only for playable media, revised sharing disabled with explanation. Replay reveal is a shared utility action. Keep the full-size export and font/artwork/revision guards independent of screen sizing.

## 3. Rewards

Extract a compact rewards component and typed presentation model from existing data, leaving shared free-reveal reward calculations unchanged. Two-column ordinary grid, one narrow/large-text; short labels/icons and prominent rating, diamond, recorded streak and quest values. Use CreditAmount. Title Rewards for awarded diamonds/positive rating/completed quests, otherwise Progress for meaningful changes. Put eligibility, milestones, personal-best details and quest titles in Battle details. Quest completion is distinct from awarded diamonds; View quests opens Arena without claiming historical rewards remain unclaimed. Confirmed no changes omits panel; unresolved/missing summaries show concise pending/unavailable feedback. Overturn/no contest suppress original rating/streak; retain explicit rating correction and granted credits, without calculating new rewards.

## 4. Verification and delivery

TypeScript, ESLint and full Jest suite. Focused tests: both perspectives and all outcomes/formats; equipment/fallback/unknown HP; compact/fullscreen playback, failure/background/focus; actual media round and revised restrictions; zero generation/purchase calls on retries; no caption query; reward zero/unknown, practice/exhibition/quests/corrections; button states and export revision cancellation.

Native captures on 375×812 and 402×874: real routes, equipped art, long/Unicode names, accessibility text, VoiceOver, Reduced Motion, playback return and recovery. Label fixtures and unavailable states honestly. Deliver comparison gallery, validation report, updated design/acceptance documentation. Full verdict and cinematic entry should fit first viewport at ordinary size; essential footer remains reachable.
