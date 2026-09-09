import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Button from '../ui/Button';
import Text from '../ui/Text';
import { colors, radius, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { isGoogleSignInAvailable } from '../../api/supabase';
import { messageFor } from '../../api/errors';

/**
 * "Continue with Google"  (R1.2 / R1.3)
 *
 * One component rather than a copy on each auth screen, because the three
 * things that are easy to get wrong here have to be got right identically in
 * both places:
 *
 *  1. **A cancel is not a failure.** `signInWithGoogle` resolves to `null`
 *     when the user dismisses the browser sheet. Showing an error to someone
 *     who deliberately backed out is the most common bug in this button, and
 *     it is indistinguishable from a real failure once both are `catch`.
 *  2. **The button hides itself when the build cannot use it.** A build with
 *     no Supabase project configured would open a browser to nowhere; an
 *     always-visible button that always fails is worse than no button.
 *  3. **The screen does not need dismissing on success.** The caller is given
 *     `onSuccess` for that, because the two screens dismiss differently — see
 *     the note in `SignInScreen`.
 *
 * ── Where the session comes from ───────────────────────────────────────────
 * Nothing here knows about Google or Supabase beyond the availability check.
 * `AuthContext.signInWithGoogle` runs the OAuth flow and trades the result for
 * an ordinary Glow+ session, so by the time `onSuccess` fires the app is in
 * exactly the state a password sign-in would have left it in.
 */
export default function GoogleSignInButton({ onSuccess, onError, disabled = false, label }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Subscribed to, not read. `isGoogleSignInAvailable` reads the config module
  // directly — it has to, because `api/supabase.js` is not a component — and a
  // module read alone does not re-render. The overrides load asynchronously on
  // launch and demo mode is a Settings toggle, so without this the button's
  // presence would be decided by whichever happened first on this run.
  useConfig();

  // R5.2's sibling: a build that was not given a Supabase project simply does
  // not offer this way in. Email and password are unaffected.
  if (!isGoogleSignInAvailable()) return null;

  async function handlePress() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await signInWithGoogle();
      // `null` is a cancel. Leave the screen exactly as the user left it.
      if (profile) onSuccess?.(profile);
    } catch (err) {
      setError(err);
      onError?.(err);
    } finally {
      // Guarded against nothing in particular — the flow always resolves, and
      // leaving a spinner on a button the user can see is the failure mode
      // that gets reported as "the app froze".
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Button
        title={label ?? 'Continue with Google'}
        variant="secondary"
        size="lg"
        fullWidth
        loading={busy}
        disabled={disabled}
        onPress={handlePress}
        left={<GoogleMark />}
        accessibilityHint="Opens Google in your browser to sign in"
        testID="google-signin"
      />
      {error ? (
        <Text variant="small" color={colors.danger}>
          {messageFor(error)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The Google mark, drawn rather than imported.
 *
 * Same reasoning as `Brandmark`: this sits on the first screen a signed-out
 * user sees, and an `<Image>` here would leave a hole in the button while the
 * asset resolves. The app has no SVG renderer among its dependencies, and
 * adding one for a single glyph is not a trade worth making — so this is the
 * letterform in Google Blue on white, which is the light-theme button Google's
 * own guidelines describe, rather than a four-colour mark faked out of
 * overlapping views.
 */
function GoogleMark() {
  return (
    <View style={styles.mark}>
      <Text style={styles.markLetter} allowFontScaling={false}>
        G
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  mark: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markLetter: {
    // Not scaled with the OS font setting: the glyph is sized to a fixed
    // 22 pt circle, and letting it grow pushes it out of its own background.
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
});
