# Reveal audio assets (Tier 0 "wow moment")

Short, licensed audio stings played on the free Tier 0 reveal. They are **optional**:
the reveal renders and plays fine with none of these present — missing files are a
silent no-op. Drop real files here and register them in
[`constants/RevealAudio.ts`](../../constants/RevealAudio.ts).

## Folders

```
assets/audio/
  music/    ~6 short musical victory / draw stings (~1.5–3s each)
  stings/   per-move-type impact stings + draw (<1s each)
```

Use `.m4a`/`.aac` or `.mp3` (broad iOS + Android support). Pre-trim them: this layer
plays each clip once and never loops. Keep them tasteful and quiet — SFX follow the
iOS silent switch and mix with the user's background music.

## How ids map to files

The server emits deterministic ids in `battles.tier0_reveal_payload.reveal_spec`.
To activate a clip, drop the file in the folder below and swap the matching `null`
in `constants/RevealAudio.ts` for a `require(...)`.

### Music — `reveal_spec.music_track_id` (by winner archetype / draw)

| id                        | when                | suggested file                        |
| ------------------------- | ------------------- | ------------------------------------- |
| `music_tactical_victory`  | strategist wins     | `assets/audio/music/tactical_victory` |
| `music_chaos_triumph`     | trickster wins      | `assets/audio/music/chaos_triumph`    |
| `music_power_surge`       | titan wins          | `assets/audio/music/power_surge`      |
| `music_ethereal_win`      | mystic wins         | `assets/audio/music/ethereal_win`     |
| `music_precision_success` | engineer wins       | `assets/audio/music/precision_success`|
| `music_draw_ambiguous`    | draw                | `assets/audio/music/draw_ambiguous`   |
| `music_default_win`       | fallback            | `assets/audio/music/default_win`      |

### Move stings — `reveal_spec.move_sting_id` (by winner move type / draw)

| id                   | when            | suggested file                  |
| -------------------- | --------------- | ------------------------------- |
| `move_sting_attack`  | winner attacked | `assets/audio/stings/attack`    |
| `move_sting_defense` | winner defended | `assets/audio/stings/defense`   |
| `move_sting_finisher`| winner finisher | `assets/audio/stings/finisher`  |
| `move_sting_draw`    | draw            | `assets/audio/stings/draw`      |

The reveal audio controller ([`hooks/useRevealAudio.ts`](../../hooks/useRevealAudio.ts))
plays the move sting first (falling back to the music sting), then speaks the winner's
battle cry via on-device `expo-speech` (or a pre-rendered TTS asset if the payload ever
supplies `reveal_spec.battle_cry_voice.asset_url`).

> Note: adding real audio files requires a new native/dev-client build to bundle them.
