/**
 * Choosing what an avatar tap opens.
 *
 * The two images are different renders, not two crops of one: the avatar is a
 * 1:1 bust, the fighter a 2:3 full body. Getting the aspect wrong letterboxes
 * the image inside a frame built for the other shape.
 */
import { renderHook, act } from '@testing-library/react-native';
import { usePortraitViewer } from '@/hooks/usePortraitViewer';
import type { BattleCharacterInfo } from '@/hooks/useBattleCharacters';

function character(
  over: Partial<BattleCharacterInfo> = {},
): BattleCharacterInfo {
  return {
    name: 'Andrew',
    archetype: 'trickster',
    signatureColor: '#8B5CF6',
    portraitUrl: 'https://example.test/avatar.png',
    fighterUrl: 'https://example.test/fighter.png',
    cosmetics: {},
    ...over,
  } as BattleCharacterInfo;
}

describe('usePortraitViewer', () => {
  it('opens the full-body render at 2:3 when there is one', () => {
    const { result } = renderHook(() => usePortraitViewer());
    act(() => result.current.open(character()));

    expect(result.current.viewer).toEqual({
      uri: 'https://example.test/fighter.png',
      caption: 'Andrew',
      aspect: 1.5,
    });
    expect(result.current.visible).toBe(true);
  });

  it('falls back to the avatar at 1:1 for pre-avatar characters', () => {
    // Characters rendered before avatars existed have one image, so there is
    // nothing "fuller" to open — the tap should still enlarge what exists.
    const { result } = renderHook(() => usePortraitViewer());
    act(() => result.current.open(character({ fighterUrl: null })));

    expect(result.current.viewer).toEqual({
      uri: 'https://example.test/avatar.png',
      caption: 'Andrew',
      aspect: 1,
    });
  });

  it('stays shut when there is no image at all', () => {
    const { result } = renderHook(() => usePortraitViewer());
    act(() =>
      result.current.open(character({ fighterUrl: null, portraitUrl: null })),
    );
    expect(result.current.visible).toBe(false);
  });

  it('stays shut for a missing character', () => {
    const { result } = renderHook(() => usePortraitViewer());
    act(() => result.current.open(null));
    expect(result.current.visible).toBe(false);
  });

  describe('canOpen', () => {
    it('is false with no imagery, so the avatar stays a plain image', () => {
      const { result } = renderHook(() => usePortraitViewer());
      expect(
        result.current.canOpen(
          character({ fighterUrl: null, portraitUrl: null }),
        ),
      ).toBe(false);
      expect(result.current.canOpen(null)).toBe(false);
    });

    it('is true when either render exists', () => {
      const { result } = renderHook(() => usePortraitViewer());
      expect(result.current.canOpen(character())).toBe(true);
      expect(result.current.canOpen(character({ fighterUrl: null }))).toBe(true);
    });
  });

  it('re-signs and closes when the URL has expired', () => {
    // Signed URLs last ~1h, a Bo3 round can run 2h, and a dead image gives the
    // player nothing to act on.
    const onExpired = jest.fn();
    const { result } = renderHook(() => usePortraitViewer(onExpired));

    act(() => result.current.open(character()));
    expect(result.current.visible).toBe(true);

    act(() => result.current.handleError());
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(result.current.visible).toBe(false);
  });

  it('closes on request', () => {
    const { result } = renderHook(() => usePortraitViewer());
    act(() => result.current.open(character()));
    act(() => result.current.close());
    expect(result.current.visible).toBe(false);
  });
});
