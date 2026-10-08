# Battle environments

Twelve independently composed paintings: six 864×1296 portrait backdrops and six 1440×480 theme banners. Combined JPEG payload: 2,153,283 bytes (2.15 MB). Native views render all text and controls.

`manifest.json` records each source prompt, original path, dimensions, byte size and bundled SHA-256. Original generated PNGs and the visual contact sheet live under `output/imagegen/2026-09-21-environments/`. JPEG conversion uses Sharp/MozJPEG quality 83 with proportional resizing; banners are independent compositions rather than portrait crops.

`constants/BattleEnvironmentArt.ts` owns visual mapping. `constants/ThemeArt.ts` and existing audio assets retain their original selection behavior. No runtime generation or player charge is involved.
