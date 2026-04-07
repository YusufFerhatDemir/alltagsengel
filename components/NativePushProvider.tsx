'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * NativePushProvider — Registers FCM push tokens for Capacitor native apps.
 * Detects if running inside Capacitor WebView and uses the Capacitor
 * PushNotifications plugin to get and register FCM tokens.
 */
export default function NativePushProvider() {
  const registeredRef = useRef(false)

  useEffect(() => {
    if (registeredRef.current) return

    // Only run in Capacitor native environment
    const isNative =
      typeof window !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.()

    if (!isNative) return

    const registerNativePush = async () => {
      try {
        // Check if user is logged in
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Dynamically import Capacitor Push plugin
        const { PushNotifications } = await import('@capacitor/push-notifications')

        // Request permission
        const permResult = await PushNotifications.requestPermissions()
        if (permResult.receive !== 'granted') {
          console.log('Native push permission denied')
          return
        }

        // Listen for registration success
        PushNotifications.addListener('registration', async (token) => {
          console.log('FCM Token received:', token.value?.slice(0, 20) + '...')

          // Send token to our API
          const res = await fetch('/api/push/fcm-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: token.value,
              platform: (window as any).Capacitor?.getPlatform?.() || 'android',
            }),
          })

          if (res.ok) {
            registeredRef.current = true
            console.log('FCM token registered successfully')
          }
        })

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (err) => {
          console.error('Native push registration error:', err)
        })

        // Listen for incoming notifications (foreground)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push received in foreground:', notification)
          // Show a local notification or in-app banner
          // The notification is already shown by the OS in background
        })

        // Listen for notification taps
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('Push action performed:', action)
          const url = action.notification?.data?.url
          if (url) {
            window.location.href = url
          }
        })

        // Register with FCM
        await PushNotifications.register()

      } catch (err) {
        console.warn('Native push registration error:', err)
      }
    }

    // Delay to let app initialize
    const timer = setTimeout(registerNativePush, 2000)
    return () => clearTimeout(timer)
  }, [])

  return null
}
