import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, motion, radius } from '../../theme';

/**
 * The fill indicator R2.3 asks for.
 *
 * *"For each active reward rule at a salon the user has visited, the app must
 * show visual progress toward that reward (for example, a fill indicator
 * showing 3 of 5 required visits)."*
 *
 * **Animated with `useNativeDriver: false`, and that is not an oversight.**
 * `width` is a layout property, which the native driver cannot animate — it
 * only handles `transform` and `opacity`. The alternative is a full-width bar
 * that is `scaleX`-ed, which animates on the UI thread but also scales the
 * rounded end caps into ellipses. For a bar that animates once per screen
 * load, over 220 ms, a JS-driven width is the right trade; for anything that
 * animates per frame it would not be.
 *
 * The bar is `accessible` with a `progressbar` role, so VoiceOver reads
 * "40 percent" rather than skipping it silently.
 */
export default function ProgressBar({
  value = 0,
  color = colors.brand,
  track = colors.surfaceSunken,
  height = 8,
  animated = true,
  label,
}) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  const width = useRef(new Animated.Value(animated ? 0 : clamped)).current;

  useEffect(() => {
    if (!animated) {
      width.setValue(clamped);
      return;
    }
    const animation = Animated.timing(width, {
      toValue: clamped,
      duration: motion.base,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [clamped, animated, width]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: track, height, borderRadius: height / 2 }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            height,
            borderRadius: height / 2,
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', borderRadius: radius.pill },
  fill: { position: 'absolute', left: 0, top: 0 },
});
