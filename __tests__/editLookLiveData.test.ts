import { fetchEditPricing } from '@/utils/editCooldowns';
import { loadEquippedSignatureItem } from '@/utils/equippedSignatureItem';
const mockRead = jest.fn();
const mockSigned = jest.fn();
jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => mockRead(table),
        then: (resolve: any, reject: any) =>
          Promise.resolve(mockRead(table)).then(resolve, reject),
      };
      return q;
    },
    storage: {
      from: () => ({
        createSignedUrl: mockSigned,
        getPublicUrl: () => ({ data: { publicUrl: 'catalog.png' } }),
      }),
    },
  },
}));
const validPrices = [
  { edit_kind: 'render_look', credits: 3, cooldown_seconds: 0 },
  { edit_kind: 'random_character', credits: 5, cooldown_seconds: 0 },
];
beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockImplementation((table) => ({
    data: table === 'character_edit_prices' ? validPrices : [],
    error: null,
  }));
});
test.each(['character_edit_prices', 'character_edits'])(
  'rejects actual returned %s errors instead of treating missing data as free',
  async (table) => {
    mockRead.mockImplementation((name) =>
      name === table
        ? { data: null, error: { message: 'offline' } }
        : { data: validPrices, error: null },
    );
    await expect(fetchEditPricing('fighter')).rejects.toThrow('offline');
  },
);
test.each(
  [
    [],
    [{ ...validPrices[0], credits: null }],
    [{ ...validPrices[0], credits: 'invalid' }, validPrices[1]],
  ].map((prices) => ({ prices })),
)('refuses incomplete or invalid live prices', async ({ prices }) => {
  mockRead.mockImplementation((table) => ({
    data: table === 'character_edit_prices' ? prices : [],
    error: null,
  }));
  await expect(fetchEditPricing('fighter')).rejects.toThrow();
});
test('reads retired current gear separately and keeps identity when image signing fails', async () => {
  mockRead.mockImplementation((table) => ({
    data:
      table === 'characters'
        ? { signature_item_id: 'legacy' }
        : {
            id: 'legacy',
            kind: 'custom',
            profile_id: 'owner',
            name: 'Lipstick',
            description: 'A retained item',
            item_class: 'relic',
            image_path: 'old.png',
            moderation_status: 'approved',
          },
    error: null,
  }));
  mockSigned.mockResolvedValue({ data: null, error: { message: 'offline' } });
  expect(await loadEquippedSignatureItem('fighter', 'owner')).toMatchObject({
    id: 'legacy',
    name: 'Lipstick',
    isCustom: true,
    iconUrl: undefined,
  });
});
test('does not expose another account’s item or bypass missing owner-visible rows', async () => {
  mockRead.mockResolvedValue({ data: null, error: null });
  expect(await loadEquippedSignatureItem('foreign', 'owner')).toBeNull();
  expect(mockRead).toHaveBeenCalledTimes(1);
});
