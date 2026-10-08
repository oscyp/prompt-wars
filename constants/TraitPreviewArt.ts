import type { ImageSourcePropType } from 'react-native';

export type TraitPreviewArtGroup = 'vibe' | 'silhouette' | 'era' | 'expression';

export const TRAIT_PREVIEW_ART: Record<
  TraitPreviewArtGroup,
  Record<string, ImageSourcePropType>
> = {
  vibe: {
    heroic: require('../assets/images/traits/vibe/heroic.jpg'),
    sinister: require('../assets/images/traits/vibe/sinister.jpg'),
    mischievous: require('../assets/images/traits/vibe/mischievous.jpg'),
    stoic: require('../assets/images/traits/vibe/stoic.jpg'),
    unhinged: require('../assets/images/traits/vibe/unhinged.jpg'),
    regal: require('../assets/images/traits/vibe/regal.jpg'),
  },
  silhouette: {
    lean_duelist: require('../assets/images/traits/silhouette/lean_duelist.jpg'),
    heavy_bruiser: require('../assets/images/traits/silhouette/heavy_bruiser.jpg'),
    slim_trickster: require('../assets/images/traits/silhouette/slim_trickster.jpg'),
    armored_knight: require('../assets/images/traits/silhouette/armored_knight.jpg'),
    robed_mystic: require('../assets/images/traits/silhouette/robed_mystic.jpg'),
    sharp_tactician: require('../assets/images/traits/silhouette/sharp_tactician.jpg'),
  },
  era: {
    ancient: require('../assets/images/traits/era/ancient.jpg'),
    industrial: require('../assets/images/traits/era/industrial.jpg'),
    modern: require('../assets/images/traits/era/modern.jpg'),
    cyberpunk: require('../assets/images/traits/era/cyberpunk.jpg'),
    far_future: require('../assets/images/traits/era/far_future.jpg'),
  },
  expression: {
    smirk: require('../assets/images/traits/expression/smirk.jpg'),
    glare: require('../assets/images/traits/expression/glare.jpg'),
    calm: require('../assets/images/traits/expression/calm.jpg'),
    roar: require('../assets/images/traits/expression/roar.jpg'),
    smile: require('../assets/images/traits/expression/smile.jpg'),
    thousand_yard: require('../assets/images/traits/expression/thousand_yard.jpg'),
  },
};
