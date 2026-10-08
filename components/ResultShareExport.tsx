import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import ResultShareCard, { type ResultShareCardProps } from './ResultShareCard';
import { useThemedColors } from '@/hooks/useThemedColors';

/** A steady export mounted for one battle revision and one sharing attempt. */
export default function ResultShareExport({
  card,
  onReady,
  onError,
  portraitsResolved = true,
}: {
  card: ResultShareCardProps;
  onReady: (ref: React.RefObject<View | null>) => void;
  onError: () => void;
  portraitsResolved?: boolean;
}) {
  const colors = useThemedColors();
  const ref = useRef<View>(null);
  const settled = useRef(false);
  const [laidOut, setLaidOut] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [fontTimeout, setFontTimeout] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    'BarlowCondensed-Bold': require('../assets/fonts/BarlowCondensed-Bold.ttf'),
    'BarlowCondensed-ExtraBoldItalic': require('../assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf'),
  });
  const required = ['me:avatar', 'them:avatar'];
  if (card.me.cosmetics?.frame?.artwork?.avatar) required.push('me:frame');
  if (card.them.cosmetics?.frame?.artwork?.avatar) required.push('them:frame');
  const artworkReady = required.every((asset) => loaded[asset]);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const fail = () => {
    if (settled.current) return;
    settled.current = true;
    callbacks.current.onError();
  };
  useEffect(() => {
    const fonts = setTimeout(() => setFontTimeout(true), 3000);
    const timeout = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      callbacks.current.onError();
    }, 12000);
    return () => {
      clearTimeout(fonts);
      clearTimeout(timeout);
    };
  }, []);
  useEffect(() => {
    if (
      !portraitsResolved ||
      !laidOut ||
      !artworkReady ||
      !(fontsLoaded || fontError || fontTimeout)
    )
      return;
    let second: number;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (settled.current) return;
        settled.current = true;
        callbacks.current.onReady(ref);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second != null) cancelAnimationFrame(second);
    };
  }, [
    portraitsResolved,
    laidOut,
    artworkReady,
    fontsLoaded,
    fontError,
    fontTimeout,
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
        testID="result-share-export"
        onLayout={() => setLaidOut(true)}
        style={{ width: 384, padding: 12, backgroundColor: colors.background }}
      >
        <ResultShareCard
          {...card}
          onArtworkLoaded={(asset) =>
            setLoaded((old) => (old[asset] ? old : { ...old, [asset]: true }))
          }
          onArtworkError={fail}
        />
      </View>
    </View>
  );
}
