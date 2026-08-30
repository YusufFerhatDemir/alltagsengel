'use client'
// ═══════════════════════════════════════════════════════════════════════
// App-Start an die Sicherheitsspur melden
// ═══════════════════════════════════════════════════════════════════════
//
// Meldet EINMAL je App-Start an /api/security/app-start. Nur in der
// nativen Huelle (Capacitor) — im Browser ist „App-Start" kein Ereignis,
// dort gibt es Sitzungsbeginn und Seitenaufruf.
//
// WAS DIESE KOMPONENTE NICHT TUT
// Sie schickt KEINE Konto-Kennung, keine Geraetemerkmale, keine
// Kennzeichen. Der Rumpf ist leer. Wer die App gestartet hat, entscheidet
// serverseitig die geprueste Sitzung — deshalb ist der Aufruf hier
// unbedenklich, obwohl er aus dem Client kommt.
//
// Ohne Anmeldung antwortet die Route mit 202 und schreibt nichts. Der
// Aufruf ist damit fuer nicht angemeldete Nutzer folgenlos.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect } from 'react'

/** Innerhalb desselben Seitenlebens nur ein Mal. */
let gemeldet = false

function laeuftInCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  return !!w.Capacitor?.isNativePlatform?.()
}

export default function AppStartMelder() {
  useEffect(() => {
    if (gemeldet || !laeuftInCapacitor()) return
    gemeldet = true

    // keepalive: der Aufruf soll auch dann durchgehen, wenn die App
    // unmittelbar danach in den Hintergrund wechselt.
    fetch('/api/security/app-start', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {
      // Fail-soft: eine fehlende Meldung darf den App-Start nicht
      // stoeren. Die Anmeldung selbst wird ohnehin serverseitig
      // protokolliert.
    })
  }, [])

  return null
}
