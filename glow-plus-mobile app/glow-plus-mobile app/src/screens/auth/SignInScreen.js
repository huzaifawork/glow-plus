import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Screen from '../../components/ui/Screen';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import Banner from '../../components/ui/Banner';
import Brandmark from '../../components/ui/Brandmark';
import { colors, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { ApiError, messageFor } from '../../api/errors';

/**
 * Sign in  (R1.2, R1.3)
 *
 * *"The app must allow an existing user to log in with email and password"*,
 * against *"the same account system as the rest of the Glow+ platform, so a
 * consumer's login works identically whether they signed up through the app or
 * through the website."* — hence `POST /auth/login`, the website's own
 * endpoint, and no app-specific account concept anywhere.
 *
 * ── The 403 branch ─────────────────────────────────────────────────────────
 * The platform refuses login until the email address is verified, and answers
 * **403** (not 401) to say so. Without the branch below, a user who signed up
 * five minutes ago and has not opened their email sees "Invalid email or
 * password" — sends them to reset a password that is perfectly correct. The
 * branch turns it into the actual problem plus the one action that fixes it.
 *
 * This screen is the app's entry point for a signed-out user — `RootNavigator`
 * renders nothing else until `isAuthenticated` is true, by product decision.
 */
export default function SignInScreen({ navigation }) {
  const { signIn, error: sessionError, clearError } = useAuth();
  const { demoMode } = useConfig();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const passwordRef = useRef(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setNeedsVerification(false);
    clearError();

    try {
      await signIn(email, password);

      // No navigation call needed: `isAuthenticated` flipping to true makes
      // `RootNavigator` swap this whole Auth tree for the authenticated app
      // on the next render.
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setNeedsVerification(true);
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        // `padding` on iOS and `height` on Android is the pairing that works;
        // using `padding` on Android leaves the keyboard covering the submit
        // button on most devices.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Brandmark size={56} />
            <Text variant="display">Welcome back</Text>
            <Text variant="body" color={colors.inkSoft}>
              Sign in to see your points and manage your appointments.
            </Text>
          </View>

          {demoMode ? (
            <Banner
              tone="info"
              icon="◆"
              title="Demo mode is on"
              message="Any email and password will sign you in, and the data is sample data."
            />
          ) : null}

          {sessionError ? (
            <Banner tone="warning" icon="!" title="Signed out" message={sessionError} />
          ) : null}

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="signin-email"
            />

            <TextField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              testID="signin-password"
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text variant="small" color={colors.danger}>
                  {messageFor(error)}
                </Text>
                {needsVerification ? (
                  <Button
                    title="Resend verification email"
                    variant="ghost"
                    size="sm"
                    onPress={() => navigation.navigate('ForgotPassword', { email, resend: true })}
                  />
                ) : null}
              </View>
            ) : null}

            <Button
              title="Sign in"
              onPress={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
              fullWidth
              size="lg"
              testID="signin-submit"
            />

            <Button
              title="Forgot your password?"
              variant="ghost"
              size="sm"
              onPress={() => navigation.navigate('ForgotPassword', { email })}
              style={styles.centered}
            />
          </View>

          <View style={styles.footer}>
            <Text variant="small" color={colors.inkSoft} align="center">
              New to Glow+?
            </Text>
            <Button
              title="Create an account"
              variant="secondary"
              fullWidth
              onPress={() => navigation.navigate('SignUp')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.xl,
    justifyContent: 'center',
  },
  header: { gap: spacing.sm, alignItems: 'flex-start' },
  form: { gap: spacing.lg },
  errorBox: { gap: spacing.xs },
  footer: { gap: spacing.sm },
  centered: { alignSelf: 'center' },
});
