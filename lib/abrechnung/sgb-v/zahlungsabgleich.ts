/**
 * § 302 SGB V — Zahlungsabgleich / OPOS
 *
 * § 302-Läufe erzeugen KEINE `invoices`-Zeile (die Kasse zahlt auf die
 * eingereichten Fälle, nicht auf eine Rechnung des Leistungserbringers) —
 * die generische, rechnungszentrierte Zahlungseingangs-Zuordnung
 * (lib/billing/... über `zahlungseingaenge.payment_id`) passt hier nicht.
 *
 * Stattdessen nutzt dieses Modul die Brücke `zahlungseingaenge.sgb_v_lauf_id`
 * (Migration 20260921010000): dieselbe CAMT-Importtabelle, aber Zuordnung
 * direkt zum § 302-Lauf statt zu einer Rechnung. Automatische Zuordnung ist
 * bewusst eng (exakter Betrag + IK im Verwendungszweck) — alles andere bleibt
 * im Klärfall, nie eine geratene Zuordnung.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../../billing/core/audit'

export interface SgbVOffenerPosten {
  laufId: string
  abrechnungsmonat: string
  kostentraegerIk: string | null
  gesamtbetragCent: number
  zugeordnetCent: number
  offenCent: number
  status: string
}

/** Läufe, die der Kasse in Rechnung gestellt wurden (uebermittelt oder später) minus zugeordnete Zahlungen. */
export async function sgbVOffenePostenListe(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<SgbVOffenerPosten[]> {
  const { data: laeufe, error } = await supabase
    .from('sgb_v_laeufe')
    .select('id, abrechnungsmonat, kostentraeger_ik, gesamtbetrag_cent, status')
    .eq('organization_id', organizationId)
    .in('status', ['uebermittelt', 'quittiert', 'angenommen', 'teilweise_abgelehnt'])
    .is('deleted_at', null)

  if (error) throw new Error(`§ 302-Läufe konnten nicht geladen werden: ${error.message}`)
  if (!laeufe || laeufe.length === 0) return []

  const { data: zahlungen, error: zFehler } = await supabase
    .from('zahlungseingaenge')
    .select('sgb_v_lauf_id, betrag_cent')
    .eq('organization_id', organizationId)
    .in('sgb_v_lauf_id', laeufe.map(l => l.id))

  if (zFehler) throw new Error(`Zahlungseingänge konnten nicht geladen werden: ${zFehler.message}`)

  const zugeordnetProLauf = new Map<string, number>()
  for (const z of zahlungen || []) {
    if (!z.sgb_v_lauf_id) continue
    zugeordnetProLauf.set(z.sgb_v_lauf_id, (zugeordnetProLauf.get(z.sgb_v_lauf_id) ?? 0) + Number(z.betrag_cent))
  }

  return laeufe.map(l => {
    const zugeordnetCent = zugeordnetProLauf.get(l.id) ?? 0
    return {
      laufId: l.id,
      abrechnungsmonat: l.abrechnungsmonat,
      kostentraegerIk: l.kostentraeger_ik,
      gesamtbetragCent: l.gesamtbetrag_cent,
      zugeordnetCent,
      offenCent: l.gesamtbetrag_cent - zugeordnetCent,
      status: l.status,
    }
  })
}

/** Manuelle Zuordnung eines Zahlungseingangs zu einem § 302-Lauf. */
export async function ordneZahlungSgbVLaufZu(
  supabase: SupabaseClient,
  organizationId: string,
  zahlungseingangId: string,
  laufId: string,
  actorId: string,
): Promise<void> {
  const { data: lauf } = await supabase
    .from('sgb_v_laeufe')
    .select('id')
    .eq('id', laufId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!lauf) throw new Error('§ 302-Lauf nicht gefunden oder gehört zu einer anderen Organisation.')

  const { data: aktualisiert, error } = await supabase
    .from('zahlungseingaenge')
    .update({ sgb_v_lauf_id: laufId, zuordnungs_status: 'manuell' })
    .eq('id', zahlungseingangId)
    .eq('organization_id', organizationId)
    .select('id, betrag_cent')
    .maybeSingle()

  if (error || !aktualisiert) throw new Error('Zahlungseingang nicht gefunden oder gehört zu einer anderen Organisation.')

  await logBillingAction(supabase, {
    entityType: 'zahlungseingang',
    organizationId,
    entityId: zahlungseingangId,
    action: 'sgb_v_zahlung_zugeordnet',
    newState: { sgb_v_lauf_id: laufId, betrag_cent: aktualisiert.betrag_cent },
    actorId,
  })
}

export interface AutomatischeZuordnungErgebnis {
  geprueft: number
  zugeordnet: number
  klaerfaelleUnveraendert: number
}

/**
 * Automatische Zuordnung: nur bei EXAKTEM Betrag UND IK-Treffer im
 * Verwendungszweck. Jeder andere Fall bleibt Klärfall — eine geratene
 * Zuordnung wäre schlimmer als ein liegen gebliebener Zahlungseingang.
 */
export async function automatischeZahlungszuordnungSgbV(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<AutomatischeZuordnungErgebnis> {
  const { data: offen, error } = await supabase
    .from('zahlungseingaenge')
    .select('id, betrag_cent, verwendungszweck')
    .eq('organization_id', organizationId)
    .is('sgb_v_lauf_id', null)
    .eq('zuordnungs_status', 'klaerfall')

  if (error) throw new Error(`Zahlungseingänge konnten nicht geladen werden: ${error.message}`)
  if (!offen || offen.length === 0) return { geprueft: 0, zugeordnet: 0, klaerfaelleUnveraendert: 0 }

  const { data: kandidaten, error: kFehler } = await supabase
    .from('sgb_v_laeufe')
    .select('id, kostentraeger_ik, gesamtbetrag_cent')
    .eq('organization_id', organizationId)
    .in('status', ['uebermittelt', 'quittiert', 'angenommen'])
    .is('deleted_at', null)

  // Fail-closed: ohne Kandidatenliste bliebe JEDER Zahlungseingang liegen,
  // und das Ergebnis {geprueft: n, zugeordnet: 0} saehe aus wie ein sauber
  // durchgelaufener Abgleich ohne Treffer. Ein Lesefehler ist aber kein
  // "keine Treffer" — er muss den Lauf abbrechen.
  if (kFehler) throw new Error(`§ 302-Läufe konnten nicht geladen werden: ${kFehler.message}`)

  // Nur Laeufe, auf die noch NICHTS gebucht ist, kommen in Frage. Der
  // Abgleich trifft ueber den EXAKTEN Gesamtbetrag; ein Lauf mit bereits
  // zugeordneter Zahlung wuerde durch einen zweiten Treffer doppelt
  // beglichen. (Zwei Kassen koennen denselben Betrag ueberweisen.)
  const laufIds = (kandidaten || []).map(l => l.id)
  const belegteLaeufe = new Set<string>()
  if (laufIds.length > 0) {
    const { data: bereits, error: bFehler } = await supabase
      .from('zahlungseingaenge')
      .select('sgb_v_lauf_id')
      .eq('organization_id', organizationId)
      .in('sgb_v_lauf_id', laufIds)
    if (bFehler) {
      throw new Error(`Bestehende Zuordnungen konnten nicht geladen werden: ${bFehler.message}`)
    }
    for (const z of bereits || []) {
      if (z.sgb_v_lauf_id) belegteLaeufe.add(z.sgb_v_lauf_id)
    }
  }

  let zugeordnet = 0
  for (const zahlung of offen) {
    const zweck = (zahlung.verwendungszweck || '').replace(/\s+/g, '')
    const treffer = (kandidaten || []).filter(l =>
      l.gesamtbetrag_cent === zahlung.betrag_cent
      && l.kostentraeger_ik
      && zweck.includes(l.kostentraeger_ik)
      && !belegteLaeufe.has(l.id),
    )
    // Mehrdeutig heisst Klaerfall. `find()` haette hier den ersten Lauf
    // genommen — also geraten, welche der gleich hohen Forderungen die
    // Kasse gerade bezahlt hat.
    if (treffer.length !== 1) continue
    const lauf = treffer[0]

    const { error: uFehler } = await supabase
      .from('zahlungseingaenge')
      .update({ sgb_v_lauf_id: lauf.id, zuordnungs_status: 'automatisch' })
      .eq('id', zahlung.id)
      .eq('organization_id', organizationId)

    // Ohne diese Pruefung wurde der Zaehler hochgezaehlt und ein
    // Audit-Eintrag ueber eine Zuordnung geschrieben, die in der Datenbank
    // gar nicht stattgefunden hat.
    if (uFehler) {
      throw new Error(`Zahlungseingang konnte nicht zugeordnet werden: ${uFehler.message}`)
    }

    belegteLaeufe.add(lauf.id)

    await logBillingAction(supabase, {
      entityType: 'zahlungseingang',
      organizationId,
      entityId: zahlung.id,
      action: 'sgb_v_zahlung_automatisch_zugeordnet',
      newState: { sgb_v_lauf_id: lauf.id, betrag_cent: zahlung.betrag_cent },
      actorId,
    })
    zugeordnet++
  }

  return { geprueft: offen.length, zugeordnet, klaerfaelleUnveraendert: offen.length - zugeordnet }
}
