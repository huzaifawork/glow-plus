import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import MainTabs from './src/screens/MainTabs';
import { getToken } from './src/api/client';
import { colors } from './src/theme';

export default function App() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setAuthenticated(!!token);
      setCheckingAuth(false);
    })();
  }, []);

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {authenticated ? (
        <MainTabs onLogout={() => setAuthenticated(false)} />
      ) : (
        <LoginScreen onAuthenticated={() => setAuthenticated(true)} />
      )}
    </SafeAreaProvider>
  );
}
