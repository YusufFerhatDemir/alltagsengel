import {
  CormorantGaramond_400Regular,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond'
import {
  Jost_400Regular,
  Jost_500Medium,
  Jost_600SemiBold,
  Jost_700Bold,
  useFonts,
} from '@expo-google-fonts/jost'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { Colors } from '../constants/theme'
import { AuthProvider } from '../lib/auth-context'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Jost_400Regular,
    Jost_500Medium,
    Jost_600SemiBold,
    Jost_700Bold,
    CormorantGaramond_400Regular,
    CormorantGaramond_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth/register" options={{ presentation: 'modal' }} />
        <Stack.Screen name="einsatz/check-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="einsatz/leistungsnachweis-scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="einsatz/unterschrift" options={{ presentation: 'modal' }} />
        <Stack.Screen name="einsatz/leistung-erfassen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="einsatz/zeiterfassung" options={{ presentation: 'modal' }} />
        <Stack.Screen name="einsatz/notizen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="einsatz/klient" options={{ presentation: 'modal' }} />
      </Stack>
    </AuthProvider>
  )
}
