import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from '../ui/Text';
import { colors, radius, spacing } from '../../theme';

/**
 * The search box over the salon directory  (R3.10)
 *
 * *"The app must allow a user to manually search or filter by city or area as
 * an alternative to device-detected location."*
 *
 * One box, matching **both** the salon's name and its city — the backend's
 * `?q=` is an OR across the two — because that is what a person types into a
 * search field. Splitting it into "name" and "city" would make the user decide
 * which kind of thing "Bloom" is before they can look for it.
 *
 * Not a `TextField`: this is a search affordance, with a pill shape, a leading
 * glyph and a clear button, and forcing it through the form-field component
 * would mean a `variant` prop that changes everything about it.
 */
export default function SalonSearchBar({ value, onChangeText, onClear, placeholder }) {
  return (
    <View style={styles.wrap}>
      <Text variant="body" color={colors.inkFaint}>
        ⌕
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? 'Search salons or a city'}
        placeholderTextColor={colors.inkFaint}
        autoCapitalize="words"
        autoCorrect={false}
        // `search` rather than `done`, so the keyboard's action key says what
        // it does. The list filters as you type either way — this only changes
        // the word on the key.
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search salons or a city"
        style={styles.input}
      />

      {value ? (
        <Pressable
          onPress={onClear}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.clear}
        >
          <Text variant="caption" color={colors.inkSoft}>
            ✕
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    minHeight: 46,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 11,
  },
  clear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
