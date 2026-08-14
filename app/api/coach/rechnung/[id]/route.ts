// ═══════════════════════════════════════════════════════════════
// GET /api/coach/rechnung/[id] — Rechnung als druckbares Dokument
//
// Liefert HTML, kein PDF: Der Browser erzeugt daraus über „Drucken →
// Als PDF sichern" genau das, was gebraucht wird. Eine PDF-Bibliothek
// in einer Serverless-Funktion wäre für ein einseitiges Dokument
// unverhältnismäßig — dieselbe Entscheidung wie beim Verlaufsbericht.
//
// ZUGRIFFSSCHUTZ ÜBER RLS, NICHT ÜBER DIE ID: Gelesen wird mit dem
// Session-Client. Die Policy coach_rechnungen_select_self lässt nur die
// eigenen Zeilen durch — eine fremde Rechnungs-ID liefert schlicht
// nichts, auch wenn sie erraten wurde. Es gibt hier bewusst keinen
// service_role-Zugriff.
//
// KEIN schreibzugriff-Guard: Die eigene Rechnung muss auch nach einem
// Widerruf der Art.-9-Einwilligung und nach Vertragsende abrufbar
// bleiben. Eine Rechnung ist ein Beleg, kein Produktinhalt.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { escapeHtml } from '@/lib/rate-limit'
import type { CoachRechnung } from '@/lib/coach/types'
import { bereiteRechnungAuf, rechnungHtml, type RechnungsDaten } from '@/lib/coach/rechnung'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Ungültige Rechnungs-Kennung.' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('coach_rechnungen')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Die Rechnung konnte nicht geladen werden.' }, { status: 500 })
  }
  if (!data) {
    // 404 und nicht 403: Ob die ID nicht existiert oder zu jemand anderem
    // gehört, darf von außen nicht unterscheidbar sein.
    return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
  }

  const r = data as CoachRechnung

  const daten: RechnungsDaten = {
    nummer: r.nummer,
    datum: r.rechnungsdatum,
    leistung_von: r.leistung_von,
    leistung_bis: r.leistung_bis,
    // Der Tarif steht nicht auf der Rechnungszeile — die Bezeichnung
    // wird aus der Laufzeit abgeleitet und dient nur der Beschriftung.
    tarif: 'monatlich',
    tarif_bezeichnung: '',
    brutto_cent: r.brutto_cent,
    empfaenger: {
      name: r.empfaenger_name,
      // Anschrift wurde bei Ausstellung eingefroren und wird hier
      // unverändert wiedergegeben (GoBD: Unveränderbarkeit).
      anschrift: r.empfaenger_anschrift.split('\n'),
      email: '',
    },
  }

  const aufbereitet = bereiteRechnungAuf(daten)

  // Position aus der gespeicherten Rechnung überschreiben, nicht neu
  // rechnen: Steuersatz und Beträge müssen die zum Ausstellungszeitpunkt
  // gültigen bleiben, auch wenn sich die Konfiguration seither geändert
  // hat. Eine nachträglich „korrigierte" Rechnung wäre eine Fälschung.
  aufbereitet.position.bezeichnung = 'Digitaler PflegeCoach — Zugang'
  aufbereitet.position.nettoCent = r.netto_cent
  aufbereitet.position.steuerCent = r.steuer_cent
  aufbereitet.position.bruttoCent = r.brutto_cent
  aufbereitet.steuersatzProzent = Number(r.steuersatz)
  aufbereitet.steuerHinweis =
    Number(r.steuersatz) === 0 ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.' : null

  const geld = (cent: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: r.waehrung }).format(cent / 100)
  aufbereitet.summeNettoAnzeige = geld(r.netto_cent)
  aufbereitet.summeSteuerAnzeige = geld(r.steuer_cent)
  aufbereitet.summeBruttoAnzeige = geld(r.brutto_cent)

  if (r.storniert_am) {
    aufbereitet.zahlungshinweis =
      'Diese Rechnung wurde storniert.' + (r.storno_grund ? ` Grund: ${r.storno_grund}` : '')
  }

  return new NextResponse(rechnungHtml(aufbereitet, escapeHtml), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Kein Zwischenspeichern: Belege gehören nicht in einen Proxy-Cache.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="Rechnung-${r.nummer}.html"`,
    },
  })
}
