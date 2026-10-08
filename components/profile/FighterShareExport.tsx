import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import FighterCard, {
  type FighterCardProps,
} from '@/components/game/FighterCard';
import { useThemedColors } from '@/hooks/useThemedColors';

/** Mounted only while sharing. Screen height limits never enter this composition. */
export default function FighterShareExport({
  fighter,
  onReady,
  onError,
}: {
  fighter: FighterCardProps;
  onReady: (ref: React.RefObject<View | null>) => void;
  onError: () => void;
}) {
  const colors = useThemedColors();
  const ref = useRef<View>(null);
  const settled = useRef(false);
  const [laidOut, setLaidOut] = useState(false);
  const [artLoaded, setArtLoaded] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(
    !fighter.cosmetics?.frame?.artwork?.portrait,
  );
  const [fontTimeout, setFontTimeout] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    'BarlowCondensed-Bold': require('../../assets/fonts/BarlowCondensed-Bold.ttf'),
    'BarlowCondensed-ExtraBoldItalic': require('../../assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf'),
  });
  const fail = () => {
    if (!settled.current) {
      settled.current = true;
      onError();
    }
  };
  useEffect(() => {
    const fonts = setTimeout(() => setFontTimeout(true), 3000);
    const timeout = setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        onError();
      }
    }, 12000);
    return () => {
      clearTimeout(fonts);
      clearTimeout(timeout);
    };
  }, [onError]);
  useEffect(() => {
    if (
      !laidOut ||
      !artLoaded ||
      !frameLoaded ||
      !(fontsLoaded || fontError || fontTimeout)
    )
      return;
    let second: number;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (!settled.current) {
          settled.current = true;
          onReady(ref);
        }
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second != null) cancelAnimationFrame(second);
    };
  }, [
    laidOut,
    artLoaded,
    frameLoaded,
    fontsLoaded,
    fontError,
    fontTimeout,
    onReady,
  ]);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: -10000, top: 0, width: 384 }}
    >
      <View
        ref={ref}
        collapsable={false}
        onLayout={() => setLaidOut(true)}
        testID="fighter-share-export"
        style={{ width: 384, padding: 12, backgroundColor: colors.background }}
      >
        <FighterCard
          {...fighter}
          variant="hero"
          maxArtworkHeight={undefined}
          onPress={undefined}
          onArtworkLoaded={() => setArtLoaded(true)}
          onFrameLoaded={() => setFrameLoaded(true)}
          onImageError={fail}
          onFrameError={fail}
        />
      </View>
    </View>
  );
}
