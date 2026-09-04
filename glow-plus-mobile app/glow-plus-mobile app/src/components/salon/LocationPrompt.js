import React from 'react';
import { StyleSheet, View } from 'react-native';
import Card from '../ui/Card';
import Text from '../ui/Text';
import Button from '../ui/Button';
import { colors, spacing } from '../../theme';

/**
 * The card that asks for location, and explains why BEFORE the OS prompt.
 *
 * ── NF5 ────────────────────────────────────────────────────────────────────
 * *"The app must request location access using the operating system's standard
 * permission prompt, and must clearly explain why location is being requested
 * before or at the time of that prompt."*
 *
 * This is the "before". The OS dialog gets one line of `Info.plist` text and
 * appears with no context if it is triggered on launch; this card appears in
 * the list, says what the permission buys and what happens to the data, and
 * only then triggers the real prompt. That ordering also materially improves
 * the chance of a yes — a prompt you understand is one you can agree to.
 *
 * ── NF6 ────────────────────────────────────────────────────────────────────
 * The second line is not marketing. *"The user's precise location must not be
 * stored on the backend or shared with any salon."* The app makes that true
 * (distance is computed in `utils/distance.js`, on device) — and this is where
 * the user is told, at the moment they are deciding.
 *
 * ── R3.9 ───────────────────────────────────────────────────────────────────
 * "Not now" is a first-class outcome with its own button, and dismissing this
 * card leaves the directory fully usable. The card must never be the only
 * thing on the screen.
 */
export default function LocationPrompt({ onEnable, onDismiss, loading = false, denied = false }) {
  return (
    <Card style={styles.card} elevation={0}>
      <View style={styles.head}>
        <View style={styles.glyph}>
          <Text variant="h3" color={colors.brandDeep}>
            ◎
          </Text>
        </View>
        <Text variant="h3" style={styles.title}>
          {denied ? 'Location is turned off' : 'Find salons near you'}
        </Text>
      </View>

      <Text variant="body" color={colors.inkSoft}>
        {denied
          ? 'Glow+ does not have permission to use your location, so salons cannot be sorted by distance. You can turn it on in your device Settings — everything else in the directory works without it.'
          : 'Allow location access to sort salons by how close they are, and to find a nearby one that still has appointments today.'}
      </Text>

      <Text variant="small" color={colors.inkFaint}>
        Your location is used on this device only. It is never sent to Glow+ and never shared with a
        salon.
      </Text>

      <View style={styles.actions}>
        <Button
          title={denied ? 'Open Settings' : 'Use my location'}
          onPress={onEnable}
          loading={loading}
          size="sm"
        />
        {onDismiss ? (
          <Button title="Not now" onPress={onDismiss} variant="ghost" size="sm" />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, backgroundColor: colors.surfaceAlt },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
});
