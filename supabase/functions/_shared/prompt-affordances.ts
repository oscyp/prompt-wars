/** Public scene metadata only. Never put private bot choices or seeds here. */
export interface SituationAffordance {
  id: string;
  label: string;
}
const SCENE_AFFORDANCES: Readonly<Record<string, readonly [string, string][]>> =
  {
    'frozen-1': [
      ['posts', 'Stone posts'],
      ['ice', 'Ice bridge'],
      ['snow', 'Drifting snow'],
    ],
    'frozen-2': [
      ['pillars', 'Ice pillars'],
      ['ridge', 'Low ridge'],
      ['powder', 'Windblown powder'],
    ],
    'frozen-3': [
      ['frost', 'Frost'],
      ['shadow', 'Deep shadow'],
      ['wall', 'Low wall'],
    ],
    'ember-1': [
      ['pillars', 'Forge pillars'],
      ['trough', 'Metal trough'],
      ['ash', 'Fine ash'],
    ],
    'ember-2': [
      ['bench', 'Workbench'],
      ['chains', 'Hanging chains'],
      ['shadows', 'Moving shadows'],
    ],
    'ember-3': [
      ['channel', 'Floor channel'],
      ['ledge', 'Stone ledge'],
      ['soot', 'Soot footprints'],
    ],
    'storm-1': [
      ['banner', 'Torn banner'],
      ['pillar', 'Stone pillar'],
      ['puddles', 'Puddles'],
    ],
    'storm-2': [
      ['stairs', 'Low stairs'],
      ['mist', 'Drifting mist'],
      ['stone', 'Wet stone'],
    ],
    'storm-3': [
      ['parapet', 'Broken parapet'],
      ['cloth', 'Loose cloth'],
      ['lightning', 'Lightning'],
    ],
    'verdant-1': [
      ['roots', 'Thick roots'],
      ['railing', 'Low railing'],
      ['light', 'Filtered light'],
    ],
    'verdant-2': [
      ['column', 'Fallen column'],
      ['vines', 'Hanging vines'],
      ['path', 'Narrow paths'],
    ],
    'verdant-3': [
      ['moss', 'Mossy edges'],
      ['frame', 'Metal frame'],
      ['leaves', 'Sliding leaves'],
    ],
    'neon-1': [
      ['cable', 'Loose cable'],
      ['supports', 'Supports'],
      ['water', 'Wet floor'],
    ],
    'neon-2': [
      ['panel', 'Reflective panel'],
      ['barriers', 'Low barriers'],
      ['shadows', 'Shifting shadows'],
    ],
    'neon-3': [
      ['lines', 'Painted lines'],
      ['step', 'Shallow step'],
      ['light', 'Pools of light'],
    ],
  };

export function getSituationAffordances(
  situation?: { id: string; catalogVersion: number } | null,
): readonly SituationAffordance[] {
  if (situation?.catalogVersion !== 1) return [];
  return (SCENE_AFFORDANCES[situation.id] ?? []).map(([id, label]) => ({
    id,
    label,
  }));
}
