import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Screen from '../../components/ui/Screen';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import Banner from '../../components/ui/Banner';
import { colors, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { messageFor } from '../../api/errors';

/**
 * Create an account  (R1.1)
 *
 * *"The app must allow a new user to create an account with name, email,
 * password, and an optional phone number."* All four fields, and the phone one
 * is **visibly** optional — labelled so, and omitted from the request entirely
 * rather than sent as an empty string, because the backend's DTO treats the
 * field as optional and `''` is a value.
 *
 * ── Validation is client-side AND server-side ──────────────────────────────
 * The checks below duplicate rules the API also enforces, and that duplication
 * is the point: a round trip to be told "password too short" is a second of
 * waiting for something the phone already knew. The server remains the
 * authority — nothing here is trusted by it.
 *
 * The 8-character minimum matches the platform's `MIN_PASSWORD`. If that
 * constant ever moves, this is the other place to change.
 *
 * ── Why signup does not sign you in ────────────────────────────────────────
 * The platform requires a verified email address before a consumer may log in.
 * Dropping the user into the app after signup would give them a shell where
 * every request 403s. So this ends on Sign in with a "check your inbox"
 * message, which is also what the website does.
 */
export default function SignUpScreen({ navigation }) {
  const { signUp } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const phoneRef = useRef(null);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clearing on edit, not on blur: an error that persists while the user is
    // visibly fixing it reads as the app not noticing.
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
  };

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = 'Please enter your name.';
    if (!form.email.trim()) next.email = 'Please enter your email address.';
    // Deliberately permissive — "contains an @ with something either side".
    // A stricter regex rejects valid addresses (new TLDs, plus-addressing,
    // unicode domains), and the server does the real check.
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = "That doesn't look like an email address.";
    if (!form.password) next.password = 'Please choose a password.';
    else if (form.password.length < 8) next.password = 'Use at least 8 characters.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await signUp(form);
      toast.success('Account created — check your email to verify it, then sign in.');
      navigation.replace('SignIn');
    } catch (err) {
      setSubmitError(err);
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
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text variant="display">Create your account</Text>
            <Text variant="body" color={colors.inkSoft}>
              One account works across the Glow+ app and website.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Name"
              value={form.name}
              onChangeText={set('name')}
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              error={errors.name}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              maxLength={200}
              testID="signup-name"
            />

            <TextField
              ref={emailRef}
              label="Email"
              value={form.email}
              onChangeText={set('email')}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              error={errors.email}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              maxLength={254}
              testID="signup-email"
            />

            <TextField
              ref={passwordRef}
              label="Password"
              value={form.password}
              onChangeText={set('password')}
              placeholder="At least 8 characters"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.password}
              hint="At least 8 characters."
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              testID="signup-password"
            />

            <TextField
              ref={phoneRef}
              label="Phone (optional)"
              value={form.phone}
              onChangeText={set('phone')}
              placeholder="+1 416 555 0134"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              hint="Only used if a salon needs to reach you about an appointment."
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              maxLength={32}
              testID="signup-phone"
            />

            {submitError ? (
              <Banner tone="danger" icon="!" title="Couldn't create your account" message={messageFor(submitError)} />
            ) : null}

            <Button
              title="Create account"
              onPress={handleSubmit}
              loading={submitting}
              fullWidth
              size="lg"
              testID="signup-submit"
            />

            <Text variant="small" color={colors.inkFaint} align="center">
              We'll email you a link to verify your address. You'll need it to sign in.
            </Text>
          </View>

          <Button
            title="I already have an account"
            variant="ghost"
            size="sm"
            onPress={() => navigation.goBack()}
            style={styles.centered}
          />
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
