import {
  heroArtworkBudget,
  fighterArtworkWidth,
} from '@/utils/heroArtworkLayout';

test('hero budget reserves measured chrome and controls, clamping only artwork', () => {
  expect(heroArtworkBudget(700, 450)).toBe(250);
  expect(heroArtworkBudget(1000, 300)).toBe(320);
  expect(heroArtworkBudget(500, 440)).toBe(180);
});

test('art fits both width and height using the equipped frame aspect ratio', () => {
  expect(fighterArtworkWidth(330, 360, 2 / 3, 240)).toBe(160);
  expect(fighterArtworkWidth(120, 360, 2 / 3, 240)).toBe(120);
  expect(fighterArtworkWidth(330, 360, 0.8, 240)).toBe(192);
  expect(fighterArtworkWidth(330, 360, 2 / 3)).toBe(330);
});
