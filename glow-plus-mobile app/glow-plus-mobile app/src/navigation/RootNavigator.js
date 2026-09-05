import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import SalonScreen from '../screens/discover/SalonScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import SplashScreen from '../screens/SplashScreen';
import { colors, type } from '../theme';
import { useAuth } from '../context/AuthContext';

const Stack = createNativeStackNavigator();

/**
 * The whole app's routing.
 *
 * ── Why the auth screens are a MODAL over the tabs, not a separate tree ─────
 * The usual shape is `isAuthenticated ? <AppStack/> : <AuthStack/>`, and it is
 * wrong for this app. R3.1 requires the salon directory to be browsable
 * *"without requiring the user to be logged in"*, so a signed-out person needs
 * the real app, not a login wall. Sign-in is therefore something you reach
 * FROM the app — from the Sign in prompt on a salon, or from Settings — and
 * dismissing it returns you to what you were doing.
 *
 * The tabs themselves still change with the session (`TabNavigator` hides
 * Rewards and Bookings for a guest), which is where the "signed out" state is
 * actually expressed.
 *
 * ── `createNativeStackNavigator` and not the JS stack ──────────────────────
 * The native stack uses the platform's own navigation container, so the push
 * animation and the interactive swipe-back gesture run on the UI thread. The
 * JS stack animates on the JS thread, which stutters exactly when a pushed
 * screen is doing its first fetch — the moment the user is most likely to
 * notice.
 */
export default function RootNavigator() {
  const { isBootstrapping } = useAuth();

  // R1.5/R1.6 — the session is being restored and validated. Rendering the
  // tabs first would flash a signed-out shell at a returning user before
  // swapping it for a signed-in one.
  if (isBootstrapping) return <SplashScreen />;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerTintColor: colors.ink,
        headerTitleStyle: type.h3,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} />

      <Stack.Screen
        name="Salon"
        component={SalonScreen}
        options={({ route }) => ({
          headerShown: true,
          // The salon's name in the bar, so a pushed screen says where you
          // are — the directory card that opened it is no longer visible.
          title: route.params?.salon?.businessName ?? 'Salon',
          headerBackButtonDisplayMode: 'minimal',
        })}
      />

      {/* Auth, presented modally. `SignIn` is the entry; the other two push on
          top of it so Back means "back to sign in" rather than "back to the
          app", which is what a user in the middle of a password reset expects. */}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Auth" component={AuthStack} />
      </Stack.Group>
    </Stack.Navigator>
  );
}

const AuthStackNavigator = createNativeStackNavigator();

function AuthStack() {
  return (
    <AuthStackNavigator.Navigator
      screenOptions={{
        headerShown: false,
        headerTintColor: colors.ink,
        headerTitleStyle: type.h3,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AuthStackNavigator.Screen name="SignIn" component={SignInScreen} />
      <AuthStackNavigator.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ headerShown: true, title: '', headerBackButtonDisplayMode: 'minimal' }}
      />
      <AuthStackNavigator.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ headerShown: true, title: '', headerBackButtonDisplayMode: 'minimal' }}
      />
      {/* R3.1's escape hatch from the sign-in screen. It is a route rather than
          a `goBack()` so it works whether Auth was opened from the app or was
          the first thing shown. */}
      <AuthStackNavigator.Screen name="BrowseAsGuest" component={DismissAuth} />
    </AuthStackNavigator.Navigator>
  );
}

/**
 * "Browse without an account" — closes the auth modal and returns to the app.
 *
 * A screen rather than an inline handler because React Navigation resolves a
 * `navigate` to a route name, and this keeps the sign-in screen unaware of
 * whether it was opened modally or landed on directly.
 */
function DismissAuth({ navigation }) {
  React.useEffect(() => {
    navigation.getParent()?.goBack();
  }, [navigation]);
  return <SplashScreen quiet />;
}
