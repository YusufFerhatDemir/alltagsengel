import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Colors } from '@/constants/theme'

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="choose" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(kunde)" />
        <Stack.Screen name="(engel)" />
      </Stack>
    </>
  )
}
