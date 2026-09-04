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
 * ── Hard auth gate ──────────────────────────────────────────────────────────
 * `isAuthenticated ? <AppStack/> : <AuthStack/>`. Nothing behind the gate —
 * not Discover, not Settings — mounts until there is a signed-in user. This is
 * a deliberate product decision to require an account before any part of the
 * app is usable, and it intentionally supersedes the guest-browsing shape
 * R3.1 originally described.
 *
 * Because the swap is driven by `isAuthenticated` rather than an explicit
 * navigation call, signing out is enough on its own to land the user back on
 * Sign in: `AuthContext` flips its state, this component re-renders, and the
 * whole authenticated tree (tabs, any pushed Salon screen) is torn down in
 * favour of `AuthStack` on the very next frame.
 *
 * ── `createNativeStackNavigator` and not the JS stack ──────────────────────
 * The native stack uses the platform's own navigation container, so the push
 * animation and the interactive swipe-back gesture run on the UI thread. The
 * JS stack animates on the JS thread, which stutters exactly when a pushed
 * screen is doing its first fetch — the moment the user is most likely to
 * notice.
 */
export default function RootNavigator() {
  const { isBootstrapping, isAuthenticated } = useAuth();

  // R1.5/R1.6 — the session is being restored and validated. Rendering
  // either tree first would flash the wrong one at a returning user before
  // swapping to the right one.
  if (isBootstrapping) return <SplashScreen />;

  if (!isAuthenticated) return <AuthStack />;

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
    </Stack.Navigator>
  );
}

const AuthStackNavigator = createNativeStackNavigator();

/**
 * `SignIn` is the entry; the other two push on top of it so Back means "back
 * to sign in" rather than "back to the app" — there is no app behind it for a
 * signed-out user to go back to.
 */
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
    </AuthStackNavigator.Navigator>
  );
}
