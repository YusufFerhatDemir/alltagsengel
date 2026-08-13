/**
 * Wiedervorlage — die Reprocessing-Queue für abgelehnte Positionen.
 *
 * DAS PROBLEM, DAS SIE LÖST
 * Ein Rückläufer der Kasse kann 40 Positionen enthalten, von denen 3 abgelehnt
 * und 2 gekürzt sind. Bisher endete die Kette dort: der Rückläufer bekam einen
 * Status, eine Aufgabe wurde erzeugt, und der Rest war Handarbeit ohne
 * Arbeitsvorrat. Wer welche der 5 Positionen bereits geprüft hatte, stand
 * nirgends — und ein nicht nachverfolgter abgelehnter Betrag ist schlicht
 * Geld, das nie kommt.
 *
 * DIE QUEUE
 * Eine Zeile je betroffener Position, mit eigenem Status:
 *   offen → in_korrektur → korrigiert → eingereicht → erledigt
 *                                    ↘ verworfen (nur mit Begründung)
 *
 * Die Rückmeldung der Kasse selbst (`dta_ruecklaeufer_positionen`) wird dabei
 * NICHT verändert — sie ist Beleg. Die Wiedervorlage ist der eigene Vorgang
 * daneben.
 *
 * DUBLETTENSCHUTZ
 * Der Unique-Index auf `ruecklaeufer_position_id` verhindert, dass dieselbe
 * Position zweimal in die Queue kommt. Ohne ihn würde ein zweiter Lauf des
 * Einreihens denselben Betrag ein zweites Mal nachfordern — bei der Kasse eine
 * doppelte Forderung, im eigenen Haus eine falsche Offene-Posten-Liste.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import { erstelleKorrekturlauf, fuehreKorrekturAus } from './korrekturlaeufe'
import { klassifiziereFehlercode, type FehlerKategorie, FEHLER_KATEGORIEN } from './ruecklaeufer-fehlercodes'

export type WiedervorlageStatus =
  | 'offen' | 'in_korrektur' | 'korrigiert'
  | 'eingereicht' | 'erledigt' | 'verworfen'

/** Wie viele Tage nach Eingang der Rückmeldung die Korrektur stehen soll. */
const WIEDERVORLAGE_FRIST_TAGE = 14

export interface WiedervorlageEintrag {
  id: string
  ruecklaeuferId: string
  ruecklaeuferPositionId: string | null
  originalLaufId: string | null
  invoiceId: string | null
  clientId: string | null
  kategorie: FehlerKategorie
  fehlerCode: string | null
  fehlerText: string | null
  status: WiedervorlageStatus
  betragAngefordertCent: number | null
  betragAnerkanntCent: number | null
  betragOffenCent: number
  korrekturNotiz: string | null
  korrekturDaten: Record<string, unknown>
  korrekturLaufId: string | null
  faelligAm: string | null
  eingereichtAm: string | null
  createdAt: string
  /** Handlungsanweisung zur Kategorie — nicht in der DB, aus dem Katalog. */
  massnahme: string
}

export interface EinreihenErgebnis {
  erstellt: number
  uebersprungen: number
  offenerBetragCent: number
  eintragIds: string[]
}

function fristDatum(tage: number): string {
  const d = new Date()
  d.setDate(d.getDate() + tage)
  return d.toISOString().slice(0, 10)
}

// ── Aus einem Rückläufer in die Queue ───────────────────────────

/**
 * Nimmt alle abgelehnten/gekürzten Positionen eines Rückläufers in die Queue auf.
 *
 * Positionen mit Status 'angenommen' bleiben aussen vor — es gibt nichts zu tun.
 * Hat der Rückläufer gar keine Einzelpositionen (viele Kassen melden nur den
 * Gesamtfall zurück), wird EIN Sammeleintrag erzeugt: sonst fiele eine
 * Komplettablehnung durchs Raster, weil sie keine Positionszeilen hat.
 */
export async function reiheRuecklaeuferEin(
  supabase: SupabaseClient,
  params: { ruecklaeuferId: string; organizationId: string; actorId: string },
): Promise<EinreihenErgebnis> {
  const { ruecklaeuferId, organizationId, actorId } = params

  const { data: rl } = await supabase
    .from('dta_ruecklaeufer')
    .select('id, lauf_id, invoice_id, client_id, kostentraeger_ik, status, fehler_code, fehler_text, betrag_angefordert_cent, betrag_anerkannt_cent')
    .eq('id', ruecklaeuferId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!rl) throw new Error('Rückläufer nicht gefunden oder gehört zu einer anderen Organisation')

  const { data: positionen } = await supabase
    .from('dta_ruecklaeufer_positionen')
    .select('id, invoice_item_id, position_nummer, leistungsart, leistungsdatum, status, betrag_angefordert_cent, betrag_anerkannt_cent, fehler_code, fehler_text, ablehnungsgrund')
    .eq('ruecklaeufer_id', ruecklaeuferId)
    .eq('organization_id', organizationId)
    .in('status', ['abgelehnt', 'gekuerzt'])

  const faellig = fristDatum(WIEDERVORLAGE_FRIST_TAGE)
  const eintragIds: string[] = []
  let erstellt = 0
  let uebersprungen = 0
  let offenerBetragCent = 0

  const zeilen: Array<Record<string, unknown>> = []

  if (positionen?.length) {
    for (const p of positionen) {
      const klass = await klassifiziereFehlercode(
        supabase, organizationId,
        p.fehler_code ?? rl.fehler_code,
        p.fehler_text ?? p.ablehnungsgrund ?? rl.fehler_text,
        rl.kostentraeger_ik,
      )
      zeilen.push({
        organization_id: organizationId,
        ruecklaeufer_id: ruecklaeuferId,
        ruecklaeufer_position_id: p.id,
        original_lauf_id: rl.lauf_id,
        invoice_id: rl.invoice_id,
        client_id: rl.client_id,
        kategorie: klass.kategorie,
        fehler_code: p.fehler_code ?? rl.fehler_code,
        fehler_text: p.fehler_text ?? p.ablehnungsgrund ?? rl.fehler_text,
        betrag_angefordert_cent: p.betrag_angefordert_cent,
        betrag_anerkannt_cent: p.betrag_anerkannt_cent,
        faellig_am: faellig,
        created_by: actorId,
      })
    }
  } else if (['abgelehnt', 'teilweise_abgelehnt', 'fachlicher_fehler', 'technischer_fehler', 'korrektur_erforderlich'].includes(rl.status)) {
    // Sammelfall ohne Einzelpositionen. Der Unique-Index greift hier nicht
    // (ruecklaeufer_position_id ist NULL) — Dublette deshalb vorher prüfen,
    // sonst legt jeder erneute Aufruf denselben Sammeleintrag noch einmal an.
    const { data: bereitsDa } = await supabase
      .from('dta_wiedervorlage')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('ruecklaeufer_id', ruecklaeuferId)
      .is('ruecklaeufer_position_id', null)
      .limit(1)
      .maybeSingle()

    if (bereitsDa) {
      return { erstellt: 0, uebersprungen: 1, offenerBetragCent: 0, eintragIds: [] }
    }

    const klass = await klassifiziereFehlercode(
      supabase, organizationId, rl.fehler_code, rl.fehler_text, rl.kostentraeger_ik,
    )
    zeilen.push({
      organization_id: organizationId,
      ruecklaeufer_id: ruecklaeuferId,
      ruecklaeufer_position_id: null,
      original_lauf_id: rl.lauf_id,
      invoice_id: rl.invoice_id,
      client_id: rl.client_id,
      kategorie: klass.kategorie,
      fehler_code: rl.fehler_code,
      fehler_text: rl.fehler_text,
      betrag_angefordert_cent: rl.betrag_angefordert_cent,
      betrag_anerkannt_cent: rl.betrag_anerkannt_cent,
      faellig_am: faellig,
      created_by: actorId,
    })
  }

  // Einzeln einfügen statt als Batch: der Unique-Index auf
  // ruecklaeufer_position_id soll nur die betroffene Zeile abweisen, nicht den
  // ganzen Vorgang. Ein zweiter Aufruf für denselben Rückläufer darf keine
  // Dubletten erzeugen und trotzdem neu hinzugekommene Positionen aufnehmen.
  for (const zeile of zeilen) {
    const { data, error } = await supabase
      .from('dta_wiedervorlage')
      .insert(zeile)
      .select('id, betrag_offen_cent')
      .single()

    if (error) {
      // 23505 = unique_violation → Position ist bereits in der Queue.
      if (error.code === '23505') { uebersprungen++; continue }
      throw new Error(`Wiedervorlage konnte nicht angelegt werden: ${error.message}`)
    }
    if (data) {
      erstellt++
      eintragIds.push(data.id)
      offenerBetragCent += data.betrag_offen_cent ?? 0
    }
  }

  if (erstellt > 0) {
    await logBillingAction(supabase, {
      entityType: 'dta_wiedervorlage',
      organizationId,
      entityId: ruecklaeuferId,
      action: 'wiedervorlage_eingereiht',
      newState: { erstellt, uebersprungen, offener_betrag_cent: offenerBetragCent, faellig_am: faellig },
      actorId,
    })
  }

  return { erstellt, uebersprungen, offenerBetragCent, eintragIds }
}

// ── Queue lesen ─────────────────────────────────────────────────

export interface QueueFilter {
  status?: WiedervorlageStatus[]
  kategorie?: FehlerKategorie
  ruecklaeuferId?: string
  /** Nur überfällige Einträge. */
  nurUeberfaellig?: boolean
  limit?: number
}

export async function ladeWiedervorlage(
  supabase: SupabaseClient,
  organizationId: string,
  filter: QueueFilter = {},
): Promise<WiedervorlageEintrag[]> {
  let query = supabase
    .from('dta_wiedervorlage')
    .select('*')
    .eq('organization_id', organizationId)
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .limit(Math.min(filter.limit ?? 200, 500))

  if (filter.status?.length) query = query.in('status', filter.status)
  if (filter.kategorie) query = query.eq('kategorie', filter.kategorie)
  if (filter.ruecklaeuferId) query = query.eq('ruecklaeufer_id', filter.ruecklaeuferId)
  if (filter.nurUeberfaellig) {
    query = query
      .lt('faellig_am', new Date().toISOString().slice(0, 10))
      .in('status', ['offen', 'in_korrektur', 'korrigiert'])
  }

  const { data } = await query

  return (data ?? []).map(z => ({
    id: z.id,
    ruecklaeuferId: z.ruecklaeufer_id,
    ruecklaeuferPositionId: z.ruecklaeufer_position_id,
    originalLaufId: z.original_lauf_id,
    invoiceId: z.invoice_id,
    clientId: z.client_id,
    kategorie: z.kategorie,
    fehlerCode: z.fehler_code,
    fehlerText: z.fehler_text,
    status: z.status,
    betragAngefordertCent: z.betrag_angefordert_cent,
    betragAnerkanntCent: z.betrag_anerkannt_cent,
    betragOffenCent: z.betrag_offen_cent ?? 0,
    korrekturNotiz: z.korrektur_notiz,
    korrekturDaten: z.korrektur_daten ?? {},
    korrekturLaufId: z.korrektur_lauf_id,
    faelligAm: z.faellig_am,
    eingereichtAm: z.eingereicht_am,
    createdAt: z.created_at,
    massnahme: FEHLER_KATEGORIEN[z.kategorie as FehlerKategorie]?.massnahme ?? '',
  }))
}

export interface QueueUebersicht {
  gesamt: number
  proStatus: Record<WiedervorlageStatus, number>
  proKategorie: Record<FehlerKategorie, number>
  offenerBetragCent: number
  ueberfaellig: number
}

export async function wiedervorlageUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<QueueUebersicht> {
  const { data } = await supabase
    .from('dta_wiedervorlage')
    .select('status, kategorie, betrag_offen_cent, faellig_am')
    .eq('organization_id', organizationId)

  const heute = new Date().toISOString().slice(0, 10)
  const proStatus = {
    offen: 0, in_korrektur: 0, korrigiert: 0, eingereicht: 0, erledigt: 0, verworfen: 0,
  } as Record<WiedervorlageStatus, number>
  const proKategorie = {
    verarbeitungsfehler: 0, datenfehler: 0, tarifabweichung: 0,
    versicherter_unbekannt: 0, unbekannt: 0,
  } as Record<FehlerKategorie, number>

  let offenerBetragCent = 0
  let ueberfaellig = 0

  for (const z of data ?? []) {
    proStatus[z.status as WiedervorlageStatus] = (proStatus[z.status as WiedervorlageStatus] ?? 0) + 1
    proKategorie[z.kategorie as FehlerKategorie] = (proKategorie[z.kategorie as FehlerKategorie] ?? 0) + 1

    const nochOffen = ['offen', 'in_korrektur', 'korrigiert'].includes(z.status)
    if (nochOffen) {
      offenerBetragCent += z.betrag_offen_cent ?? 0
      if (z.faellig_am && z.faellig_am < heute) ueberfaellig++
    }
  }

  return {
    gesamt: (data ?? []).length,
    proStatus,
    proKategorie,
    offenerBetragCent,
    ueberfaellig,
  }
}

// ── Statuswechsel ───────────────────────────────────────────────

/**
 * Erlaubte Statuswechsel.
 *
 * 'erledigt' ist ausschliesslich aus 'eingereicht' erreichbar: ein Eintrag
 * gilt erst als erledigt, wenn tatsächlich etwas bei der Kasse war. Ohne diese
 * Einschränkung liesse sich ein abgelehnter Betrag mit einem Klick aus der
 * Liste nehmen, ohne dass je Geld geflossen ist.
 *
 * 'erledigt' und 'verworfen' sind Endzustände — beide bewusst ohne Rückweg.
 */
export const ERLAUBTE_UEBERGAENGE: Record<WiedervorlageStatus, WiedervorlageStatus[]> = {
  offen:        ['in_korrektur', 'korrigiert', 'verworfen'],
  in_korrektur: ['korrigiert', 'offen', 'verworfen'],
  korrigiert:   ['eingereicht', 'in_korrektur', 'verworfen'],
  eingereicht:  ['erledigt', 'offen'],   // 'offen' = erneut abgelehnt
  erledigt:     [],
  verworfen:    [],
}

/**
 * Prüft einen Statuswechsel. Gibt den Fehlertext zurück, oder null bei ok.
 *
 * Als reine Funktion herausgezogen, damit die Regel ohne Datenbank prüfbar ist
 * — die Statusmaschine ist der Teil, an dem ein Fehler still Geld kostet.
 */
export function pruefeUebergang(
  alt: WiedervorlageStatus,
  neu: WiedervorlageStatus,
  verworfenGrund?: string,
): string | null {
  if (alt !== neu && !ERLAUBTE_UEBERGAENGE[alt].includes(neu)) {
    return `Statuswechsel "${alt}" → "${neu}" ist nicht vorgesehen. `
      + `Erlaubt ab "${alt}": ${ERLAUBTE_UEBERGAENGE[alt].join(', ') || 'kein weiterer Wechsel'}`
  }
  if (neu === 'verworfen' && !verworfenGrund?.trim()) {
    return 'Eine Forderung wird nicht ohne Begründung fallengelassen — verworfenGrund ist Pflicht.'
  }
  return null
}

export interface KorrekturEingabe {
  eintragId: string
  organizationId: string
  actorId: string
  neuerStatus: WiedervorlageStatus
  korrekturNotiz?: string
  /** Strukturierte Angabe, was geändert wurde (Feld → alt/neu). */
  korrekturDaten?: Record<string, unknown>
  verworfenGrund?: string
}

/**
 * Setzt einen Eintrag auf einen neuen Status.
 *
 * Übergänge sind eingeschränkt: ohne Tabelle liesse sich ein Eintrag direkt von
 * 'offen' auf 'erledigt' setzen, ohne dass je etwas eingereicht wurde — der
 * Betrag wäre aus der Liste verschwunden, ohne dass Geld geflossen ist.
 */
export async function aktualisiereWiedervorlage(
  supabase: SupabaseClient,
  eingabe: KorrekturEingabe,
): Promise<WiedervorlageEintrag> {
  const { data: vorher } = await supabase
    .from('dta_wiedervorlage')
    .select('id, status, korrektur_daten')
    .eq('id', eingabe.eintragId)
    .eq('organization_id', eingabe.organizationId)
    .maybeSingle()

  if (!vorher) throw new Error('Wiedervorlage-Eintrag nicht gefunden oder gehört zu einer anderen Organisation')

  const alt = vorher.status as WiedervorlageStatus
  const problem = pruefeUebergang(alt, eingabe.neuerStatus, eingabe.verworfenGrund)
  if (problem) throw new Error(problem)

  const { data: aktualisiert, error } = await supabase
    .from('dta_wiedervorlage')
    .update({
      status: eingabe.neuerStatus,
      korrektur_notiz: eingabe.korrekturNotiz ?? undefined,
      korrektur_daten: eingabe.korrekturDaten
        ? { ...(vorher.korrektur_daten ?? {}), ...eingabe.korrekturDaten }
        : undefined,
      verworfen_grund: eingabe.verworfenGrund ?? undefined,
      bearbeitet_von: eingabe.actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .eq('id', eingabe.eintragId)
    .eq('organization_id', eingabe.organizationId)
    .select('*')
    .single()

  if (error || !aktualisiert) {
    throw new Error(`Wiedervorlage konnte nicht aktualisiert werden: ${error?.message}`)
  }

  await logBillingAction(supabase, {
    entityType: 'dta_wiedervorlage',
    organizationId: eingabe.organizationId,
    entityId: eingabe.eintragId,
    action: 'wiedervorlage_status',
    previousState: { status: alt },
    newState: {
      status: eingabe.neuerStatus,
      notiz: eingabe.korrekturNotiz ?? null,
      grund: eingabe.verworfenGrund ?? null,
    },
    actorId: eingabe.actorId,
  })

  return {
    id: aktualisiert.id,
    ruecklaeuferId: aktualisiert.ruecklaeufer_id,
    ruecklaeuferPositionId: aktualisiert.ruecklaeufer_position_id,
    originalLaufId: aktualisiert.original_lauf_id,
    invoiceId: aktualisiert.invoice_id,
    clientId: aktualisiert.client_id,
    kategorie: aktualisiert.kategorie,
    fehlerCode: aktualisiert.fehler_code,
    fehlerText: aktualisiert.fehler_text,
    status: aktualisiert.status,
    betragAngefordertCent: aktualisiert.betrag_angefordert_cent,
    betragAnerkanntCent: aktualisiert.betrag_anerkannt_cent,
    betragOffenCent: aktualisiert.betrag_offen_cent ?? 0,
    korrekturNotiz: aktualisiert.korrektur_notiz,
    korrekturDaten: aktualisiert.korrektur_daten ?? {},
    korrekturLaufId: aktualisiert.korrektur_lauf_id,
    faelligAm: aktualisiert.faellig_am,
    eingereichtAm: aktualisiert.eingereicht_am,
    createdAt: aktualisiert.created_at,
    massnahme: FEHLER_KATEGORIEN[aktualisiert.kategorie as FehlerKategorie]?.massnahme ?? '',
  }
}

// ── Wiedereinreichung ───────────────────────────────────────────

export interface WiedereinreichungErgebnis {
  korrekturId: string
  korrekturLaufId: string | null
  eintraege: number
  betragCent: number
  hinweis: string | null
}

/**
 * Reicht korrigierte Einträge eines Original-Laufs erneut ein.
 *
 * Nur Einträge im Status 'korrigiert' kommen mit: 'offen' heisst, dass noch
 * niemand geprüft hat, was falsch war — eine unveränderte Wiedereinreichung
 * würde von der Kasse identisch abgelehnt und kostet nur eine Frist.
 *
 * Die eigentliche Korrekturabrechnung entsteht über den bestehenden Weg
 * (`erstelleKorrekturlauf` → `fuehreKorrekturAus`); dieses Modul hängt nur die
 * Queue-Einträge daran und schreibt das Ergebnis zurück.
 */
export async function reicheKorrigierteEin(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    originalLaufId: string
    actorId: string
    korrekturGrund?: string
  },
): Promise<WiedereinreichungErgebnis> {
  const { organizationId, originalLaufId, actorId } = params

  const { data: eintraege } = await supabase
    .from('dta_wiedervorlage')
    .select('id, ruecklaeufer_id, betrag_offen_cent, kategorie')
    .eq('organization_id', organizationId)
    .eq('original_lauf_id', originalLaufId)
    .eq('status', 'korrigiert')

  if (!eintraege?.length) {
    throw new Error(
      'Keine korrigierten Einträge zu diesem Lauf. '
      + 'Einträge zuerst prüfen und auf "korrigiert" setzen — eine unveränderte '
      + 'Wiedereinreichung wird identisch abgelehnt.',
    )
  }

  const ruecklaeuferId = eintraege.find(e => e.ruecklaeufer_id)?.ruecklaeufer_id ?? undefined
  const betragCent = eintraege.reduce((s, e) => s + (e.betrag_offen_cent ?? 0), 0)

  const korrektur = await erstelleKorrekturlauf(supabase, {
    organizationId,
    originalLaufId,
    ruecklaeuferId,
    korrekturTyp: 'korrekturabrechnung',
    korrekturGrund: params.korrekturGrund
      ?? `Wiedereinreichung ${eintraege.length} korrigierte(r) Position(en) — `
        + `offener Betrag ${(betragCent / 100).toFixed(2)} €`,
    actorId,
  })

  let korrekturLaufId: string | null = null
  let hinweis: string | null = null
  try {
    const ausgefuehrt = await fuehreKorrekturAus(supabase, korrektur.korrekturId, actorId, organizationId)
    korrekturLaufId = ausgefuehrt.korrekturLaufId ?? null
  } catch (err) {
    // Der Korrekturlauf ist angelegt, seine Ausführung scheiterte (z. B. weil
    // der Pre-Flight etwas findet). Das ist kein Grund, die Queue-Einträge
    // unangetastet zu lassen — der Vorgang existiert und muss sichtbar sein.
    hinweis = `Korrekturlauf angelegt, Ausführung offen: ${(err as Error).message}`
  }

  await supabase
    .from('dta_wiedervorlage')
    .update({
      status: 'eingereicht',
      korrektur_lauf_id: korrekturLaufId,
      eingereicht_am: new Date().toISOString(),
      bearbeitet_von: actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .in('id', eintraege.map(e => e.id))
    .eq('organization_id', organizationId)

  await logBillingAction(supabase, {
    entityType: 'dta_wiedervorlage',
    organizationId,
    entityId: korrektur.korrekturId,
    action: 'wiedervorlage_eingereicht',
    newState: {
      original_lauf_id: originalLaufId,
      korrektur_lauf_id: korrekturLaufId,
      eintraege: eintraege.length,
      betrag_cent: betragCent,
      hinweis,
    },
    actorId,
  })

  return {
    korrekturId: korrektur.korrekturId,
    korrekturLaufId,
    eintraege: eintraege.length,
    betragCent,
    hinweis,
  }
}
