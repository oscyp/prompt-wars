// Exact byte-for-byte equivalents of the bundled illustrations displayed by the app.
// Content-addressed paths are immutable; publishing is an explicit operator action.
export interface BundledCinematicAsset {
  local_path: string;
  bucket: string;
  path: string;
  version: string;
}
// Keep this literal JSON so the dependency-free publisher can read the same manifest.
// deno-fmt-ignore
// prettier-ignore
export const CINEMATIC_BUNDLED_ASSETS: Record<string, BundledCinematicAsset> = {
  "fighter:default": {
    "local_path": "assets/images/avatars/default.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/fighter/default/98fb5e60318da30e199cf87af988246ab07b94fd74a88d790e943846a8f003a1.jpg",
    "version": "98fb5e60318da30e199cf87af988246ab07b94fd74a88d790e943846a8f003a1"
  },
  "fighter:engineer": {
    "local_path": "assets/images/avatars/engineer.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/fighter/engineer/8c863b1681d6562339daecc0ab11972fca305b03eef5bfb33056edd120e08af1.jpg",
    "version": "8c863b1681d6562339daecc0ab11972fca305b03eef5bfb33056edd120e08af1"
  },
  "fighter:mystic": {
    "local_path": "assets/images/avatars/mystic.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/fighter/mystic/5ae2307e93e45a306506f874631f3ea4601738385efb6e2fa2cbe150dc5ae0e0.jpg",
    "version": "5ae2307e93e45a306506f874631f3ea4601738385efb6e2fa2cbe150dc5ae0e0"
  },
  "fighter:strategist": {
    "local_path": "assets/images/avatars/strategist.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/fighter/strategist/79a0fba3820038bc45f6c3ab281afd2ad42ba3b4837a9e110150478a4f92a300.jpg",
    "version": "79a0fba3820038bc45f6c3ab281afd2ad42ba3b4837a9e110150478a4f92a300"
  },
  "fighter:titan": {
    "local_path": "assets/images/avatars/titan.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/fighter/titan/a38985181208adb78f4eeaec17b3689130c5321f19994ba7a76761631cd6286f.jpg",
    "version": "a38985181208adb78f4eeaec17b3689130c5321f19994ba7a76761631cd6286f"
  },
  "fighter:trickster": {
    "local_path": "assets/images/avatars/trickster.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/fighter/trickster/73fc540b006e7b4b2761fde14779d8742d5a9c265c940b30d8847244ede6d6c4.jpg",
    "version": "73fc540b006e7b4b2761fde14779d8742d5a9c265c940b30d8847244ede6d6c4"
  },
  "item:briefcase": {
    "local_path": "assets/signature-icons/briefcase.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/briefcase/55b5ec6b7a76c317e25588766a490f598a3260154972e2031b3b5851bd6dffe1.jpg",
    "version": "55b5ec6b7a76c317e25588766a490f598a3260154972e2031b3b5851bd6dffe1"
  },
  "item:compass": {
    "local_path": "assets/signature-icons/compass.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/compass/201a71cae5d8b5ce2d1533226b9b11d5ed8b68661f7f7c0b19e3647d318856c9.jpg",
    "version": "201a71cae5d8b5ce2d1533226b9b11d5ed8b68661f7f7c0b19e3647d318856c9"
  },
  "item:crown_fragment": {
    "local_path": "assets/signature-icons/crown_fragment.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/crown_fragment/0672ac57ddf8cba7bffdc4d3e94b8d8148fd329c00d78b920d1d9d57be6570e7.jpg",
    "version": "0672ac57ddf8cba7bffdc4d3e94b8d8148fd329c00d78b920d1d9d57be6570e7"
  },
  "item:folding_chair": {
    "local_path": "assets/signature-icons/folding_chair.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/folding_chair/c89a40ff3757b4d501ecdc5f50350a25226b7eaaa1f843b31e523684768b6a55.jpg",
    "version": "c89a40ff3757b4d501ecdc5f50350a25226b7eaaa1f843b31e523684768b6a55"
  },
  "item:fountain_pen": {
    "local_path": "assets/signature-icons/fountain_pen.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/fountain_pen/a86ce72e6013750ff388dcc5cc1c6ed85a55573f7e2da9ccbe68d33cec808c87.jpg",
    "version": "a86ce72e6013750ff388dcc5cc1c6ed85a55573f7e2da9ccbe68d33cec808c87"
  },
  "item:hourglass": {
    "local_path": "assets/signature-icons/hourglass.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/hourglass/06895796d72814407c34b39d3c84e08047b4bd2474ee3b8e7e10fc3d952af2e8.jpg",
    "version": "06895796d72814407c34b39d3c84e08047b4bd2474ee3b8e7e10fc3d952af2e8"
  },
  "item:lucky_coin": {
    "local_path": "assets/signature-icons/lucky_coin.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/lucky_coin/048cc86484c594db39507e4d5ec3feda1bc2253047299585ee80c6ad970709d1.jpg",
    "version": "048cc86484c594db39507e4d5ec3feda1bc2253047299585ee80c6ad970709d1"
  },
  "item:megaphone": {
    "local_path": "assets/signature-icons/megaphone.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/megaphone/d609b1e0c1d68b9999ee31d60844482ea9b1cef4fe2b5ec3fc36d3475bd7d8da.jpg",
    "version": "d609b1e0c1d68b9999ee31d60844482ea9b1cef4fe2b5ec3fc36d3475bd7d8da"
  },
  "item:microphone": {
    "local_path": "assets/signature-icons/microphone.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/microphone/19a6ee3e3d5092227f36059ff0cf85d34f56f87728a868b7d5dce2867fed56a6.jpg",
    "version": "19a6ee3e3d5092227f36059ff0cf85d34f56f87728a868b7d5dce2867fed56a6"
  },
  "item:polaroid": {
    "local_path": "assets/signature-icons/polaroid.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/polaroid/541648e465c43c5eddbb1b60ca9cd4340fd0f7f3bccacf470c9735d8b17e5fb2.jpg",
    "version": "541648e465c43c5eddbb1b60ca9cd4340fd0f7f3bccacf470c9735d8b17e5fb2"
  },
  "item:stopwatch": {
    "local_path": "assets/signature-icons/stopwatch.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/stopwatch/6340e8e01b088cc6bc5a51d0fd7cae71ba5e39fd48646fde0958d74fa2fca676.jpg",
    "version": "6340e8e01b088cc6bc5a51d0fd7cae71ba5e39fd48646fde0958d74fa2fca676"
  },
  "item:tarot_card": {
    "local_path": "assets/signature-icons/tarot_card.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/tarot_card/988632bb2ec7b2f55f8954a3143aa07d61bb6f2f69bc09b73c3387570d652bc8.jpg",
    "version": "988632bb2ec7b2f55f8954a3143aa07d61bb6f2f69bc09b73c3387570d652bc8"
  },
  "item:tuning_fork": {
    "local_path": "assets/signature-icons/tuning_fork.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/tuning_fork/8e14f7ac22585d2c7970e5f128ed07d9345d3d1a8a0e6bbfae4c4aff709ced13.jpg",
    "version": "8e14f7ac22585d2c7970e5f128ed07d9345d3d1a8a0e6bbfae4c4aff709ced13"
  },
  "item:umbrella": {
    "local_path": "assets/signature-icons/umbrella.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/umbrella/e14d730643e2e449a0ae5cbfd35905308e37cec7d797b89dde946836bd76affb.jpg",
    "version": "e14d730643e2e449a0ae5cbfd35905308e37cec7d797b89dde946836bd76affb"
  },
  "item:wrench": {
    "local_path": "assets/signature-icons/wrench.jpg",
    "bucket": "character-portraits",
    "path": "cinematic-bundled/item/wrench/e039fc8f07ad7228789a9ceaa02ba69d2d878b5dcb5ee9e9e9ca1cacad2650f3.jpg",
    "version": "e039fc8f07ad7228789a9ceaa02ba69d2d878b5dcb5ee9e9e9ca1cacad2650f3"
  }
};

export function bundledFighterAsset(key: string): BundledCinematicAsset {
  const normalized = key
    .replace(/^bundled:/, '')
    .trim()
    .toLowerCase();
  return (
    CINEMATIC_BUNDLED_ASSETS[`fighter:${normalized}`] ??
    CINEMATIC_BUNDLED_ASSETS['fighter:default']
  );
}
export function bundledItemAsset(name: string): BundledCinematicAsset | null {
  return (
    CINEMATIC_BUNDLED_ASSETS[
      `item:${name.trim().toLowerCase().replaceAll(' ', '_')}`
    ] ?? null
  );
}
