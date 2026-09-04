import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Screen from '../../components/ui/Screen';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import Banner from '../../components/ui/Banner';
import { colors, spacing } from '../../theme';
import { forgotPassword, resendVerification } from '../../api/client';
import { messageFor } from '../../api/errors';

/**
 * Regain access to an account  (R1.7)
 *
 * *"The app must provide a way for a user who has forgotten their password to
 * regain access to their account."*
 *
 * ── Why the app does not contain the reset FORM ────────────────────────────
 * The reset link in the email is a web URL that the platform already serves
 * (`/reset-password?token=`), validated by `GET /auth/reset-password/:token`.
 * Rebuilding that form here would mean a second implementation of a
 * security-sensitive flow — a second place for the token-expiry check to be
 * wrong — and would still not help a user who opens the email on a laptop.
 * The app's job is to *trigger* the email, which is what R1.7 asks for.
 *
 * ── The same screen handles "resend verification" ──────────────────────────
 * Reached from Sign in's 403 branch. The two flows are identical from the
 * user's point of view — "send me an email so I can get in" — and differ only
 * in which endpoint is called, so splitting them into two screens would be two
 * copies of this form.
 *
 * ── The success message is deliberately vague about whether the account exists ──
 * `POST /auth/forgot-password` answers `{ ok: true }` for an unknown address
 * on purpose: telling a caller "no account with that email" turns the form
 * into an account-existence oracle. A client that reported the difference
 * would undo that, so the confirmation says "if there's an account".
 */
export default function ForgotPasswordScreen({ route, navigation }) {
  const initialEmail = route?.params?.email ?? '';
  const isResend = route?.params?.resend === true;

  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      await (isResend ? resendVerification(email) : forgotPassword(email));
      setSent(true);
    } catch (err) {
      // Only a network or server failure can reach here — the endpoint itself
      // does not report unknown addresses. See the note above.
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="display">{isResend ? 'Verify your email' : 'Reset your password'}</Text>
            <Text variant="body" color={colors.inkSoft}>
              {isResend
                ? "We'll send the verification link again. Open it, then come back and sign in."
                : "Enter your email and we'll send you a link to choose a new password."}
            </Text>
          </View>

          {sent ? (
            <View style={styles.form}>
              <Banner
                tone="success"
                icon="✓"
                title="Check your inbox"
                message={
                  isResend
                    ? `If there's an account for ${email.trim()} that still needs verifying, the link is on its way.`
                    : `If there's an account for ${email.trim()}, a reset link is on its way. Open it on any device.`
                }
              />
              <Text variant="small" color={colors.inkFaint}>
                Nothing after a few minutes? Check your spam folder, or try again with a different
                address.
              </Text>
              <Button title="Back to sign in" fullWidth onPress={() => navigation.goBack()} />
              <Button
                title="Send again"
                variant="ghost"
                size="sm"
                onPress={() => setSent(false)}
                style={styles.centered}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
                maxLength={254}
                testID="forgot-email"
              />

              {error ? (
                <Banner tone="danger" icon="!" title="Couldn't send that" message={messageFor(error)} />
              ) : null}

              <Button
                title={isResend ? 'Resend verification email' : 'Send reset link'}
                onPress={handleSubmit}
                loading={submitting}
                disabled={!email.trim()}
                fullWidth
                size="lg"
                testID="forgot-submit"
              />

              <Button
                title="Back to sign in"
                variant="ghost"
                size="sm"
                onPress={() => navigation.goBack()}
                style={styles.centered}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
  header: { gap: spacing.sm },
  form: { gap: spacing.lg },
  centered: { alignSelf: 'center' },
});
