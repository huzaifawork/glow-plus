import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';

/**
 * The grey shape that stands in for content while it loads.
 *
 * **Why skeletons and not a spinner.** A spinner tells the user something is
 * happening; a skeleton tells them *what* is about to appear, and it holds the
 * layout so nothing jumps when the data lands. On a list of salon cards that
 * difference is the whole perceived speed of the app — content that fades into
 * a shape that was already there reads as fast, and content that pushes a
 * spinner out of the way reads as slow, at identical latency.
 *
 * The shimmer runs on `opacity` with `useNativeDriver: true`, so it costs
 * nothing on the JS thread — which matters precisely because the JS thread is
 * busy doing the fetch and the parse this is covering for.
 */
export function Skeleton({ width, height = 14, radius: r = radius.sm, style }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      // Hidden from screen readers: announcing four grey rectangles is worse
      // than announcing nothing. The screen's own loading state carries the
      // accessible message.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { width, height, borderRadius: r, opacity: pulse },
        style,
      ]}
    />
  );
}

/** A stand-in for one salon card, so the Discover list has no empty first frame. */
export function SalonCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={52} height={52} radius={radius.md} />
        <View style={styles.grow}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="45%" height={12} style={styles.gap} />
        </View>
      </View>
      <Skeleton width="55%" height={22} radius={radius.pill} style={styles.gapLg} />
    </View>
  );
}

/** A stand-in for one salon's rewards block. */
export function RewardCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton width="60%" height={18} />
      <Skeleton width="100%" height={8} radius={radius.pill} style={styles.gapLg} />
      <Skeleton width="40%" height={12} style={styles.gap} />
    </View>
  );
}

/** A stand-in for one booking row. */
export function BookingCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={44} height={44} radius={radius.md} />
        <View style={styles.grow}>
          <Skeleton width="65%" height={15} />
          <Skeleton width="40%" height={12} style={styles.gap} />
        </View>
        <Skeleton width={80} height={24} radius={radius.pill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surfaceSunken },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1, gap: spacing.xs },
  gap: { marginTop: spacing.xs },
  gapLg: { marginTop: spacing.md },
});

export default Skeleton;
