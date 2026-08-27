/**
 * Abrechnungs-Monitoring — Zaehler, Audit-Zusammenfassung, Anomalien
 *
 * ── Warum nicht der bestehende Metriken-Ring-Buffer ─────────────────────
 * `lib/monitoring/metrics.ts` zaehlt HTTP-Requests je Serverless-Instanz.
 * Das beantwortet „ist die API langsam", aber nicht „sind heute Nacht 40
 * Rechnungsmails auf die Nase gefallen". Fuer die Geldwege zaehlt der
 * fachliche Vorgang, und der steht in der Datenbank: `billing_audit_trail`
 * (jede Abrechnungsaktion mit Pruefsumme) und `invoice_email_log` (jeder
 * Zustellversuch mit Endzustand). Beide ueberleben einen Cold Start.
 *
 * ── Die Leitregel dieses Moduls ─────────────────────────────────────────
 * Eine Null muss von einem Messausfall unterscheidbar bleiben. „0 Fehler"
 * und „konnte nicht gezaehlt werden" sehen in jedem Dashboard gleich aus
 * und bedeuten das Gegenteil voneinander. Deshalb traegt jede Kennzahl ein
 * `messbar`-Feld, und ein Lesefehler erzeugt eine eigene Anomalie der
 * Schwere 'hoch' — nicht etwa eine stille 0.
 *
 * ── Was hier bewusst NICHT passiert ─────────────────────────────────────
 * Kein Versand, keine Eskalation, kein externer Dienst. Das Modul liest und
 * rechnet. Wer daraus eine Benachrichtigung machen will, verdrahtet das
 * getrennt — ein Monitoring, das selbst Mails schickt, ist der naechste
 * Kandidat fuer eine Schleife aus Fehler und Fehlermeldung.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

const log = logger.child('monitoring:abrechnung')

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type Schwere = 'hoch' | 'mittel' | 'niedrig'

export interface Anomalie {
  schluessel: string
  schwere: Schwere
  meldung: string
}

/** Ein Zaehler samt Vergleichswert aus dem vorangegangenen, gleich langen Fenster. */
export interface Zaehler {
  /** Anzahl im Beobachtungsfenster. */
  aktuell: number
  /** Anzahl im unmittelbar davorliegenden, gleich langen Fenster. */
  vorher: number
  /**
   * false, wenn die Abfrage fehlgeschlagen ist. `aktuell` ist dann 0 und
   * bedeutet NICHTS — jede Auswertung muss das vorher pruefen.
   */
  messbar: boolean
}

export interface VersandZaehler {
  versendet: Zaehler
  fehlgeschlagen: Zaehler
  uebersprungen: Zaehler
}

export interface AuditZusammenfassung {
  messbar: boolean
  /** Eintraege im Fenster, gesamt. */
  gesamt: number
  /** Anzahl je entity_type, absteigend. */
  jeEntityTyp: { entityType: string; anzahl: number }[]
  /** Anzahl je action, absteigend. */
  jeAktion: { aktion: string; anzahl: number }[]
  /** Anzahl unterschiedlicher Handelnder — 0 heisst: nur Automatik oder nichts. */
  handelnde: number
  /** Zeitpunkt des juengsten Eintrags (ISO) oder null. */
  letzterEintragAm: string | null
}

export interface AbrechnungsMetriken {
  organizationId: string
  /** Beobachtungsfenster in Stunden. */
  fensterStunden: number
  /** Beginn des Beobachtungsfensters (ISO). */
  fensterVon: string
  /** Ende des Beobachtungsfensters (ISO) — der Messzeitpunkt. */
  fensterBis: string
  rechnungen: Zaehler
  mahnungen: Zaehler
  camtImporte: Zaehler
  zahlungen: Zaehler
  rechnungsversand: VersandZaehler
  audit: AuditZusammenfassung
  anomalien: Anomalie[]
}

export interface Schwellen {
  /** Ab dieser Fehlerquote im Versand wird gemeldet (0..1). */
  versandFehlerquote: number
  /** Erst ab so vielen Versuchen ist eine Quote ueberhaupt aussagekraeftig. */
  versandMindestVersuche: number
  /** Faktor, ab dem ein Mengenanstieg gegenueber dem Vorfenster auffaellt. */
  ausschlagFaktor: number
  /** Erst ab dieser Menge im Vorfenster ist ein Faktor aussagekraeftig. */
  ausschlagMindestVorher: number
}

export const STANDARD_SCHWELLEN: Schwellen = {
  // 20 %: unter einem Fuenftel ist bei kleinen Stueckzahlen jede einzelne
  // Bounce-Mail sofort ein Alarm; darueber ist es keiner mehr wert.
  versandFehlerquote: 0.2,
  versandMindestVersuche: 5,
  // Faktor 3 statt 2: der Sammelrechnungslauf verdoppelt die Tagesmenge
  // planmaessig — eine Verdopplung ist hier Normalbetrieb, keine Anomalie.
  ausschlagFaktor: 3,
  ausschlagMindestVorher: 5,
}

// ---------------------------------------------------------------------------
// Anomalie-Erkennung — reine Funktion, ohne Datenbank
// ---------------------------------------------------------------------------

const LEERER_ZAEHLER: Zaehler = { aktuell: 0, vorher: 0, messbar: false }

function pruefeAusschlag(
  name: string,
  z: Zaehler,
  s: Schwellen,
  treffer: Anomalie[],
): void {
  if (!z.messbar) return
  if (z.vorher < s.ausschlagMindestVorher) return
  if (z.aktuell >= z.vorher * s.ausschlagFaktor) {
    treffer.push({
      schluessel: `ausschlag_${name}`,
      schwere: 'mittel',
      meldung:
        `${name}: ${z.aktuell} im Beobachtungsfenster gegenueber ${z.vorher} im `
        + `Vorfenster (Faktor ${(z.aktuell / z.vorher).toFixed(1)}). Auffaellig, `
        + `aber nicht zwingend falsch — ein Sammellauf sieht genauso aus.`,
    })
  }
  if (z.vorher > 0 && z.aktuell === 0) {
    treffer.push({
      schluessel: `stillstand_${name}`,
      schwere: 'mittel',
      meldung:
        `${name}: im Beobachtungsfenster kein einziger Vorgang, im Vorfenster `
        + `waren es ${z.vorher}. Entweder ist nichts angefallen oder der Weg `
        + `ist unterbrochen — beides sieht von aussen gleich aus.`,
    })
  }
}

/**
 * Wertet fertige Kennzahlen aus. Getrennt vom Datenbankweg, damit jede Regel
 * ohne Datenbank pruefbar ist.
 */
export function erkenneAnomalien(
  m: Omit<AbrechnungsMetriken, 'anomalien'>,
  schwellen: Schwellen = STANDARD_SCHWELLEN,
): Anomalie[] {
  const treffer: Anomalie[] = []

  // ── 1. Messausfaelle zuerst. Alles Weitere steht unter Vorbehalt. ──
  const unmessbar: string[] = []
  if (!m.rechnungen.messbar) unmessbar.push('Rechnungen')
  if (!m.mahnungen.messbar) unmessbar.push('Mahnungen')
  if (!m.camtImporte.messbar) unmessbar.push('CAMT-Importe')
  if (!m.zahlungen.messbar) unmessbar.push('Zahlungen')
  if (!m.rechnungsversand.versendet.messbar) unmessbar.push('Rechnungsversand')
  if (!m.audit.messbar) unmessbar.push('Audit-Trail')

  if (unmessbar.length > 0) {
    treffer.push({
      schluessel: 'nicht_messbar',
      schwere: 'hoch',
      meldung:
        `Nicht gemessen werden konnten: ${unmessbar.join(', ')}. Die Zaehler `
        + `stehen dort auf 0, das bedeutet hier aber NICHT "nichts passiert", `
        + `sondern "nicht gezaehlt".`,
    })
  }

  // ── 2. Fehlerquote im Rechnungsversand ──
  const v = m.rechnungsversand
  if (v.versendet.messbar && v.fehlgeschlagen.messbar) {
    const versuche = v.versendet.aktuell + v.fehlgeschlagen.aktuell
    const quote = versuche > 0 ? v.fehlgeschlagen.aktuell / versuche : 0

    if (versuche >= schwellen.versandMindestVersuche && quote >= schwellen.versandFehlerquote) {
      treffer.push({
        schluessel: 'versand_fehlerquote',
        schwere: 'hoch',
        meldung:
          `Rechnungsversand: ${v.fehlgeschlagen.aktuell} von ${versuche} Versuchen `
          + `fehlgeschlagen (${(quote * 100).toFixed(0)} %, Schwelle `
          + `${(schwellen.versandFehlerquote * 100).toFixed(0)} %).`,
      })
    } else if (v.fehlgeschlagen.aktuell > 0) {
      // Unterhalb der Schwelle, aber nicht null — sichtbar bleiben, ohne zu alarmieren.
      treffer.push({
        schluessel: 'versand_einzelfehler',
        schwere: 'niedrig',
        meldung:
          `Rechnungsversand: ${v.fehlgeschlagen.aktuell} von ${versuche} Versuchen `
          + `fehlgeschlagen. Unter der Alarmschwelle, aber nicht null.`,
      })
    }

    // Ein Anstieg der Fehlschlaege gegenueber dem Vorfenster ist auch dann
    // eine Aussage, wenn die Quote die Schwelle noch nicht reisst.
    if (v.fehlgeschlagen.vorher === 0 && v.fehlgeschlagen.aktuell >= 3) {
      treffer.push({
        schluessel: 'versand_fehler_neu',
        schwere: 'mittel',
        meldung:
          `Rechnungsversand: ${v.fehlgeschlagen.aktuell} Fehlschlaege, im `
          + `Vorfenster keine. Der Anstieg kam mit diesem Fenster.`,
      })
    }
  }

  // ── 3. Mengenausschlaege und Stillstand ──
  pruefeAusschlag('Rechnungen', m.rechnungen, schwellen, treffer)
  pruefeAusschlag('Mahnungen', m.mahnungen, schwellen, treffer)
  pruefeAusschlag('CAMT-Importe', m.camtImporte, schwellen, treffer)

  // ── 4. Geldbewegung ohne Audit-Spur ──
  // Jede Rechnung, jede Zahlung schreibt in den Audit-Trail. Zaehler > 0 bei
  // leerem Trail heisst: die Protokollierung haengt — und damit ist die
  // Revisionssicherheit fuer dieses Fenster dahin.
  const geldvorgaenge = m.rechnungen.aktuell + m.zahlungen.aktuell
  if (m.audit.messbar && m.rechnungen.messbar && m.zahlungen.messbar
      && geldvorgaenge > 0 && m.audit.gesamt === 0) {
    treffer.push({
      schluessel: 'audit_luecke',
      schwere: 'hoch',
      meldung:
        `${geldvorgaenge} Geldvorgang/-vorgaenge im Fenster, aber kein einziger `
        + `Eintrag im Abrechnungs-Audit-Trail. Die Protokollierung greift nicht.`,
    })
  }

  return treffer
}

// ---------------------------------------------------------------------------
// Datenbankweg
// ---------------------------------------------------------------------------

/** Zaehlt Zeilen einer Tabelle in einem Zeitfenster, org-gefenced. */
async function zaehle(
  admin: SupabaseClient,
  tabelle: string,
  zeitspalte: string,
  organizationId: string,
  von: string,
  bis: string,
  zusatz?: (q: any) => any,
): Promise<{ anzahl: number; messbar: boolean }> {
  try {
    let q = admin
      .from(tabelle)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte(zeitspalte, von)
      .lt(zeitspalte, bis)
    if (zusatz) q = zusatz(q)

    const { count, error } = await q
    if (error) {
      log.warn('Zaehlung fehlgeschlagen', {
        organizationId, tabelle, errorMessage: error.message, errorCode: error.code,
      })
      return { anzahl: 0, messbar: false }
    }
    return { anzahl: count ?? 0, messbar: true }
  } catch (err) {
    log.warnWithException('Zaehlung abgebrochen', err, { organizationId, tabelle })
    return { anzahl: 0, messbar: false }
  }
}

/** Zaehlt aktuelles und vorheriges Fenster in einem Rutsch. */
async function zaehlerFuer(
  admin: SupabaseClient,
  tabelle: string,
  zeitspalte: string,
  organizationId: string,
  fenster: { davor: string; von: string; bis: string },
  zusatz?: (q: any) => any,
): Promise<Zaehler> {
  const a = await zaehle(admin, tabelle, zeitspalte, organizationId, fenster.von, fenster.bis, zusatz)
  const v = await zaehle(admin, tabelle, zeitspalte, organizationId, fenster.davor, fenster.von, zusatz)
  return { aktuell: a.anzahl, vorher: v.anzahl, messbar: a.messbar && v.messbar }
}

interface AuditZeile {
  entity_type: string
  action: string
  actor_id: string | null
  created_at: string
}

/**
 * Fasst den Abrechnungs-Audit-Trail eines Fensters zusammen.
 *
 * Obergrenze 2000 Zeilen: eine Zusammenfassung, die den gesamten Trail laedt,
 * faellt genau dann um, wenn am meisten los ist. `gekappt` weist das aus —
 * eine stillschweigend gekappte Statistik waere schlimmer als keine.
 */
export async function fasseAuditTrailZusammen(
  admin: SupabaseClient,
  organizationId: string,
  von: string,
  bis: string,
  obergrenze = 2000,
): Promise<AuditZusammenfassung & { gekappt: boolean }> {
  const leer = {
    messbar: false, gesamt: 0, jeEntityTyp: [], jeAktion: [],
    handelnde: 0, letzterEintragAm: null, gekappt: false,
  }

  try {
    const { data, error } = await admin
      .from('billing_audit_trail')
      .select('entity_type, action, actor_id, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', von)
      .lt('created_at', bis)
      .order('created_at', { ascending: false })
      .limit(obergrenze)

    if (error) {
      log.warn('Audit-Zusammenfassung fehlgeschlagen', {
        organizationId, errorMessage: error.message, errorCode: error.code,
      })
      return leer
    }

    const zeilen = (data ?? []) as unknown as AuditZeile[]

    const typen = new Map<string, number>()
    const aktionen = new Map<string, number>()
    const akteure = new Set<string>()
    for (const z of zeilen) {
      typen.set(z.entity_type, (typen.get(z.entity_type) ?? 0) + 1)
      aktionen.set(z.action, (aktionen.get(z.action) ?? 0) + 1)
      if (z.actor_id) akteure.add(z.actor_id)
    }

    const absteigend = <T>(m: Map<string, number>, bau: (k: string, n: number) => T): T[] =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => bau(k, n))

    return {
      messbar: true,
      gesamt: zeilen.length,
      jeEntityTyp: absteigend(typen, (entityType, anzahl) => ({ entityType, anzahl })),
      jeAktion: absteigend(aktionen, (aktion, anzahl) => ({ aktion, anzahl })),
      handelnde: akteure.size,
      letzterEintragAm: zeilen[0]?.created_at ?? null,
      gekappt: zeilen.length >= obergrenze,
    }
  } catch (err) {
    log.warnWithException('Audit-Zusammenfassung abgebrochen', err, { organizationId })
    return leer
  }
}

export interface SammelParams {
  organizationId: string
  /** Beobachtungsfenster in Stunden (Standard 24). */
  fensterStunden?: number
  /** Messzeitpunkt — injizierbar, damit Tests nicht von der Uhr abhaengen. */
  jetzt?: Date
  schwellen?: Schwellen
}

/**
 * Sammelt alle Kennzahlen und wertet sie aus.
 *
 * Wirft nicht. Ein Monitoring, das beim Messen abstuerzt, meldet keinen
 * Ausfall — es IST einer.
 */
export async function sammleAbrechnungsMetriken(
  admin: SupabaseClient,
  params: SammelParams,
): Promise<AbrechnungsMetriken> {
  const { organizationId, fensterStunden = 24, schwellen = STANDARD_SCHWELLEN } = params
  const jetzt = params.jetzt ?? new Date()

  const msFenster = fensterStunden * 60 * 60 * 1000
  const bis = jetzt.toISOString()
  const von = new Date(jetzt.getTime() - msFenster).toISOString()
  const davor = new Date(jetzt.getTime() - 2 * msFenster).toISOString()
  const fenster = { davor, von, bis }

  // deleted_at-Filter nur dort, wo die Spalte belegt existiert (invoices,
  // payments). Ein Filter auf eine fehlende Spalte beantwortet PostgREST mit
  // 42703 — die Zaehlung faellt dann komplett aus, statt nur ungenau zu sein.
  const rechnungen = await zaehlerFuer(
    admin, 'invoices', 'created_at', organizationId, fenster,
    q => q.is('deleted_at', null))
  const mahnungen = await zaehlerFuer(
    admin, 'dunning_entries', 'last_dunning_at', organizationId, fenster,
    // 'offen' ist der Ausgangszustand — eine Zeile ohne Mahnstufe ist keine
    // versandte Mahnung, sondern nur eine offene Forderung.
    q => q.neq('dunning_level', 'offen'),
  )
  const zahlungen = await zaehlerFuer(
    admin, 'payments', 'created_at', organizationId, fenster,
    q => q.is('deleted_at', null))

  // CAMT-Importe haben keine eigene Tabelle — sie stehen als
  // entity_type='camt_import' im Abrechnungs-Audit-Trail.
  const camtImporte = await zaehlerFuer(
    admin, 'billing_audit_trail', 'created_at', organizationId, fenster,
    q => q.eq('entity_type', 'camt_import'),
  )

  const rechnungsversand: VersandZaehler = {
    versendet: await zaehlerFuer(
      admin, 'invoice_email_log', 'created_at', organizationId, fenster,
      q => q.eq('status', 'versendet')),
    fehlgeschlagen: await zaehlerFuer(
      admin, 'invoice_email_log', 'created_at', organizationId, fenster,
      q => q.eq('status', 'fehlgeschlagen')),
    uebersprungen: await zaehlerFuer(
      admin, 'invoice_email_log', 'created_at', organizationId, fenster,
      q => q.eq('status', 'uebersprungen')),
  }

  const audit = await fasseAuditTrailZusammen(admin, organizationId, von, bis)

  const ohneAnomalien: Omit<AbrechnungsMetriken, 'anomalien'> = {
    organizationId,
    fensterStunden,
    fensterVon: von,
    fensterBis: bis,
    rechnungen,
    mahnungen,
    camtImporte,
    zahlungen,
    rechnungsversand,
    audit,
  }

  const anomalien = erkenneAnomalien(ohneAnomalien, schwellen)

  if (anomalien.some(a => a.schwere === 'hoch')) {
    log.error('Abrechnungs-Monitoring meldet Auffaelligkeiten der Schwere hoch', {
      organizationId,
      fensterStunden,
      anomalien: anomalien.filter(a => a.schwere === 'hoch').map(a => a.schluessel),
    })
  }

  return { ...ohneAnomalien, anomalien }
}

export { LEERER_ZAEHLER }
