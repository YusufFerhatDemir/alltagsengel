'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function PushProvider() {
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (subscribedRef.current) return
    if (!VAPID_PUBLIC_KEY) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const subscribe = async () => {
      try {
        // Check if user is logged in
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Wait for service worker to be ready
        const registration = await navigator.serviceWorker.ready

        // Check existing subscription
        let subscription = await registration.pushManager.getSubscription()

        if (!subscription) {
          // Request permission
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') {
            console.log('Push notification permission denied')
            return
          }

          // Subscribe
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
          })
        }

        // Send subscription to server (toJSON() returns keys in base64url)
        const subJson = subscription.toJSON()
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: {
              endpoint: subJson.endpoint,
              keys: {
                p256dh: subJson.keys?.p256dh || '',
                auth: subJson.keys?.auth || '',
              },
            },
          }),
        })

        if (res.ok) {
          subscribedRef.current = true
          console.log('Push subscription saved successfully')
        }
      } catch (err) {
        console.warn('Push subscription error:', err)
      }
    }

    // Small delay to let SW register first
    const timer = setTimeout(subscribe, 3000)
    return () => clearTimeout(timer)
  }, [])

  return null
}
