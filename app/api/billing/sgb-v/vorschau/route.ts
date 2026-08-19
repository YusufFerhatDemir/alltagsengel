import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { datumBerlin, monatBerlin } from '@/lib/utils/timezone'
import {
  bereiteHkpVor, HKP_VERORDNUNG_TYPE,
  type HkpLeistung, type HkpVerordnung, type HkpKlient,
} from '@/lib/abrechnung/sgb-v/positionen'
import { ladeRouting, findeRouting } from '@/lib/abrechnung/sgb-v/routing'
import { aktuelleVersion, monatsStichtag } from '@/lib/abrechnung/sgb-v/versionen'
import { exportImplementiert } from '@/lib/abrechnung/sgb-v/generator'
import { pruefeAufbereitungTarife } from '@/lib/abrechnung/sgb-v/validierung'

/**
 * GET /api/billing/sgb-v/vorschau?monat=2026-08
 *
 * Trockenlauf für § 302 SGB V: zeigt, welche HKP-Leistungen abrechenbar wären,
 * welche warum NICHT, und welche Blocker dem Export im Weg stehen.
 *
 * Schreibt nichts. Erzeugt keine Datei — der Generator ist gesperrt, solange
 * die Technische Anlage fehlt (s. lib/abrechnung/sgb-v/generator.ts).
 */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const url = new URL(request.url)
    const monat = url.searchParams.get('monat') || monatBerlin()
    if (!/^\d{4}-\d{2}$/.test(monat)) {
      return NextResponse.json({ error: 'Parameter monat muss JJJJ-MM sein.' }, { status: 400 })
    }

    const von = `${monat}-01`
    // Letzter Tag des Monats ohne Kalender-Arithmetik-Fallen: Tag 0 des
    // Folgemonats ist der letzte Tag des gewählten Monats.
    const [jahr, mon] = monat.split('-').map(Number)
    const bis = datumBerlin(new Date(Date.UTC(jahr, mon, 0)))

    const admin = createAdminClient()

    const [leistungenRes, verordnungenRes, klientenRes] = await Promise.all([
      admin
        .from('service_records')
        .select('id, client_id, verordnung_id, date, duration_minutes, service_type, amount')
        .eq('organization_id', organizationId)
        .in('status', ['complete', 'signed', 'invoiced'])
        .gte('date', von)
        .lte('date', bis)
        .order('date', { ascending: true }),
      admin
        .from('verordnungen')
        .select('id, client_id, verordnung_type, genehmigung_status, gueltig_von, gueltig_bis, genehmigung_bis, verordnung_nummer, genehmigung_aktenzeichen, kostentraeger_ik_nummer, kostentraeger_name')
        .eq('organization_id', organizationId)
        .eq('verordnung_type', HKP_VERORDNUNG_TYPE)
        .is('deleted_at', null),
      admin
        .from('clients')
        .select('id, first_name, last_name, versichertennummer, geburtsdatum, date_of_birth')
        .eq('organization_id', organizationId),
    ])

    for (const [name, res] of [
      ['Leistungen', leistungenRes],
      ['Verordnungen', verordnungenRes],
      ['Klienten', klientenRes],
    ] as const) {
      if (res.error) {
        console.error(`[billing/sgb-v/vorschau] ${name} Ladefehler:`, res.error.message)
        return NextResponse.json({ error: `${name} konnten nicht geladen werden.` }, { status: 500 })
      }
    }

    const verordnungen = (verordnungenRes.data || []) as HkpVerordnung[]
    const klienten = (klientenRes.data || []) as HkpKlient[]

    // Nur Leistungen betrachten, die überhaupt einer HKP-Verordnung zugeordnet
    // sind — sonst landet der gesamte § 105-Betrieb in der Ablehnungsliste und
    // die echten HKP-Probleme gehen darin unter.
    const hkpVerordnungIds = new Set(verordnungen.map(v => v.id))
    const leistungen = ((leistungenRes.data || []) as HkpLeistung[])
      .filter(l => l.verordnung_id && hkpVerordnungIds.has(l.verordnung_id))

    const aufbereitung = bereiteHkpVor(leistungen, verordnungen, klienten)

    // Zweite Stufe: § 37-Tarifprüfung. Der echte Lauf (lib/abrechnung/sgb-v/
    // versand.ts) bricht daran ab — die Vorschau muss dasselbe zeigen, sonst
    // meldet der Trockenlauf abrechenbare Fälle, die der Lauf ablehnt.
    const tarifPruefung = await pruefeAufbereitungTarife(admin, organizationId, aufbereitung)

    // Routing je beteiligter Kasse prüfen
    const routingEintraege = await ladeRouting(admin, organizationId)
    const stichtag = monatsStichtag(monat)
    const routingStatus = tarifPruefung.faelle
      .map(f => f.kostentraeger_ik)
      .filter((ik, i, arr) => arr.indexOf(ik) === i)
      .map(ik => {
        const ergebnis = findeRouting(routingEintraege, ik, stichtag)
        return {
          kostentraeger_ik: ik,
          ok: ergebnis.ok,
          problem: ergebnis.problem,
          hinweis: ergebnis.hinweis,
          datenannahmestelle: ergebnis.routing?.datenannahmestelle_name ?? null,
        }
      })

    const version = await aktuelleVersion(admin, organizationId, monat, 'edifact_slga_slla')

    return NextResponse.json({
      abrechnungsmonat: monat,
      zeitraum: { von, bis },
      faelle: tarifPruefung.faelle,
      abgelehnt: aufbereitung.abgelehnt,
      ohne_tarif: tarifPruefung.ohneTarif,
      summe_cent: tarifPruefung.faelle.reduce((s, f) => s + f.betrag_cent, 0),
      anzahl_faelle: tarifPruefung.faelle.length,
      anzahl_positionen: tarifPruefung.faelle.reduce((s, f) => s + f.positionen.length, 0),
      // Vor der Tarifprüfung — zeigt, wie viel an ihr hängen bleibt.
      anzahl_faelle_vor_tarifpruefung: aufbereitung.faelle.length,
      summe_cent_vor_tarifpruefung: aufbereitung.summe_cent,
      routing: routingStatus,
      version: {
        ok: version.ok,
        bezeichnung: version.version?.bezeichnung ?? null,
        ta_version: version.version?.ta_version ?? null,
        sperrgrund: version.sperrgrund,
        hinweis: version.hinweis,
      },
      // Der Export bleibt gesperrt, bis die Technische Anlage vorliegt.
      export_moeglich: version.ok && exportImplementiert('edifact_slga_slla') && tarifPruefung.ok,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/vorschau] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
