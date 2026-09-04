import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Brandmark from '../components/ui/Brandmark';
import Text from '../components/ui/Text';
import { colors, spacing } from '../theme';

/**
 * What is on screen while the session is being restored  (R1.5)
 *
 * The app reads the keychain and asks `GET /me` who the stored token belongs
 * to before deciding what to render. That is usually a few hundred
 * milliseconds and occasionally longer on a cold serverless start, and this is
 * what fills it.
 *
 * It matches the native splash in `app.json` — same mark, same near-black
 * ground — so the handover from the OS splash to the JS one is invisible
 * rather than a flash of a different screen.
 *
 * `quiet` drops the spinner and the wordmark, for the moment a route is
 * dismissing itself and anything visible would flicker.
 */
export default function SplashScreen({ quiet = false }) {
  return (
    <View style={styles.root} accessible accessibilityLabel="Loading Glow Plus">
      {!quiet ? (
        <>
          <Brandmark size={64} />
          <Text variant="h2" color={colors.white}>
            Glow+
          </Text>
          <ActivityIndicator color={colors.brand} style={styles.spinner} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
    gap: spacing.md,
  },
  spinner: { marginTop: spacing.lg },
});
