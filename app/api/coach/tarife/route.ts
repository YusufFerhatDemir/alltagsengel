// ═══════════════════════════════════════════════════════════════
// GET /api/coach/tarife — öffentliche Preisliste
//
// OHNE ANMELDUNG ERREICHBAR, und das ist beabsichtigt: Eine Preisliste
// ist keine schützenswerte Information, sondern die Angabe, die man vor
// dem Anlegen eines Kontos sehen muss. Wer sich erst registrieren muss,
// um den Preis zu erfahren, wird zu Recht misstrauisch — und § 312j
// Abs. 2 BGB verlangt die Preisangabe ohnehin vor der Bestellung.
//
// WAS HIER NICHT HERAUSGEHT: Stripe-Price-IDs, der Grund einer Sperre
// (istVerkaufBereit().grund nennt Env-Variablen) und alles andere aus
// der Konfiguration. Nach außen geht nur, was auf einem Preisschild
// steht — plus die Angabe, ob bestellt werden kann.
//
// SOLANGE DER VERKAUF GESPERRT IST (Default, siehe lib/coach/pricing.ts:
// PflegeCoach ist dauerhaft kostenlos), gibt es kein Preisschild — also
// darf auch kein Betrag herausgehen. Die Platzhalter-Beträge sind sonst
// über einen direkten Aufruf dieser Route abrufbar, obwohl sie „niemandem
// in Rechnung gestellt werden dürfen" (pricing.ts). Deshalb liefert die
// Route in diesem Zustand ein leeres tarife-Array ohne Beträge.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { alleTarife, istVerkaufBereit, jahresErsparnis, proMonatCent, verkaufMoeglich } from '@/lib/coach/pricing'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
// Kein Caching: Die Freigabe kann per Env-Variable umgelegt werden und
// muss dann sofort greifen — auch in die sperrende Richtung.
export const dynamic = 'force-dynamic'

export const GET = withTracking(async function GET() {
  const bereit = verkaufMoeglich()

  if (!bereit) {
    return NextResponse.json({
      verkauf_moeglich: false,
      waehrung: 'EUR',
      tarife: [],
      jahres_ersparnis: null,
    })
  }

  const ersparnis = jahresErsparnis()

  return NextResponse.json({
    verkauf_moeglich: true,
    waehrung: 'EUR',
    tarife: alleTarife().map(t => ({
      key: t.key,
      bezeichnung: t.bezeichnung,
      beschreibung: t.beschreibung,
      betrag_cent: t.betragCent,
      pro_monat_cent: proMonatCent(t),
      intervall_monate: t.intervallMonate,
      testphase_tage: t.testphaseTage,
      bestellbar: istVerkaufBereit(t).bereit,
    })),
    // null, wenn der Jahrestarif nicht günstiger ist — dann darf auf der
    // Verkaufsseite auch kein Vorteil behauptet werden.
    jahres_ersparnis: ersparnis
      ? { betrag_cent: ersparnis.betragCent, prozent: ersparnis.prozent }
      : null,
  })
})
