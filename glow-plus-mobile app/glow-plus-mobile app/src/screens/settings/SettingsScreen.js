import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import Screen from '../../components/ui/Screen';
import ScreenHeader from '../../components/ui/ScreenHeader';
import Text from '../../components/ui/Text';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Banner from '../../components/ui/Banner';
import ListRow from '../../components/ui/ListRow';
import Sheet from '../../components/ui/Sheet';
import TextField from '../../components/ui/TextField';
import SectionHeader from '../../components/ui/SectionHeader';
import { colors, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { useLocation } from '../../context/LocationContext';
import { useNotifications } from '../../context/NotificationContext';
import { useToast } from '../../context/ToastContext';
import { pingBackend } from '../../api/client';
import { messageFor } from '../../api/errors';
import { SALON_TIMEZONE } from '../../utils/datetime';

/**
 * Settings — the account, and the two knobs Section 4.5 requires.
 *
 * ── R5.2 ───────────────────────────────────────────────────────────────────
 * *"The address of the backend service the app connects to must be
 * configurable, not fixed in the app's source code."* The **Backend** row is
 * that, at runtime, on the device — so a reviewer with a TestFlight build can
 * point it at staging without a rebuild. `Test connection` exists because a
 * URL you cannot verify is a URL you have to debug through every other screen.
 *
 * ── R5.1 ───────────────────────────────────────────────────────────────────
 * *"The app must be usable for evaluation and demonstration purposes without
 * requiring a live backend connection."* The **Demo mode** switch. Turning it
 * on swaps every request to the in-memory dataset in `api/demo.js`; every
 * screen refetches, because the config is in their dependency arrays.
 *
 * ── R4.5 and NF5/NF6 ───────────────────────────────────────────────────────
 * Notification and location permissions both have a row here, because a
 * permission the user can only change by leaving the app is one they will
 * assume is broken. The location row also repeats the on-device promise —
 * the place someone goes to check what an app does with their data is
 * Settings.
 */
export default function SettingsScreen() {
  const { user, signOut, isAuthenticated } = useAuth();
  const config = useConfig();
  const location = useLocation();
  const notifications = useNotifications();
  const toast = useToast();

  const [editingUrl, setEditingUrl] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  function openUrlEditor() {
    setDraftUrl(config.apiBaseUrl ?? '');
    setTestResult(null);
    setEditingUrl(true);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      // Saved first, because `pingBackend` reads the live configuration —
      // testing a value that is not yet in effect would test the old one.
      await config.setApiBaseUrl(draftUrl);
      await pingBackend();
      setTestResult({ ok: true, message: 'Connected. This address is reachable.' });
    } catch (err) {
      setTestResult({ ok: false, message: messageFor(err) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveUrl() {
    await config.setApiBaseUrl(draftUrl);
    setEditingUrl(false);
    toast.success('Backend address updated.');
  }

  async function handleResetUrl() {
    await config.setApiBaseUrl('');
    setDraftUrl(config.defaultApiBaseUrl);
    setTestResult(null);
    toast.info('Reset to the address this build ships with.');
  }

  return (
    <Screen>
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isAuthenticated ? (
          <Card style={styles.account}>
            <Text variant="caption" color={colors.inkFaint}>
              SIGNED IN AS
            </Text>
            <Text variant="h3">{user?.name ?? 'Your account'}</Text>
            <Text variant="small" color={colors.inkSoft}>
              {user?.email}
            </Text>
          </Card>
        ) : (
          <Banner
            tone="info"
            icon="◆"
            title="Not signed in"
            message="Sign in to see your points and manage appointments."
          />
        )}

        {config.demoMode ? (
          <Banner
            tone="warning"
            icon="◆"
            title="Demo mode is on"
            message="The app is running on sample data and is not talking to a Glow+ server."
          />
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Notifications" />
          <Card padding={0}>
            <ListRow
              first
              last
              title="Appointment updates"
              subtitle={
                // Three different reasons the toggle may be off, and they need
                // three different sentences. "Blocked in settings" shown to
                // someone in Expo Go would send them hunting through iOS
                // Settings for a permission that was never the problem.
                !notifications.supported
                  ? notifications.inExpoGo
                    ? 'Not available in Expo Go. Push notifications need a development build; everything else works normally.'
                    : 'Not available on this device.'
                  : notifications.status === 'denied'
                    ? 'Blocked in your device settings.'
                    : 'Get notified when a salon confirms or changes your booking.'
              }
              right={
                <Switch
                  value={
                    notifications.supported &&
                    notifications.enabled &&
                    notifications.status !== 'denied'
                  }
                  onValueChange={notifications.setNotificationsEnabled}
                  disabled={!notifications.supported || notifications.status === 'denied'}
                  trackColor={{ true: colors.brand, false: colors.lineStrong }}
                  accessibilityLabel="Appointment update notifications"
                />
              }
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Location" />
          <Card padding={0}>
            <ListRow
              first
              title="Sort salons by distance"
              subtitle={
                location.granted
                  ? 'On — nearby salons can be sorted by distance.'
                  : location.denied
                    ? 'Off. Turn it on in your device settings to sort by distance.'
                    : 'Off. The directory works fully without it.'
              }
              value={location.granted ? 'On' : 'Off'}
              onPress={location.granted ? undefined : location.denied ? location.openSettings : location.requestPermission}
            />
            <ListRow
              last
              title="How your location is used"
              subtitle="Distances are worked out on this device. Your location is never sent to Glow+ and never shared with a salon."
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Connection" subtitle="For evaluation and testing" />
          <Card padding={0}>
            <ListRow
              first
              title="Demo mode"
              subtitle="Run the app on sample data, with no backend connection."
              right={
                <Switch
                  value={config.demoMode}
                  onValueChange={config.setDemoMode}
                  trackColor={{ true: colors.brand, false: colors.lineStrong }}
                  accessibilityLabel="Demo mode"
                />
              }
            />
            <ListRow
              last
              title="Backend address"
              subtitle={config.isOverridden ? 'Using a custom address' : 'Using this build’s default'}
              value={config.apiBaseUrl || 'Not set'}
              onPress={openUrlEditor}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title="About" />
          <Card padding={0}>
            <ListRow first title="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
            <ListRow title="Appointment times shown in" value={SALON_TIMEZONE} />
            <ListRow last title="Account" subtitle="The same Glow+ account works on the website." />
          </Card>
        </View>

        {isAuthenticated ? (
          <Button title="Sign out" variant="secondary" fullWidth onPress={signOut} />
        ) : null}
      </ScrollView>

      <Sheet
        visible={editingUrl}
        onClose={() => setEditingUrl(false)}
        title="Backend address"
        subtitle="Where this app sends its requests. Include the API version, e.g. /v1."
        footer={
          <>
            <Button title="Save" onPress={handleSaveUrl} fullWidth size="lg" />
            <Button
              title="Test connection"
              variant="secondary"
              onPress={handleTest}
              loading={testing}
              fullWidth
            />
            <Button title="Reset to default" variant="ghost" onPress={handleResetUrl} fullWidth />
          </>
        }
      >
        <TextField
          label="URL"
          value={draftUrl}
          onChangeText={setDraftUrl}
          placeholder="https://glow-plus-api-six.vercel.app/v1"
          keyboardType="url"
          autoCapitalize="none"
          hint={`This build ships with ${config.defaultApiBaseUrl || 'no default'}.`}
        />

        {testResult ? (
          <Banner
            tone={testResult.ok ? 'success' : 'danger'}
            icon={testResult.ok ? '✓' : '!'}
            title={testResult.ok ? 'Reachable' : "Couldn't connect"}
            message={testResult.message}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.xl },
  account: { gap: 2 },
  section: { gap: spacing.md },
});
