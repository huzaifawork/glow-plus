import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from './Text';
import Button from './Button';
import { colors, radius, spacing } from '../../theme';
import { isRetryable, messageFor, NetworkError } from '../../api/errors';

/**
 * The three states that are not "here is your content", in one component each.
 *
 * NF4: *"The app must handle a lost or slow network connection gracefully,
 * with a clear message to the user rather than a silent failure or crash."*
 *
 * `ErrorState` is where that requirement is actually met, so it does the one
 * thing a generic error box usually does not: it **reads the error's type** and
 * changes both the headline and whether a Retry button appears. A 400 saying
 * "that slot was just booked" is not a connection problem and must not be
 * offered a Retry that will fail identically; a lost connection is, and must.
 */

/** Nothing here yet — and why that is fine. */
export function EmptyState({ icon = '✦', title, message, action, onAction, style }) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.glyphWrap}>
        <Text variant="h1" color={colors.brand}>
          {icon}
        </Text>
      </View>
      <Text variant="h3" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" color={colors.inkSoft} align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {action && onAction ? (
        <Button title={action} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

/** Something failed. Says what, and offers Retry only when retrying could help. */
export function ErrorState({ error, onRetry, style, compact = false }) {
  const offline = error instanceof NetworkError;
  const canRetry = onRetry && isRetryable(error);

  return (
    <View style={[compact ? styles.compact : styles.wrap, style]}>
      <View style={[styles.glyphWrap, styles.glyphWrapError]}>
        <Text variant="h2" color={colors.danger}>
          {offline ? '⚡' : '!'}
        </Text>
      </View>
      <Text variant="h3" align="center">
        {offline ? "You're offline" : 'Something went wrong'}
      </Text>
      <Text variant="body" color={colors.inkSoft} align="center" style={styles.message}>
        {messageFor(error)}
      </Text>
      {canRetry ? (
        <Button title="Try again" onPress={onRetry} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

/**
 * A loading state with a `children` escape hatch for a skeleton.
 *
 * Callers pass skeletons where the shape of the content is known (a list of
 * cards) and fall through to the spinner where it is not (a one-off action).
 * The accessible announcement is on the wrapper either way, so a screen-reader
 * user is told the screen is loading even when the visual is a set of grey
 * boxes that are themselves hidden from accessibility.
 */
export function LoadingState({ children, label = 'Loading', style }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={[styles.loading, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  compact: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  glyphWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  glyphWrapError: { backgroundColor: colors.dangerSoft },
  message: { maxWidth: 320 },
  action: { marginTop: spacing.md, alignSelf: 'center' },
  loading: { gap: spacing.md },
});
