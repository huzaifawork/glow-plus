import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Text from './Text';
import { colors, radius, spacing } from '../../theme';

/**
 * Every text input in the app.
 *
 * The parts that are easy to leave out and expensive to add back:
 *
 *  · **An error is shown BELOW the field, and the field turns red.** Putting
 *    the message in the placeholder (which several apps do) means it vanishes
 *    the moment the user starts fixing it.
 *  · **`accessibilityLabel` falls back to the visible label**, so a screen
 *    reader announces "Email, text field" rather than "text field".
 *  · **The password reveal is a real control**, 44 pt, not a 20 pt eye.
 *  · **`autoComplete`/`textContentType` are passed through**, which is what
 *    makes iOS offer the saved password and Android offer the one-time code.
 *    Without them, signing in means typing a password on a phone keyboard.
 */
const TextField = forwardRef(function TextField(
  {
    label,
    value,
    onChangeText,
    placeholder,
    error,
    hint,
    secureTextEntry = false,
    keyboardType = 'default',
    autoCapitalize = 'none',
    autoComplete,
    textContentType,
    returnKeyType,
    onSubmitEditing,
    editable = true,
    multiline = false,
    maxLength,
    style,
    testID,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isSecret = secureTextEntry && !revealed;

  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <Text variant="smallStrong" color={colors.inkSoft} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
          !editable && styles.fieldDisabled,
          multiline && styles.fieldMultiline,
        ]}
      >
        <TextInput
          ref={ref}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          secureTextEntry={isSecret}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={[styles.input, multiline && styles.inputMultiline]}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={12}
            style={styles.reveal}
          >
            <Text variant="smallStrong" color={colors.brand}>
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text variant="small" color={colors.danger} style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color={colors.inkFaint} style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { marginLeft: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldMultiline: { alignItems: 'flex-start', paddingVertical: spacing.sm, minHeight: 92 },
  fieldFocused: { borderColor: colors.brand, backgroundColor: colors.white },
  fieldError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  fieldDisabled: { backgroundColor: colors.surfaceSunken },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    paddingVertical: 12,
  },
  inputMultiline: { textAlignVertical: 'top', paddingTop: 0 },
  reveal: { paddingLeft: spacing.sm, paddingVertical: spacing.sm },
  helper: { marginLeft: spacing.xs },
});
