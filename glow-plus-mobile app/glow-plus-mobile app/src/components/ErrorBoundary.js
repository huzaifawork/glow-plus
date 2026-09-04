import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Text from './ui/Text';
import Button from './ui/Button';
import Brandmark from './ui/Brandmark';
import { colors, spacing } from '../theme';

/**
 * The last line of defence.
 *
 * NF4 says the app must fail *"with a clear message to the user rather than a
 * silent failure or crash"*. Network failures are handled where they happen —
 * this is for the other kind: a render that throws. Without a boundary, React
 * Native unmounts the whole tree and the user is left looking at a blank white
 * screen with no way forward, which is the worst possible version of NF4.
 *
 * **It must be a class component.** There is no hook equivalent of
 * `componentDidCatch`; `ErrorBoundary` is the one place a class is still
 * required by React.
 *
 * "Try again" resets the boundary rather than reloading the app: the crash is
 * usually one screen's state, and remounting the tree is enough. The session
 * is in the keychain and survives either way (R1.5).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Logged rather than sent anywhere: this app has no crash-reporting
    // service configured, and quietly shipping stack traces to a third party
    // is not something to add without it being asked for. In development this
    // is what appears in the Metro console.
    // eslint-disable-next-line no-console
    console.error('Unhandled error in the Glow+ app', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Brandmark size={56} />

          <Text variant="h1" align="center">
            Something went wrong
          </Text>
          <Text variant="body" color={colors.inkSoft} align="center">
            The app hit an unexpected problem. Your account and your bookings are safe — nothing was
            lost.
          </Text>

          <Button
            title="Try again"
            onPress={() => this.setState({ error: null })}
            size="lg"
            style={styles.action}
          />

          {/* The message, small and last. A user cannot act on it, but it is
              the only thing that makes a bug report useful. */}
          <Text variant="caption" color={colors.inkFaint} align="center" style={styles.detail}>
            {String(this.state.error?.message ?? this.state.error)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  action: { marginTop: spacing.lg },
  detail: { marginTop: spacing.xl },
});
