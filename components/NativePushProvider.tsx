'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * NativePushProvider — Professional Push Setup für Capacitor (iOS + Android)
 *
 * ═══════════════════════════════════════════════════════════════
 * SO MACHEN ES UBER / WHATSAPP / INSTAGRAM:
 * ═══════════════════════════════════════════════════════════════
 * 1. KEINE Push-Permission beim App-Start (würde User verschrecken)
 * 2. Push-Permission erst NACH Login (User ist committed)
 * 3. Permission-Request optional verzögert (z.B. nach 1. Buchung)
 * 4. Komplett "fail-soft" — wenn Push nicht klappt, App läuft normal weiter
 * 5. KEINE blockierenden Calls — alles async, alles in try/catch
 * ═══════════════════════════════════════════════════════════════
 */
export default function NativePushProvider() {
  const registeredRef = useRef(false)

  useEffect(() => {
    if (registeredRef.current) return

    // Nur in nativer Capacitor-Umgebung
    const isNative =
      typeof window !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.()

    if (!isNative) return

    // ═══ iOS Sicherheits-Check: APNS-Capability vorhanden? ═══
    // Wenn keine aps-environment Entitlement im App-Bundle ist,
    // würde register() crashen. Wir prüfen das vorher.
    const platform = (window as any).Capacitor?.getPlatform?.() || ''

    const registerNativePush = async () => {
      try {
        // Schritt 1: User muss eingeloggt sein
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.debug('[NativePush] User nicht eingeloggt — Push übersprungen')
          return
        }

        // Schritt 2: Capacitor Push Plugin dynamisch laden (lazy, fail-soft)
        let PushNotifications: any
        try {
          const mod = await import('@capacitor/push-notifications')
          PushNotifications = mod.PushNotifications
        } catch (importErr) {
          console.warn('[NativePush] Plugin nicht verfügbar:', importErr)
          return
        }

        // Schritt 3: Permission abfragen (zeigt iOS/Android Dialog)
        let permResult: any
        try {
          permResult = await PushNotifications.requestPermissions()
        } catch (permErr) {
          console.warn('[NativePush] Permission-Request fehlgeschlagen:', permErr)
          return
        }

        if (permResult?.receive !== 'granted') {
          console.debug('[NativePush] Permission abgelehnt')
          return
        }

        // Schritt 4: Listener registrieren BEVOR register() called wird
        await PushNotifications.addListener('registration', async (token: any) => {
          try {
            const tokenValue = token?.value
            if (!tokenValue) return
            console.debug('[NativePush] Token erhalten:', tokenValue.slice(0, 12) + '…')

            const res = await fetch('/api/push/fcm-register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: tokenValue,
                platform: platform || 'unknown',
              }),
              signal: AbortSignal.timeout(5000),
            })

            if (res.ok) {
              registeredRef.current = true
              console.debug('[NativePush] Token registriert ✓')
            }
          } catch (regErr) {
            console.warn('[NativePush] Token-Registrierung fehlgeschlagen:', regErr)
          }
        })

        await PushNotifications.addListener('registrationError', (err: any) => {
          // Häufigster Fehler auf iOS: "no valid 'aps-environment' entitlement"
          // → bedeutet: Push Capability fehlt im Xcode-Projekt
          console.warn('[NativePush] Registrierung fehlgeschlagen (vermutlich fehlt APNS-Setup):', err)
        })

        await PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
          console.debug('[NativePush] Push empfangen:', notification?.title || '(kein Titel)')
        })

        await PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
          const url = action?.notification?.data?.url
          if (url && typeof url === 'string') {
            window.location.href = url
          }
        })

        // Schritt 5: APNS/FCM Registrierung starten
        // Auf iOS ohne APNS-Entitlement → registrationError Listener feuert
        // Auf Android ohne FCM-Setup → registrationError Listener feuert
        // → App läuft in beiden Fällen normal weiter (fail-soft!)
        try {
          await PushNotifications.register()
        } catch (regErr) {
          console.warn('[NativePush] register() fehlgeschlagen:', regErr)
        }

      } catch (err) {
        // Letzter Sicherheitsnetz: nichts darf die App crashen lassen
        console.warn('[NativePush] Unerwarteter Fehler:', err)
      }
    }

    // Verzögerung: erst nachdem App vollständig geladen + interaktiv ist
    // (wie bei Insta/TikTok — Push-Dialog kommt nicht sofort)
    const timer = setTimeout(registerNativePush, 3000)
    return () => clearTimeout(timer)
  }, [])

  return null
}
