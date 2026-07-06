import { useCallback, useEffect, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Colors, Fonts } from '../constants/theme'
import { getFailedCount, getPendingCount, syncPendingActions } from '../lib/offline-queue'

// ═══════════════════════════════════════════════════════════
// SyncStatusBadge — kleine Pille für den Warteschlangen-Status
// der drei Einsatz-Flows (Foto/Unterschrift/Geo). Kein generisches
// Sync-Framework: liest nur den lokalen AsyncStorage-Queue-Stand.
// ═══════════════════════════════════════════════════════════

type Status = 'synced' | 'pending' | 'error'

export default function SyncStatusBadge() {
  const [status, setStatus] = useState<Status>('synced')
  const [pendingCount, setPendingCount] = useState(0)

  const refresh = useCallback(async () => {
    const [pending, failed] = await Promise.all([getPendingCount(), getFailedCount()])
    setPendingCount(pending)
    setStatus(failed > 0 ? 'error' : pending > 0 ? 'pending' : 'synced')
  }, [])

  const trySync = useCallback(async () => {
    await syncPendingActions()
    await refresh()
  }, [refresh])

  // Beim Fokussieren des Screens: Sync-Versuch + Status aktualisieren
  useFocusEffect(
    useCallback(() => {
      trySync()
    }, [trySync])
  )

  // Beim Zurückkehren aus dem Hintergrund: erneuter Sync-Versuch
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') trySync()
    })
    return () => sub.remove()
  }, [trySync])

  const label =
    status === 'synced'
      ? '✓ Synchronisiert'
      : status === 'pending'
        ? `⏳ ${pendingCount} ausstehend`
        : '⚠ Fehler'

  const color = status === 'synced' ? Colors.green : status === 'pending' ? Colors.gold : Colors.red
  const backgroundColor =
    status === 'synced' ? Colors.greenPale : status === 'pending' ? Colors.goldLight : Colors.redPale

  return (
    <View style={[styles.pill, { backgroundColor, borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
})
