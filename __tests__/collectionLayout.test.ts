import { collectionColumns } from '@/utils/collectionLayout';
test.each([
  [389, 1, 1],
  [390, 1, 2],
  [390, 1.15, 2],
  [430, 1.16, 1],
  [320, 2, 1],
])('width %s / text %s gives %s columns', (width, scale, expected) => {
  expect(collectionColumns(width, scale)).toBe(expected);
});
