import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// ═══════════════════════════════════════════════════════════
// PUSH-NOTIFICATIONS (expo-notifications) — vorbereitet
// ═══════════════════════════════════════════════════════════
// Registriert das Gerät für Push und speichert den Expo-Push-Token
// am eingeloggten User (user_metadata.expo_push_token), damit das
// Backend später gezielt Nachrichten senden kann.
// ═══════════════════════════════════════════════════════════

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null // Simulator hat keine Push-Tokens

  const { status: existing } = await Notifications.getPermissionsAsync()
  let status = existing
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }
  if (status !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Alltagsengel',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#C9963C',
    })
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) return null // EAS-Projekt noch nicht verknüpft (eas init)

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })

    // Token am User hinterlegen, falls eingeloggt
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.auth.updateUser({ data: { expo_push_token: token } })
    }
    return token
  } catch {
    return null
  }
}
