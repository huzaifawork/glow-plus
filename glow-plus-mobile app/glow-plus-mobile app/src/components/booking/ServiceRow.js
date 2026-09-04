import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import { accentForType, colors, radius, spacing } from '../../theme';
import { formatDuration } from '../../utils/datetime';

/**
 * One bookable service on a salon's menu  (R3.2)
 *
 * *"The app must let a user browse the bookable services offered by a specific
 * salon."*
 *
 * Selection is a **border and a tint**, not only a checkmark: on a list of
 * three similar rows, a small tick in the corner is easy to miss, and the user
 * needs to be certain which service they are about to book before the price of
 * being wrong is a real appointment.
 *
 * The points value is shown because it is the reason a Glow+ customer is
 * choosing this app over calling the salon — every service is also progress
 * toward a reward, and hiding that here would disconnect the two halves of the
 * product.
 */
function ServiceRow({ service, selected, onPress, last = false }) {
  const accent = accentForType(service.type);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${service.name}, ${formatDuration(service.durationMinutes)}, earns ${
        service.pointsPerVisit
      } points`}
      android_ripple={{ color: 'rgba(224, 17, 111, 0.08)' }}
      style={({ pressed }) => [
        styles.row,
        !last && !selected && styles.divider,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.badge, { backgroundColor: accent.bg }]}>
        <Text variant="caption" color={accent.fg}>
          {accent.label}
        </Text>
      </View>

      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {service.name}
        </Text>
        <Text variant="small" color={colors.inkSoft}>
          {formatDuration(service.durationMinutes)} · +{service.pointsPerVisit} points
        </Text>
      </View>

      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

export default memo(ServiceRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 64,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    borderRadius: 0,
  },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  pressed: { opacity: 0.75 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    minWidth: 46,
    alignItems: 'center',
  },
  text: { flex: 1, gap: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
});
