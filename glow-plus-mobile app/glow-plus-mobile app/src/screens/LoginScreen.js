import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, typography } from '../theme';
import { login, signup, DEMO_MODE } from '../api/client';

export default function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password || (mode === 'signup' && !name)) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signup(name, email, password, phone);
      } else {
        await login(email, password);
      }
      onAuthenticated();
    } catch (err) {
      Alert.alert('Something went wrong', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <View style={styles.brandRow}>
        <Text style={styles.brand}>
          Glow<Text style={{ color: colors.accent }}>+</Text>
        </Text>
      </View>

      <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
      <Text style={styles.subtitle}>
        {mode === 'login'
          ? 'See your points and progress across every salon you visit.'
          : 'Track every visit, every salon, in one place.'}
      </Text>

      {DEMO_MODE && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>Demo mode — any email/password gets you in with sample data.</Text>
        </View>
      )}

      {mode === 'signup' && (
        <>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Joseph Ilunga" />
          <Text style={styles.label}>Phone (optional)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="431 338 3939"
            keyboardType="phone-pad"
          />
        </>
      )}

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        <Text style={styles.switchText}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <Text style={{ color: colors.accent, fontWeight: '700' }}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </Text>
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: 80 },
  brandRow: { marginBottom: spacing.xl },
  brand: { fontSize: 22, fontWeight: '800', color: colors.ink },
  title: { ...typography.h1, color: colors.ink, marginBottom: 8 },
  subtitle: { ...typography.body, color: colors.inkSoft, marginBottom: spacing.lg, lineHeight: 21 },
  demoBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  demoText: { fontSize: 12.5, color: colors.inkSoft },
  label: { ...typography.caption, color: colors.inkSoft, marginTop: spacing.md, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.inkFaint,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: colors.surface2,
    color: colors.ink,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  switchText: { textAlign: 'center', marginTop: spacing.md, color: colors.inkSoft, fontSize: 13.5 },
});
