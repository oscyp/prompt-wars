export function cinematicSource() {
  const fighter = (name: string) => ({
    id: name,
    name,
    archetype: 'titan',
    signature_color: '#ff9900',
    appearance_version: 2,
    identity_provenance: 'matched',
    fighter: {
      id: `${name}-art`,
      image_path: `${name}/v2.png`,
      bucket: 'character-portraits',
      version: '2',
      appearance_version: 2,
      moderation_status: 'approved',
    },
    signature_item: {
      id: `${name}-item`,
      name: 'Copper shield',
      prompt_fragment: 'a round copper shield',
      moderation_status: 'approved',
      image_path: null,
    },
  });
  return {
    battle: {
      id: 'battle',
      format: 'bo3',
      player_one_id: 'one',
      player_two_id: 'two',
      prompt_experience_version: 2,
      theme: 'Rooftop',
      winner_id: 'one',
      identity_snapshot: {
        player_one: fighter('Ash'),
        player_two: fighter('Vex'),
      },
    },
    round: {
      id: 'round',
      battle_id: 'battle',
      round_number: 3,
      status: 'result_ready',
      round_winner_id: 'two',
      is_draw: false,
      is_ko: false,
      situation_snapshot: { text: 'A suspended bridge sways.' },
      judge_payload: {
        frozen_inputs: {
          player_one: { text: 'I cross with my shield.', moveType: 'defense' },
          player_two: {
            text: 'I pull the rope to tilt the bridge.',
            moveType: 'attack',
          },
        },
      },
    },
    policy: {
      cinematic_profile: 'plus' as const,
      target_duration_seconds: 15,
      duration_policy_version: 'cinematics-v2',
    },
  };
}
