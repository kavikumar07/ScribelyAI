import React, { useState, useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ExpoSplashScreen from 'expo-splash-screen';

import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import RecorderScreen from './src/screens/RecorderScreen';
import NotesScreen from './src/screens/NotesScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import CustomizeScreen from './src/screens/CustomizeScreen';

import { Alert, View, Text, Image, StatusBar } from 'react-native';
import { supabase } from './src/config/supabase';

ExpoSplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

const NavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#000000',
  },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; id: string } | null>(null);
  const [isAppLoading, setIsAppLoading] = useState(true);

  // Fonts are pre-bundled into the APK by the expo-font plugin in app.json
  // No runtime useFonts() needed — avoids ExpoAsset.downloadAsync crash

  // Hide splash screen once auth check is done
  useEffect(() => {
    if (!isAppLoading) {
      ExpoSplashScreen.hideAsync().catch(console.warn);
    }
  }, [isAppLoading]);

  useEffect(() => {
    const failsafe = setTimeout(() => {
      setIsAppLoading(false);
    }, 5000);

    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser({
            email: session.user.email || '',
            name: session.user.user_metadata?.name || 'User',
            id: session.user.id,
          });
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.error('Auth check error:', e);
      } finally {
        setIsAppLoading(false);
        clearTimeout(failsafe);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email || '',
          name: session.user.user_metadata?.name || 'User',
          id: session.user.id,
        });
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });

    return () => {
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, []);

  if (isAppLoading) {
    return null;
  }

  const handleLogin = async (email: string, pass: string) => {
    if (!email || !pass) { Alert.alert('Error', 'Please fill in all fields'); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) Alert.alert('Login Failed', error.message);
  };

  const handleSignup = async (email: string, pass: string, name: string) => {
    if (!email || !pass || !name) { Alert.alert('Error', 'Please fill in all fields'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { Alert.alert('Invalid Email', 'Please enter a valid email address'); return; }
    if (pass.length < 8) { Alert.alert('Weak Password', 'Password must be at least 8 characters long'); return; }
    const { error } = await supabase.auth.signUp({
      email, password: pass,
      options: { data: { full_name: name, name, display_name: name } },
    });
    if (error) Alert.alert('Signup Failed', error.message);
    else Alert.alert('Success', 'Account created successfully! You can now log in.');
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={NavigationTheme}>
        <Stack.Navigator
          id="RootNavigator"
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
        >
          {!isAuthenticated ? (
            <>
              <Stack.Screen name="Login">
                {(props) => <LoginScreen {...props} onLogin={handleLogin} />}
              </Stack.Screen>
              <Stack.Screen name="Signup">
                {(props) => <SignupScreen {...props} onSignup={handleSignup} />}
              </Stack.Screen>
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Home">
                {(props) => <HomeScreen {...props} user={user} onLogout={handleLogout} />}
              </Stack.Screen>
              <Stack.Screen name="Record">
                {(props) => <RecorderScreen {...props} user={user} />}
              </Stack.Screen>
              <Stack.Screen name="Notes" component={NotesScreen} />
              <Stack.Screen name="History" component={HistoryScreen} />
              <Stack.Screen name="Customize" component={CustomizeScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
