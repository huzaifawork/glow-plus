import React, { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Text from '../ui/Text';
import { colors, radius, spacing } from '../../theme';
import { formatTime } from '../../utils/datetime';

/**
 * One bookable start time.
 *
 * The label is the time and nothing else — the salon, the service and the date
 * are all fixed by the time the user reaches this grid, so repeating them on
 * forty chips would be noise. The **accessibility** label is the full sentence,
 * because a screen reader user arriving on a chip out of context needs it.
 *
 * `seatsAvailable` is shown only when the salon is nearly full (1 seat left).
 * "3 seats" on every chip is information nobody uses; "1 left" on the last one
 * is a reason to tap now, and it comes free from the platform's capacity-aware
 * availability.
 */
function SlotChip({ slot, selected, onPress }) {
  const label = formatTime(slot.startTime);
  const scarce = slot.seatsTotal > 1 && slot.seatsAvailable === 1;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${scarce ? ', 1 seat left' : ''}`}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && !selected && styles.pressed,
      ]}
    >
      <Text variant="bodyStrong" color={selected ? colors.white : colors.ink}>
        {label}
      </Text>
      {scarce ? (
        <Text variant="caption" color={selected ? 'rgba(255,255,255,0.75)' : colors.warning}>
          1 left
        </Text>
      ) : null}
    </Pressable>
  );
}

export default memo(SlotChip);

const styles = StyleSheet.create({
  chip: {
    minWidth: 84,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.brand, borderColor: colors.brand },
  pressed: { backgroundColor: colors.surfaceSunken },
});
