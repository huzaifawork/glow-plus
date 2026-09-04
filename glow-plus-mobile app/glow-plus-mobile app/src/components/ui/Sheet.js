import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from './Text';
import { colors, motion, radius, shadow, spacing } from '../../theme';

/**
 * A bottom sheet — used to confirm a booking and to confirm a cancellation.
 *
 * **Why a sheet and not `Alert.alert`.** A system alert cannot show the thing
 * being confirmed. "Cancel this booking?" with two buttons asks the user to
 * remember which of three appointments they tapped; a sheet shows the salon,
 * the service and the time above the buttons. For an action that cannot be
 * undone (R4.3), that difference is the whole safeguard.
 *
 * Three details that are easy to miss and load-bearing on a phone:
 *
 *  · **The Android hardware back button closes it.** Without an explicit
 *    handler, back dismisses the whole `Modal` on some versions and does
 *    nothing on others; either way the sheet's own `onClose` never runs and
 *    the screen behind it keeps thinking the sheet is open.
 *  · **The backdrop is a real pressable**, so tapping outside dismisses —
 *    which is what every user tries first.
 *  · **The bottom padding respects the home indicator**, or the primary
 *    action sits under the gesture bar and cannot be tapped.
 */
export default function Sheet({ visible, onClose, title, subtitle, children, footer }) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: visible ? motion.base : motion.fast,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose?.();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <Animated.View
        style={[
          styles.sheet,
          shadow(4),
          {
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
            ],
            opacity: slide,
          },
        ]}
      >
        <View style={styles.grabber} />

        {title ? (
          <View style={styles.header}>
            <Text variant="h2" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="small" color={colors.inkSoft}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Scrollable, because a long booking summary on a small phone in
            landscape would otherwise push the confirm button off the sheet. */}
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: spacing.lg,
  },
  header: { gap: 2, marginBottom: spacing.lg },
  bodyScroll: { flexGrow: 0 },
  body: { gap: spacing.md, paddingBottom: spacing.sm },
  footer: { gap: spacing.sm, paddingTop: spacing.lg },
});
