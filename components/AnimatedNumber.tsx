import React, { useEffect, useState } from 'react';
import { Text, TextProps } from 'react-native';

interface AnimatedNumberProps extends TextProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}

/**
 * Tweens a numeric value on JS thread and renders as Text.
 * Kept JS-side (not Reanimated worklet) for plain-text rendering simplicity.
 */
export default function AnimatedNumber({
  value,
  duration = 700,
  format = (n) => Math.round(n).toLocaleString(),
  style,
  ...rest
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const start = display;
    const delta = value - start;
    if (delta === 0) return;
    const startTime = Date.now();
    let raf: number;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + delta * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Text style={style} {...rest}>
      {format(display)}
    </Text>
  );
}
