import React, { useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import { colors, radius, spacing } from '../../theme';
import { dateStripParts, todayKey, upcomingDateKeys } from '../../utils/datetime';

const ITEM_WIDTH = 60;
const ITEM_GAP = spacing.sm;

/**
 * The horizontal date picker  (R3.3, and R3.5's "whenever the user changes the
 * selected date")
 *
 * **A strip, not a calendar modal.** Choosing an appointment day is almost
 * always "today, tomorrow, or this weekend", and a strip makes those one tap
 * with the answer — the slots, or the salon's availability — visible on the
 * same screen. A modal calendar hides the result behind a dismiss.
 *
 * `getItemLayout` is supplied because every cell is exactly the same width.
 * That is what makes `scrollToIndex` work without measuring, and it is what
 * lets `FlatList` skip layout for off-screen cells entirely — the difference
 * between a strip that flicks and one that hitches on a mid-range Android.
 *
 * A day the salon is closed is still selectable. The screen answers with
 * "Closed" from the server rather than the strip pretending the day does not
 * exist — a user checking whether their usual salon opens on Sunday deserves
 * an answer, not a missing cell.
 */
export default function DateStrip({ value, onChange, days = 21, closedDates = new Set() }) {
  const listRef = useRef(null);
  const dates = useRef(upcomingDateKeys(days)).current;
  const today = todayKey();

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={dates}
      keyExtractor={(d) => d}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      // The strip is short and fixed-length, so windowing it would cost more
      // than it saves — but the layout hint still helps scroll performance.
      getItemLayout={(_, index) => ({
        length: ITEM_WIDTH + ITEM_GAP,
        offset: (ITEM_WIDTH + ITEM_GAP) * index,
        index,
      })}
      renderItem={({ item }) => (
        <DateCell
          dateKey={item}
          selected={item === value}
          isToday={item === today}
          closed={closedDates.has(item)}
          onPress={() => onChange(item)}
        />
      )}
    />
  );
}

function DateCell({ dateKey, selected, isToday, closed, onPress }) {
  const { weekday, day, month } = dateStripParts(dateKey);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${weekday} ${day} ${month}${isToday ? ', today' : ''}${
        closed ? ', closed' : ''
      }`}
      style={({ pressed }) => [
        styles.cell,
        selected && styles.cellSelected,
        pressed && !selected && styles.cellPressed,
      ]}
    >
      <Text variant="caption" color={selected ? 'rgba(255,255,255,0.7)' : colors.inkFaint}>
        {isToday ? 'TODAY' : weekday.toUpperCase()}
      </Text>
      <Text variant="h3" color={selected ? colors.white : colors.ink}>
        {day}
      </Text>
      <Text variant="caption" color={selected ? 'rgba(255,255,255,0.7)' : colors.inkFaint}>
        {month}
      </Text>

      {/* A dot rather than greying the cell out: the day is still selectable,
          and a disabled-looking cell that responds to taps is worse than a
          normal one that answers "Closed". */}
      {closed ? (
        <View
          style={[styles.closedDot, { backgroundColor: selected ? colors.white : colors.inkFaint }]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: ITEM_GAP, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
  cell: {
    width: ITEM_WIDTH,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    gap: 1,
  },
  cellSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  cellPressed: { backgroundColor: colors.surfaceSunken },
  closedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
});
