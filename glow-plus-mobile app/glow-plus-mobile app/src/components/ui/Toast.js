import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from './Text';
import { colors, motion, radius, shadow, spacing } from '../../theme';

/**
 * The transient confirmation — "Booking requested", "Appointment cancelled".
 *
 * Rendered once, at the app root, by `ToastProvider`. Screens never mount one;
 * they call `toast.success(...)`. That is what stops two toasts from stacking
 * on top of each other when a screen navigates while one is still visible.
 *
 * **It appears at the TOP, not the bottom.** The bottom of the screen is the
 * tab bar and, on a booking screen, the primary action — a toast there covers
 * the control the user is about to press next. It also sits below the status
 * bar inset, so it does not overlap the clock.
 *
 * Tapping it dismisses it early, because a message the user has read should
 * not be something they have to wait out.
 */
export default function Toast({ toast, onDismiss }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return undefined;

    anim.setValue(0);
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.6,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: motion.fast,
        useNativeDriver: true,
      }).start(({ finished }) => finished && onDismiss?.());
    }, toast.duration ?? 3200);

    return () => clearTimeout(timer);
  }, [toast, anim, onDismiss]);

  if (!toast) return null;

  const palette = {
    success: { bg: colors.ink, fg: colors.white },
    error: { bg: colors.danger, fg: colors.white },
    info: { bg: colors.ink, fg: colors.white },
  }[toast.tone ?? 'info'];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: insets.top + spacing.sm },
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onDismiss}
        // `liveRegion`/`accessibilityLiveRegion` is what makes a screen reader
        // announce the message without the user having to find it.
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, shadow(3), { backgroundColor: palette.bg }]}
      >
        <Text variant="smallStrong" color={palette.fg} numberOfLines={3}>
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
