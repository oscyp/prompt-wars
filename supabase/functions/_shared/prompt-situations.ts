/** Pure, versioned content shared by the app and server; no provider or auth data. */
export interface SituationSnapshot {
  id: string;
  catalogVersion: 1;
  environmentId: string;
  text: string;
}

export const SITUATIONS: readonly (SituationSnapshot & { theme: string })[] = [
  {
    id: 'frozen-1',
    catalogVersion: 1,
    environmentId: 'frozen-void',
    theme: 'Overcome an impossible challenge',
    text: 'A narrow ice bridge spans the chasm. Low stone posts interrupt its edges, while loose snow drifts across the smooth surface in uneven gusts.',
  },
  {
    id: 'frozen-2',
    catalogVersion: 1,
    environmentId: 'frozen-void',
    theme: 'Overcome an impossible challenge',
    text: 'Tall ice pillars divide the frozen courtyard. A shallow ridge crosses the centre, and wind lifts powder from the open ground between the pillars.',
  },
  {
    id: 'frozen-3',
    catalogVersion: 1,
    environmentId: 'frozen-void',
    theme: 'Overcome an impossible challenge',
    text: 'Frost covers a circular stone platform. One side lies in deep shadow, while a low wall and scattered snow mark the opposite edge.',
  },
  {
    id: 'ember-1',
    catalogVersion: 1,
    environmentId: 'ember-forge',
    theme: 'Turn weakness into strength',
    text: 'Warm light spills between the forge pillars. An empty metal trough stands beside the open floor, and fine ash shifts whenever someone moves nearby.',
  },
  {
    id: 'ember-2',
    catalogVersion: 1,
    environmentId: 'ember-forge',
    theme: 'Turn weakness into strength',
    text: 'A broad workbench divides the forge floor. Hanging chains sway gently overhead, while orange light makes long moving shadows across the stone beneath them.',
  },
  {
    id: 'ember-3',
    catalogVersion: 1,
    environmentId: 'ember-forge',
    theme: 'Turn weakness into strength',
    text: 'A shallow channel runs across the cooled foundry floor. A stone ledge borders one side, and a thin layer of soot records passing footsteps.',
  },
  {
    id: 'storm-1',
    catalogVersion: 1,
    environmentId: 'storm-citadel',
    theme: 'The calm before the storm',
    text: 'Rain taps the citadel terrace. A torn banner hangs beside a stone pillar, while shallow puddles reflect the light from an open archway.',
  },
  {
    id: 'storm-2',
    catalogVersion: 1,
    environmentId: 'storm-citadel',
    theme: 'The calm before the storm',
    text: 'Two low stairways meet on the exposed battlement. Gusts carry mist through the gap between them, briefly hiding the markings on the wet stone.',
  },
  {
    id: 'storm-3',
    catalogVersion: 1,
    environmentId: 'storm-citadel',
    theme: 'The calm before the storm',
    text: 'A broken parapet opens onto a sheltered courtyard. Loose cloth flutters across the opening, and distant lightning briefly brightens the otherwise dim floor.',
  },
  {
    id: 'verdant-1',
    catalogVersion: 1,
    environmentId: 'verdant-reactor',
    theme: 'Victory from the jaws of defeat',
    text: 'Thick roots cross the abandoned reactor floor. A low railing surrounds an empty pit, and pale light filters through leaves above the open space.',
  },
  {
    id: 'verdant-2',
    catalogVersion: 1,
    environmentId: 'verdant-reactor',
    theme: 'Victory from the jaws of defeat',
    text: 'A fallen column rests across the garden walkway. Hanging vines brush its surface, while a narrow strip of clear ground runs along either side.',
  },
  {
    id: 'verdant-3',
    catalogVersion: 1,
    environmentId: 'verdant-reactor',
    theme: 'Victory from the jaws of defeat',
    text: 'Moss softens the edges of a raised platform. An open metal frame casts a grid of shadows, and scattered leaves slide across the stone.',
  },
  {
    id: 'neon-1',
    catalogVersion: 1,
    environmentId: 'neon-nexus',
    theme: 'Precision over power',
    text: 'Lights flicker above the platform. A loose cable hangs between two supports, and a thin sheet of water covers part of the floor below.',
  },
  {
    id: 'neon-2',
    catalogVersion: 1,
    environmentId: 'neon-nexus',
    theme: 'Precision over power',
    text: 'A reflective panel stands beside the neon walkway. Two waist-high barriers leave a narrow opening, while passing light repeatedly changes the shadows between them.',
  },
  {
    id: 'neon-3',
    catalogVersion: 1,
    environmentId: 'neon-nexus',
    theme: 'Precision over power',
    text: 'Painted lines cross the dark arena floor. A shallow step interrupts one edge, and overhead signs cast alternating pools of bright light and shadow.',
  },
];

/** Frozen catalogue v1 uses this small hash in both TypeScript and Postgres. */
export function situationOffset(battleId: string): number {
  let hash = 0;
  for (const char of battleId)
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  return hash % 3;
}

export function selectSituation(
  battleId: string,
  theme: string,
  round: number,
  catalogVersion: number,
): SituationSnapshot {
  if (
    catalogVersion !== 1 ||
    !Number.isInteger(round) ||
    round < 1 ||
    round > 3
  )
    throw new Error('Unsupported situation catalogue or round');
  const candidates = SITUATIONS.filter((s) => s.theme === theme);
  if (candidates.length !== 3) throw new Error('Unsupported situation theme');
  const { theme: _theme, ...snapshot } =
    candidates[(situationOffset(battleId) + round - 1) % 3];
  return snapshot;
}

/** New series use the composer; existing series retain their frozen version. */
export function promptExperienceVersion(pinned?: number | null): 1 | 2 {
  return pinned === 1 ? 1 : 2;
}

export function requiresPromptClientUpdate(
  version: number,
  clientVersion: unknown,
): boolean {
  return (
    version >= 2 &&
    (typeof clientVersion !== 'number' ||
      !Number.isInteger(clientVersion) ||
      clientVersion < 3)
  );
}

export const SITUATION_TACTICS: Record<
  string,
  { action: string; intents: readonly [string, string, string] }
> = {
  'frozen-1': {
    action:
      'I circle a low stone post on the ice bridge, keeping it close to my side.',
    intents: [
      'I want the post to interrupt a direct approach while I change my angle.',
      'I want a solid point beside me so I can recover my balance during a retreat.',
      'I aim to draw a wide movement around the post, then close the shorter route.',
    ],
  },
  'frozen-2': {
    action: 'I move along the shallow ridge between the ice pillars.',
    intents: [
      'I want to approach from a line that makes a straight response awkward.',
      'I aim to keep the ridge between us while I watch for a clear escape.',
      'I want to use a pillar to hide the start of my final advance.',
    ],
  },
  'frozen-3': {
    action:
      'I step along the shadowed side of the frosted platform, keeping my movements small.',
    intents: [
      'I want to make the first change in my approach less obvious.',
      'I aim to stay balanced without relying on a sudden stop on the frost.',
      'I want a quiet approach to bring me close enough for one decisive strike.',
    ],
  },
  'ember-1': {
    action:
      'I brush a short arc through the loose ash with my foot, then step to its side.',
    intents: [
      'I want the movement of ash to draw attention away from my actual approach.',
      'I want to mark my footing so I can retreat along a path I already know.',
      'I aim to use the brief distraction to close the distance in one movement.',
    ],
  },
  'ember-2': {
    action:
      'I circle the end of the broad workbench and briefly show my movement above it.',
    intents: [
      'I want the visible feint to hide my next step around the bench.',
      'I aim to keep the bench in the path of a direct attack while I reposition.',
      'I want to draw attention to the far edge before committing around the nearer one.',
    ],
  },
  'ember-3': {
    action:
      'I place one foot beside the shallow channel and shift my weight along its edge.',
    intents: [
      'I want to invite an awkward step across the channel before changing direction.',
      'I aim to keep a familiar footing beside the channel while yielding a little ground.',
      'I want to time my final advance for the moment my opponent steps across the gap.',
    ],
  },
  'storm-1': {
    action:
      'I move beside the terrace pillar, letting the torn banner hide part of my stance.',
    intents: [
      'I want to show my approach on one side before stepping out on the other.',
      'I aim to put the pillar between us long enough to reset my guard.',
      'I want to close from the banner side before my exact stance becomes clear.',
    ],
  },
  'storm-2': {
    action:
      'I take a short step onto the lower stair as mist passes between the stairways.',
    intents: [
      'I want the change in height to alter the line of my next attack.',
      'I aim to keep a solid step behind me so I can move back without rushing.',
      'I want to start my final advance as the mist briefly obscures my first movement.',
    ],
  },
  'storm-3': {
    action:
      'I show a movement beside the loose cloth, then shift toward the sheltered courtyard.',
    intents: [
      'I want the fluttering cloth to distract from my change in direction.',
      'I aim to keep room behind me while the opening limits a direct approach.',
      'I want to draw a response toward the opening before committing through the clearer space.',
    ],
  },
  'verdant-1': {
    action:
      'I follow the low railing around the empty pit, keeping clear of the thick roots.',
    intents: [
      'I want the curve of the railing to make a straight pursuit harder.',
      'I aim to keep known footing beneath me while I watch for an approach.',
      'I want to draw a wide step around the roots before taking the shorter line.',
    ],
  },
  'verdant-2': {
    action:
      'I show an approach on one side of the fallen column, then step back along its end.',
    intents: [
      'I want to draw a guard toward one narrow route before choosing the other.',
      'I aim to keep the column between us without getting trapped in the hanging vines.',
      'I want to commit around the end of the column after drawing attention down its side.',
    ],
  },
  'verdant-3': {
    action:
      'I move across the grid of shadows, keeping away from the mossy platform edge.',
    intents: [
      'I want the changing outline of my stance to make my next step harder to read.',
      'I aim to hold the clearer ground and leave enough room for a measured retreat.',
      'I want to disguise the first step of a close, decisive advance among the shadows.',
    ],
  },
  'neon-1': {
    action:
      'I draw the loose cable taut between the supports, keeping my own feet clear of the water.',
    intents: [
      'I want the low obstruction to interrupt a direct approach and open a line for my strike.',
      'I aim to make a rushed advance harder while leaving myself a dry escape route.',
      'I want to limit a quick retreat before I close the distance for a decisive attack.',
    ],
  },
  'neon-2': {
    action:
      'I show my movement in the reflective panel, then sidestep toward the gap between the barriers.',
    intents: [
      'I want the reflected feint to pull attention away from my real approach.',
      'I aim to keep one barrier between us while I reset my guard.',
      'I want to commit through the gap after drawing a response toward my reflection.',
    ],
  },
  'neon-3': {
    action:
      'I take short steps along a painted line, then break sideways as the overhead light changes.',
    intents: [
      'I want the repeated footwork to suggest a direction that my real approach will not follow.',
      'I aim to move away from the shallow step without turning my back.',
      'I want the shift in light to hide the first movement of my decisive attack.',
    ],
  },
};

/** Frozen policy1 compatibility only. This public hash is not a private seed.
 * Policy2 resolves its precommitted choice through private-bot.ts instead. */
export function getSituationBotMove(
  snapshot: SituationSnapshot,
  battleId: string,
  round: number,
): {
  text: string;
  moveType: 'attack' | 'defense' | 'finisher';
  wordCount: number;
} {
  const tactic = SITUATION_TACTICS[snapshot.id];
  if (tactic) {
    const index =
      (situationOffset(`${battleId}:${snapshot.id}`) + round - 1) % 3;
    const text = `${tactic.action} ${tactic.intents[index]}`;
    return {
      text,
      moveType: (['attack', 'defense', 'finisher'] as const)[index],
      wordCount: text.split(/\s+/).length,
    };
  }
  const sceneMoves: Record<string, readonly [string, string, string]> = {
    'frozen-void': [
      'I shuffle across the frozen ground, showing a high strike before stepping low. I want to make a hasty retreat cost my opponent their footing.',
      'I shorten my stance on the frozen surface and move sideways. I want to avoid a direct hit without relying on a sudden stop.',
      'I feint a retreat over the frozen ground, then turn into one committed strike. I want to catch my opponent while they are carefully adjusting their feet.',
    ],
    'ember-forge': [
      'I use the uneven light to mask a change in my approach. I want to draw a guard toward my first movement before attacking from the other side.',
      'I keep my silhouette small against the forge light and step out of line. I want to make the distance of an approaching strike harder to judge.',
      'I briefly pause in the shifting forge light, then commit to a close attack. I want the change in timing to create a final opening.',
    ],
    'storm-citadel': [
      'I approach with short steps on the wet stone and feint to one side. I want to tempt a wide response before changing direction.',
      'I lower my centre of balance on the wet stone and leave room to retreat. I want to redirect an attack without slipping into a rushed counter.',
      'I step close with my weight low over the wet stone, then commit to a decisive strike. I want to limit the room for a sudden dodge.',
    ],
    'verdant-reactor': [
      'I step across the clearer ground and show a direct approach before shifting sideways. I want to draw a guard out of position before striking.',
      'I hold a compact stance in the overgrown arena and keep an escape route open. I want to yield a little ground without being pushed off balance.',
      'I move through the open space in one decisive advance, then turn my attack inward. I want to close the exchange before my opponent can reset.',
    ],
    'neon-nexus': [
      'I time a sideways step with the changing light, then close the distance. I want to hide the beginning of my real approach behind a visible feint.',
      'I keep my guard close and move between the changing pools of light. I want to make a direct strike harder to line up without losing my footing.',
      'I show one movement under the bright light, then commit as the shadows shift. I want a late adjustment to open the line for my final strike.',
    ],
  };
  const index = (situationOffset(`${battleId}:${snapshot.id}`) + round - 1) % 3;
  const choices = sceneMoves[snapshot.environmentId];
  if (!choices) throw new Error('Unsupported bot situation');
  const text = choices[index];
  return {
    text,
    moveType: (['attack', 'defense', 'finisher'] as const)[index],
    wordCount: text.split(/\s+/).length,
  };
}
