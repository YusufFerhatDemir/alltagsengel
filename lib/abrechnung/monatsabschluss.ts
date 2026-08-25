// ═══════════════════════════════════════════════════════════════
// Automatische Monatsabrechnung (Monatsabschluss) — VORSCHAU
// ═══════════════════════════════════════════════════════════════
// WICHTIG: Dieses Modul ist eine VORSCHAU/VORBEREITUNG, KEINE
// verbindliche Abrechnung. Die verbindliche Preisquelle fuer
// echte Rechnungen ist ausschliesslich billing_tariffs
// (via create_invoice_draft_atomic RPC).
//
// Preisquelle hier: leistungspreise-Tabelle (Fallback: record.amount).
// Diese Betraege sind SCHAETZWERTE fuer die Monatsvorschau und
// duerfen NICHT als Rechnungsbetraege verwendet werden.
//
// Ablauf:
//   1. Alle Verordnungen/Bewilligungen mit Status „genehmigt"
//   2. Je Verordnung: service_records des Monats einsammeln
//   3. Prüfung: Leistungsnachweis unterschrieben?
//   4. Prüfung: Abtretungserklärung vorhanden?
//   5. Gruppierung nach Kostenträger (Kasse/Sozialamt/…)
//   6. Beträge aus leistungspreise-Tabelle (VORSCHAU-Preise)
//   7. Abrechnungslauf-Einträge → monthly_closings (upsert je Klient)
//   8. Optional: EDIFACT-Erzeugung über injizierten Generator
// Rückgabe: Zusammenfassung + Warnungen — nichts wird versendet.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import { centRunden } from '@/lib/geld'

// ── Ergebnis-Typen ─────────────────────────────────────────────
export interface AbschlussWarnung {
  schwere: 'fehler' | 'warnung' | 'hinweis'
  verordnung_id?: string
  client?: string
  text: string
}

export interface AbrechnungsPosition {
  verordnung_id: string
  client_id: string
  client: string
  genehmigungsnummer: string | null
  leistungsart: string | null
  einsaetze: number
  minuten: number
  betrag_cent: number
  unterschrieben: boolean
  abtretung_vorhanden: boolean
  abrechenbar: boolean
}

export interface KostentraegerGruppe {
  kostentraeger_name: string
  kostentraeger_typ: string
  ik_nummer: string | null
  positionen: AbrechnungsPosition[]
  summe_cent: number
  /** EDIFACT-Nachricht(en) für diesen Kostenträger, falls Generator übergeben */
  edifact?: string
}

export interface MonatsabschlussErgebnis {
  monat: string
  zeitraum: { von: string; bis: string }
  verordnungen_geprueft: number
  positionen_abrechenbar: number
  positionen_blockiert: number
  gesamt_cent: number
  gruppen: KostentraegerGruppe[]
  warnungen: AbschlussWarnung[]
  closings_geschrieben: number
}

/** Signatur des (optionalen) EDIFACT-Generators aus lib/abrechnung/edifact. */
export type EdifactGenerator = (gruppe: KostentraegerGruppe, monat: string) => string

// ── Preisermittlung ────────────────────────────────────────────
interface Leistungspreis {
  leistungsart: string
  preis_cent: number
  gueltig_ab: string
  gueltig_bis: string | null
  tarif_status: string | null
  verifizierungs_quelle: string | null
}

/** Warum für eine Leistungsart kein Preis ermittelt werden konnte. */
type Preisluecke =
  | { grund: 'kein_eintrag' }
  | { grund: 'nicht_verifiziert'; status: string; quelle: string | null }

interface PreisErgebnis {
  preisCent: number | null
  luecke: Preisluecke | null
}

/**
 * Sucht den am Stichtag gültigen Preis einer Leistungsart.
 *
 * Fail-Closed in zwei Stufen:
 *  1. Gültigkeitszeitraum — es wird NICHT auf einen Preis aus einem anderen
 *     Zeitraum ausgewichen. Kein gültiger Eintrag am Leistungsdatum = kein Preis.
 *  2. Verifizierung — nur tarif_status='verified' zählt. 'unverified' und
 *     'blocked' liefern keinen Preis, sondern eine benannte Lücke, damit im
 *     Abschluss sichtbar wird, WARUM nichts abgerechnet werden kann.
 */
function findePreis(
  preise: Leistungspreis[],
  leistungsart: string | null,
  stichtag: string
): PreisErgebnis {
  if (!leistungsart) return { preisCent: null, luecke: { grund: 'kein_eintrag' } }

  const imZeitraum = preise
    .filter(
      p =>
        p.leistungsart === leistungsart &&
        p.gueltig_ab <= stichtag &&
        (!p.gueltig_bis || p.gueltig_bis >= stichtag)
    )
    .sort((a, b) => (a.gueltig_ab < b.gueltig_ab ? 1 : -1))

  if (imZeitraum.length === 0) {
    return { preisCent: null, luecke: { grund: 'kein_eintrag' } }
  }

  const verifiziert = imZeitraum.find(p => p.tarif_status === 'verified')
  if (!verifiziert) {
    const bester = imZeitraum[0]
    return {
      preisCent: null,
      luecke: {
        grund: 'nicht_verifiziert',
        status: bester.tarif_status ?? 'unbekannt',
        quelle: bester.verifizierungs_quelle,
      },
    }
  }

  return { preisCent: verifiziert.preis_cent, luecke: null }
}

// ═══════════════════════════════════════════════════════════════
// Hauptfunktion
// ═══════════════════════════════════════════════════════════════
export async function erstelleMonatsabschluss(
  monat: string, // 'YYYY-MM'
  supabase: SupabaseClient,
  options: {
    /**
     * Bundesland-Katalogcode für die leistungspreise-Suche.
     * PFLICHT — seit der Deutschland-Architektur gibt es keinen Hessen-Default
     * mehr: ein stiller Fallback würde in anderen Bundesländern die falschen
     * Preise ziehen.
     */
    bundesland: string
    organizationId: string
    /** EDIFACT-Generator (PLGA/PLAA) — injiziert, sobald lib/abrechnung/edifact existiert. */
    edifactGenerator?: EdifactGenerator
    /** true = monthly_closings NICHT schreiben (reiner Prüf-/Vorschaulauf). */
    dryRun?: boolean
  }
): Promise<MonatsabschlussErgebnis> {
  if (!/^\d{4}-\d{2}$/.test(monat)) throw new Error('Monat muss das Format YYYY-MM haben.')
  const { bundesland, organizationId, edifactGenerator, dryRun = false } = options
  if (!bundesland) {
    throw new Error(
      'Bundesland fehlt: erstelleMonatsabschluss() braucht den Bundesland-Katalogcode '
      + 'des Leistungsorts (z. B. "hessen"). Ohne ihn würden landesfremde Preise gezogen.'
    )
  }
  if (!organizationId) {
    throw new Error('organizationId fehlt: erstelleMonatsabschluss() benötigt die Mandanten-ID.')
  }

  const [jahr, monatNum] = monat.split('-').map(Number)
  const periodStart = `${monat}-01`
  const lastDay = new Date(jahr, monatNum, 0).getDate()
  const periodEnd = `${monat}-${String(lastDay).padStart(2, '0')}`
  const warnungen: AbschlussWarnung[] = []

  // ── 1) Genehmigte Verordnungen ──
  const { data: verordnungen, error: vErr } = await supabase
    .from('verordnungen')
    .select(
      'id, client_id, verordnung_type, leistungsart, genehmigung_status, genehmigung_aktenzeichen, genehmigung_bis, kostentraeger_typ, kostentraeger_name, kostentraeger_ik_nummer, abtretungserklaerung_vorhanden'
    )
    .eq('organization_id', organizationId)
    .eq('genehmigung_status', 'genehmigt')
  if (vErr) throw new Error(`Verordnungen konnten nicht geladen werden: ${vErr.message}`)
  const vos = verordnungen || []

  if (vos.length === 0) {
    return {
      monat,
      zeitraum: { von: periodStart, bis: periodEnd },
      verordnungen_geprueft: 0,
      positionen_abrechenbar: 0,
      positionen_blockiert: 0,
      gesamt_cent: 0,
      gruppen: [],
      warnungen: [
        { schwere: 'hinweis', text: 'Keine genehmigten Verordnungen vorhanden — nichts abzurechnen.' },
      ],
      closings_geschrieben: 0,
    }
  }

  // ── Klienten-Namen für Reports ──
  const clientIds = Array.from(new Set(vos.map(v => v.client_id)))
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .in('id', clientIds)
  const clientName = new Map<string, string>(
    (clients || []).map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()])
  )

  // ── 2) Einsätze des Monats für alle Verordnungen ──
  const verordnungIds = vos.map(v => v.id)
  const { data: records, error: rErr } = await supabase
    .from('service_records')
    .select(
      'id, verordnung_id, client_id, date, duration_minutes, service_type, amount, status, client_signature'
    )
    .eq('organization_id', organizationId)
    .in('verordnung_id', verordnungIds)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .in('status', ['complete', 'signed', 'invoiced'])
  if (rErr) throw new Error(`Einsätze konnten nicht geladen werden: ${rErr.message}`)
  const recs = records || []

  // ── 3) Digitale Unterschriften (service_signatures) dazuladen ──
  const recordIds = recs.map(r => r.id)
  const signedRecordIds = new Set<string>()
  if (recordIds.length > 0) {
    // In Batches, um URL-Längen-Limits zu vermeiden
    for (let i = 0; i < recordIds.length; i += 200) {
      const batch = recordIds.slice(i, i + 200)
      const { data: sigs } = await supabase
        .from('service_signatures')
        .select('service_record_id')
        .eq('signer_role', 'client')
        .in('service_record_id', batch)
      for (const s of sigs || []) signedRecordIds.add(s.service_record_id)
    }
  }

  // ── 6) Preistabelle laden ──
  const { data: preisRows } = await supabase
    .from('leistungspreise')
    .select('leistungsart, preis_cent, gueltig_ab, gueltig_bis, tarif_status, verifizierungs_quelle')
    .eq('organization_id', organizationId)
    .eq('bundesland', bundesland)
  const preise: Leistungspreis[] = (preisRows || []) as Leistungspreis[]
  if (preise.length === 0) {
    warnungen.push({
      schwere: 'warnung',
      text: `Keine Leistungspreise für Bundesland „${bundesland}" hinterlegt — es kann kein Vorschau-Betrag ermittelt werden. Es wird KEIN Ersatzpreis verwendet.`,
    })
  } else if (!preise.some(p => p.tarif_status === 'verified')) {
    warnungen.push({
      schwere: 'warnung',
      text: `Alle ${preise.length} Leistungspreise für „${bundesland}" sind nicht verifiziert — kein Vorschau-Betrag abrechenbar. Preise unter /admin/leistungspreise mit Angabe der Rechtsquelle verifizieren.`,
    })
  }

  // ── 2–4) Je Verordnung: sammeln + prüfen ──
  const recsByVerordnung = new Map<string, typeof recs>()
  for (const r of recs) {
    const list = recsByVerordnung.get(r.verordnung_id!) || []
    list.push(r)
    recsByVerordnung.set(r.verordnung_id!, list)
  }

  const positionen: AbrechnungsPosition[] = []
  for (const v of vos) {
    const vRecs = recsByVerordnung.get(v.id) || []
    const name = clientName.get(v.client_id) || v.client_id

    if (vRecs.length === 0) continue // in diesem Monat nichts erbracht

    // Genehmigung noch gültig?
    if (v.genehmigung_bis && v.genehmigung_bis < periodStart) {
      warnungen.push({
        schwere: 'fehler',
        verordnung_id: v.id,
        client: name,
        text: `Genehmigung bereits am ${v.genehmigung_bis} abgelaufen — Einsätze des Monats ${monat} sind nicht gedeckt.`,
      })
    }
    if (!v.genehmigung_aktenzeichen) {
      warnungen.push({
        schwere: 'warnung',
        verordnung_id: v.id,
        client: name,
        text: 'Genehmigungsnummer (Aktenzeichen) fehlt — Nachweis wird von der Kasse ggf. abgewiesen.',
      })
    }

    // 3) Unterschrift: jeder Einsatz braucht Klient-Bestätigung
    const unsigned = vRecs.filter(r => !r.client_signature && !signedRecordIds.has(r.id))
    const unterschrieben = unsigned.length === 0
    if (!unterschrieben) {
      warnungen.push({
        schwere: 'warnung',
        verordnung_id: v.id,
        client: name,
        text: `${unsigned.length} von ${vRecs.length} Einsätzen ohne Klienten-Unterschrift — Leistungsnachweis vor Einreichung unterschreiben lassen.`,
      })
    }

    // 4) Abtretungserklärung
    const abtretung = Boolean(v.abtretungserklaerung_vorhanden)
    if (!abtretung) {
      warnungen.push({
        schwere: 'fehler',
        verordnung_id: v.id,
        client: name,
        text: 'Abtretungserklärung fehlt — Direktabrechnung mit dem Kostenträger nicht möglich.',
      })
    }

    // 6) VORSCHAU-Betrag: leistungspreise (Minuten × Stundenpreis)
    // KEIN Fallback auf service_records.amount fuer Kassenleistungen —
    // ohne Preis in der leistungspreise-Tabelle wird die Position
    // als nicht-abrechenbar markiert (betrag_cent = 0, Warnung).
    let betragCent = 0
    let minuten = 0
    let luecke: Preisluecke | null = null
    for (const r of vRecs) {
      const mins = r.duration_minutes || 0
      minuten += mins
      const { preisCent, luecke: l } = findePreis(preise, r.service_type || v.leistungsart, r.date)
      if (preisCent != null && mins > 0) {
        betragCent += centRunden((mins / 60) * preisCent)
      } else {
        // Erste Lücke gewinnt; 'nicht_verifiziert' ist die aussagekräftigere
        // Meldung und verdrängt ein vorher gemerktes 'kein_eintrag'.
        if (!luecke || (luecke.grund === 'kein_eintrag' && l?.grund === 'nicht_verifiziert')) {
          luecke = l ?? { grund: 'kein_eintrag' }
        }
      }
    }
    if (luecke) {
      warnungen.push({
        schwere: 'warnung',
        verordnung_id: v.id,
        client: name,
        text: luecke.grund === 'nicht_verifiziert'
          ? `Leistungspreis fuer "${v.leistungsart}" ist nicht verifiziert (Status: ${luecke.status}`
            + `${luecke.quelle ? `, Grund: ${luecke.quelle}` : ''}) — kein Vorschau-Betrag angesetzt. `
            + `Preis unter /admin/leistungspreise mit Rechtsquelle verifizieren.`
          : `Kein gueltiger Eintrag in leistungspreise fuer Leistungsart "${v.leistungsart}" zum Leistungsdatum `
            + `— Vorschau-Betrag unvollstaendig. Verbindliche Preise kommen aus billing_tariffs bei Rechnungserstellung.`,
      })
    }

    positionen.push({
      verordnung_id: v.id,
      client_id: v.client_id,
      client: name,
      genehmigungsnummer: v.genehmigung_aktenzeichen,
      leistungsart: v.leistungsart,
      einsaetze: vRecs.length,
      minuten,
      betrag_cent: betragCent,
      unterschrieben,
      abtretung_vorhanden: abtretung,
      abrechenbar: unterschrieben && abtretung,
    })
  }

  // ── 5) Gruppierung nach Kostenträger ──
  const gruppenMap = new Map<string, KostentraegerGruppe>()
  for (const v of vos) {
    const pos = positionen.filter(p => p.verordnung_id === v.id)
    if (pos.length === 0) continue
    const key = `${v.kostentraeger_typ}|${v.kostentraeger_name || 'Unbekannt'}|${v.kostentraeger_ik_nummer || ''}`
    const gruppe: KostentraegerGruppe = gruppenMap.get(key) || {
      kostentraeger_name: v.kostentraeger_name || 'Unbekannter Kostenträger',
      kostentraeger_typ: v.kostentraeger_typ || 'krankenkasse',
      ik_nummer: v.kostentraeger_ik_nummer || null,
      positionen: [],
      summe_cent: 0,
    }
    for (const p of pos) {
      gruppe.positionen.push(p)
      if (p.abrechenbar) gruppe.summe_cent += p.betrag_cent
    }
    gruppenMap.set(key, gruppe)
  }
  const gruppen = Array.from(gruppenMap.values()).sort((a, b) =>
    a.kostentraeger_name.localeCompare(b.kostentraeger_name, 'de')
  )

  // ── 8) EDIFACT je Kostenträger (Generator injiziert) ──
  if (edifactGenerator) {
    for (const g of gruppen) {
      try {
        g.edifact = edifactGenerator(g, monat)
      } catch (e: any) {
        warnungen.push({
          schwere: 'warnung',
          text: `EDIFACT-Erzeugung für ${g.kostentraeger_name} fehlgeschlagen: ${e?.message || e}`,
        })
      }
    }
  }

  // ── 7) Abrechnungslauf-Einträge: monthly_closings je Klient upserten ──
  let closingsGeschrieben = 0
  if (!dryRun) {
    // Positionen je Klient aggregieren
    const perClient = new Map<string, { records: number; cent: number; blockiert: boolean }>()
    for (const p of positionen) {
      const agg = perClient.get(p.client_id) || { records: 0, cent: 0, blockiert: false }
      agg.records += p.einsaetze
      agg.cent += p.betrag_cent
      if (!p.abrechenbar) agg.blockiert = true
      perClient.set(p.client_id, agg)
    }
    for (const [clientId, agg] of perClient) {
      const { error: upErr } = await supabase.from('monthly_closings').upsert(
        {
          // MANDANT: Pflichtangabe. Fehlte sie, griff der Spalten-Default
          // `current_org_id()` (Phase-3-Migration 20260801) — und der faellt
          // bei einem service-role-Client ohne JWT auf die Stamm-Org
          // zurueck. Jeder Monatsabschluss JEDES Mandanten landete damit in
          // der Stamm-Organisation, und der Mandant sah seinen eigenen
          // wegen der RESTRICTIVE org_fence-Policy nicht. Derselbe Fehler
          // ist in lib/billing/core/audit.ts bereits beschrieben.
          organization_id: organizationId,
          client_id: clientId,
          year: jahr,
          month: monatNum,
          status: agg.blockiert ? 'in_review' : 'ready',
          ampel: agg.blockiert ? 'gelb' : 'gruen',
          total_records: agg.records,
          total_amount: agg.cent / 100,
          notes: `Automatischer Monatsabschluss ${monat} — Alltagsengel`,
        },
        { onConflict: 'client_id,year,month' }
      )
      if (upErr) {
        warnungen.push({
          schwere: 'warnung',
          client: clientName.get(clientId) || clientId,
          text: `Monatsabschluss-Eintrag konnte nicht gespeichert werden: ${upErr.message}`,
        })
      } else {
        closingsGeschrieben++
      }
    }
  }

  const abrechenbar = positionen.filter(p => p.abrechenbar)
  return {
    monat,
    zeitraum: { von: periodStart, bis: periodEnd },
    verordnungen_geprueft: vos.length,
    positionen_abrechenbar: abrechenbar.length,
    positionen_blockiert: positionen.length - abrechenbar.length,
    gesamt_cent: abrechenbar.reduce((s, p) => s + p.betrag_cent, 0),
    gruppen,
    warnungen,
    closings_geschrieben: closingsGeschrieben,
  }
}
