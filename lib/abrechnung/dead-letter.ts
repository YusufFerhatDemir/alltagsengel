/**
 * Dead-Letter-Queue — was endgültig nicht zustellbar war.
 *
 * DAS PROBLEM, DAS SIE LÖST
 * Ein gescheiterter Versand hinterliess bisher genau zwei Spuren: den
 * Auftragsstatus 'technischer_fehler' und eine Zeile im Fehlerprotokoll. Beide
 * sind richtig, aber beide beantworten nicht die Frage, auf die es ankommt —
 * "liegt hier gerade Geld, das niemand mehr anfasst?". Ein Auftrag in
 * 'technischer_fehler' sieht aus wie ein Auftrag unter vielen; er hat keinen
 * Bearbeiter, keine Frist und keinen Abschluss. Eine Abrechnung, die auf diese
 * Weise liegenbleibt, fällt frühestens dann auf, wenn die Kasse eine fehlende
 * Lieferung anmahnt — oder nie.
 *
 * WAS EIN EINTRAG BEDEUTET
 * "Die Automatik ist am Ende, ein Mensch muss entscheiden." Nicht mehr und
 * nicht weniger. Ein Eintrag entsteht in genau zwei Fällen:
 *
 *   versuche_erschoepft  — dreimal probiert, dreimal ein Netzfehler
 *   nicht_wiederholbar   — der Abbruch geschah nach dem Upload der
 *                          Auftragsdatei, oder das Fehlerbild ist keins, das
 *                          sich durch Warten löst
 *
 * KEINE AUTOMATISCHE WIEDERVORLAGE
 * `zurueckInDieWarteschlange()` setzt den Auftrag zurück, aber sie sendet
 * nicht. Wer den Eintrag wiedervorlegt, hat die Ursache gesehen und startet
 * den Versand bewusst neu — sonst wäre die Queue nur eine langsamere
 * Wiederholschleife.
 *
 * 'verworfen' BRAUCHT EINE BEGRÜNDUNG
 * Ein Eintrag verlässt die Liste entweder, weil zugestellt wurde, oder weil
 * jemand ausdrücklich entschieden hat, die Forderung fallenzulassen. Der
 * Datenbank-Constraint erzwingt den Grund; die Statusmaschine hier erzwingt,
 * dass 'erledigt' nicht aus dem Nichts erreichbar ist.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import type { VersandKanal } from './versand-protokoll'
import type { TransportPhase } from './retry'

export type DeadLetterGrund =
  | 'versuche_erschoepft'
  | 'nicht_wiederholbar'
  | 'dauerhafter_fehler'
  | 'manuell_eingestellt'

export type DeadLetterStatus =
  | 'offen' | 'in_analyse' | 'wiedervorgelegt' | 'erledigt' | 'verworfen'

export const DEAD_LETTER_GRUND_TEXT: Record<DeadLetterGrund, string> = {
  versuche_erschoepft: 'Alle Wiederholversuche gescheitert',
  nicht_wiederholbar: 'Automatische Wiederholung wäre nicht folgenlos',
  dauerhafter_fehler: 'Fehlerbild löst sich nicht durch Wiederholen',
  manuell_eingestellt: 'Von Hand eingestellt',
}

export interface DeadLetterEingabe {
  organizationId: string
  kanal: VersandKanal
  grund: DeadLetterGrund
  actorId: string
  laufId?: string | null
  dakotaAuftragId?: string | null
  externeReferenz?: string | null
  versandProtokollId?: string | null
  fehlerCode?: string | null
  fehlerMeldung?: string | null
  letztePhase?: TransportPhase | null
  versuche?: number
  ersterVersuchAm?: string | null
  letzterVersuchAm?: string | null
  dateiName?: string | null
  dateiHash?: string | null
  empfaengerIk?: string | null
  notiz?: string | null
}

export interface DeadLetterEintrag {
  id: string
  kanal: VersandKanal
  grund: DeadLetterGrund
  grundText: string
  status: DeadLetterStatus
  laufId: string | null
  dakotaAuftragId: string | null
  externeReferenz: string | null
  fehlerCode: string | null
  fehlerMeldung: string | null
  letztePhase: string | null
  versuche: number
  ersterVersuchAm: string | null
  letzterVersuchAm: string | null
  dateiName: string | null
  dateiHash: string | null
  empfaengerIk: string | null
  notiz: string | null
  verworfenGrund: string | null
  wiedervorgelegtAm: string | null
  bearbeitetVon: string | null
  bearbeitetAm: string | null
  createdAt: string
}

function zuEintrag(z: Record<string, any>): DeadLetterEintrag {
  return {
    id: z.id,
    kanal: z.kanal,
    grund: z.grund,
    grundText: DEAD_LETTER_GRUND_TEXT[z.grund as DeadLetterGrund] ?? z.grund,
    status: z.status,
    laufId: z.lauf_id ?? null,
    dakotaAuftragId: z.dakota_auftrag_id ?? null,
    externeReferenz: z.externe_referenz ?? null,
    fehlerCode: z.fehler_code ?? null,
    fehlerMeldung: z.fehler_meldung ?? null,
    letztePhase: z.letzte_phase ?? null,
    versuche: z.versuche ?? 0,
    ersterVersuchAm: z.erster_versuch_am ?? null,
    letzterVersuchAm: z.letzter_versuch_am ?? null,
    dateiName: z.datei_name ?? null,
    dateiHash: z.datei_hash ?? null,
    empfaengerIk: z.empfaenger_ik ?? null,
    notiz: z.notiz ?? null,
    verworfenGrund: z.verworfen_grund ?? null,
    wiedervorgelegtAm: z.wiedervorgelegt_am ?? null,
    bearbeitetVon: z.bearbeitet_von ?? null,
    bearbeitetAm: z.bearbeitet_am ?? null,
    createdAt: z.created_at,
  }
}

// ── Einstellen ──────────────────────────────────────────────────

/**
 * Stellt einen gescheiterten Versand in die Queue.
 *
 * Wirft NICHT: der Versand ist an dieser Stelle bereits gescheitert, und eine
 * Ausnahme beim Protokollieren würde den Aufrufer daran hindern, dem Benutzer
 * den eigentlichen Fehler zu zeigen.
 *
 * Existiert bereits ein offener Eintrag zu demselben Auftrag, wird er
 * fortgeschrieben statt verdoppelt — sonst zeigt die Liste dieselbe Datei
 * dreimal mit unterschiedlichen Zählerständen.
 */
export async function inDeadLetter(
  supabase: SupabaseClient,
  eingabe: DeadLetterEingabe,
): Promise<{ id: string | null; neu: boolean; fehler: string | null }> {
  const jetzt = new Date().toISOString()

  try {
    if (eingabe.dakotaAuftragId) {
      const { data: bestehend } = await supabase
        .from('dta_dead_letter')
        .select('id, versuche, erster_versuch_am')
        .eq('organization_id', eingabe.organizationId)
        .eq('dakota_auftrag_id', eingabe.dakotaAuftragId)
        .in('status', ['offen', 'in_analyse'])
        .limit(1)
        .maybeSingle()

      if (bestehend) {
        await supabase
          .from('dta_dead_letter')
          .update({
            grund: eingabe.grund,
            fehler_code: eingabe.fehlerCode ?? null,
            fehler_meldung: eingabe.fehlerMeldung ?? null,
            letzte_phase: eingabe.letztePhase ?? null,
            versuche: (bestehend.versuche ?? 0) + (eingabe.versuche ?? 1),
            letzter_versuch_am: eingabe.letzterVersuchAm ?? jetzt,
            versand_protokoll_id: eingabe.versandProtokollId ?? null,
          })
          .eq('id', bestehend.id)

        return { id: bestehend.id, neu: false, fehler: null }
      }
    }

    const { data, error } = await supabase
      .from('dta_dead_letter')
      .insert({
        organization_id: eingabe.organizationId,
        kanal: eingabe.kanal,
        grund: eingabe.grund,
        lauf_id: eingabe.laufId ?? null,
        dakota_auftrag_id: eingabe.dakotaAuftragId ?? null,
        externe_referenz: eingabe.externeReferenz ?? null,
        versand_protokoll_id: eingabe.versandProtokollId ?? null,
        fehler_code: eingabe.fehlerCode ?? null,
        fehler_meldung: eingabe.fehlerMeldung ?? null,
        letzte_phase: eingabe.letztePhase ?? null,
        versuche: eingabe.versuche ?? 0,
        erster_versuch_am: eingabe.ersterVersuchAm ?? jetzt,
        letzter_versuch_am: eingabe.letzterVersuchAm ?? jetzt,
        datei_name: eingabe.dateiName ?? null,
        datei_hash: eingabe.dateiHash ?? null,
        empfaenger_ik: eingabe.empfaengerIk ?? null,
        notiz: eingabe.notiz ?? null,
      })
      .select('id')
      .single()

    if (error) return { id: null, neu: false, fehler: error.message }

    try {
      await logBillingAction(supabase, {
        entityType: 'dta_dead_letter',
        organizationId: eingabe.organizationId,
        entityId: data.id,
        action: `dead_letter_${eingabe.grund}`,
        newState: {
          kanal: eingabe.kanal,
          grund: eingabe.grund,
          dakota_auftrag_id: eingabe.dakotaAuftragId ?? null,
          letzte_phase: eingabe.letztePhase ?? null,
          versuche: eingabe.versuche ?? 0,
          fehler_code: eingabe.fehlerCode ?? null,
        },
        actorId: eingabe.actorId,
      })
    } catch {
      // Zeile steht — sie ist der Nachweis.
    }

    return { id: data.id, neu: true, fehler: null }
  } catch (err) {
    return { id: null, neu: false, fehler: (err as Error).message }
  }
}

// ── Lesen ───────────────────────────────────────────────────────

export interface DeadLetterFilter {
  status?: DeadLetterStatus[]
  kanal?: VersandKanal
  limit?: number
}

export async function ladeDeadLetter(
  supabase: SupabaseClient,
  organizationId: string,
  filter: DeadLetterFilter = {},
): Promise<DeadLetterEintrag[]> {
  let query = supabase
    .from('dta_dead_letter')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 100, 500))

  if (filter.status?.length) query = query.in('status', filter.status)
  if (filter.kanal) query = query.eq('kanal', filter.kanal)

  const { data } = await query
  return (data ?? []).map(zuEintrag)
}

export interface DeadLetterUebersicht {
  gesamt: number
  offen: number
  proStatus: Record<DeadLetterStatus, number>
  proKanal: Record<string, number>
  aeltesterOffenerAm: string | null
}

export async function deadLetterUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<DeadLetterUebersicht> {
  const { data, error } = await supabase
    .from('dta_dead_letter')
    .select('status, kanal, created_at')
    .eq('organization_id', organizationId)

  // Eine Fehlerqueue, die bei Stoerung „0 offen" meldet, ist genau dann
  // stumm, wenn man sie braucht. „Nichts liegengeblieben" und „ich konnte
  // nicht nachsehen" duerfen hier nicht dieselbe Zahl ergeben.
  if (error) {
    throw new Error(`Dead-Letter-Einträge nicht lesbar: ${error.message}`)
  }

  const proStatus: Record<DeadLetterStatus, number> = {
    offen: 0, in_analyse: 0, wiedervorgelegt: 0, erledigt: 0, verworfen: 0,
  }
  const proKanal: Record<string, number> = {}
  let aeltesterOffenerAm: string | null = null

  for (const z of data ?? []) {
    proStatus[z.status as DeadLetterStatus] = (proStatus[z.status as DeadLetterStatus] ?? 0) + 1
    if (['offen', 'in_analyse'].includes(z.status)) {
      proKanal[z.kanal] = (proKanal[z.kanal] ?? 0) + 1
      if (!aeltesterOffenerAm || z.created_at < aeltesterOffenerAm) aeltesterOffenerAm = z.created_at
    }
  }

  return {
    gesamt: (data ?? []).length,
    offen: proStatus.offen + proStatus.in_analyse,
    proStatus,
    proKanal,
    aeltesterOffenerAm,
  }
}

// ── Statusmaschine ──────────────────────────────────────────────

/**
 * Erlaubte Statuswechsel.
 *
 * 'erledigt' ist nur aus 'wiedervorgelegt' erreichbar: erledigt ist ein
 * Eintrag erst, wenn erneut versendet wurde. Ohne diese Einschränkung liesse
 * sich eine nicht zugestellte Abrechnung mit einem Klick aus der Liste nehmen.
 *
 * 'erledigt' und 'verworfen' sind Endzustände.
 */
export const DEAD_LETTER_UEBERGAENGE: Record<DeadLetterStatus, DeadLetterStatus[]> = {
  offen:           ['in_analyse', 'wiedervorgelegt', 'verworfen'],
  in_analyse:      ['wiedervorgelegt', 'offen', 'verworfen'],
  wiedervorgelegt: ['erledigt', 'offen'],   // 'offen' = erneut gescheitert
  erledigt:        [],
  verworfen:       [],
}

/** Prüft einen Statuswechsel ohne Datenbank. Gibt den Fehlertext zurück, sonst null. */
export function pruefeDeadLetterUebergang(
  alt: DeadLetterStatus,
  neu: DeadLetterStatus,
  verworfenGrund?: string,
): string | null {
  if (alt !== neu && !DEAD_LETTER_UEBERGAENGE[alt].includes(neu)) {
    return `Statuswechsel "${alt}" → "${neu}" ist nicht vorgesehen. `
      + `Erlaubt ab "${alt}": ${DEAD_LETTER_UEBERGAENGE[alt].join(', ') || 'kein weiterer Wechsel'}`
  }
  if (neu === 'verworfen' && !verworfenGrund?.trim()) {
    return 'Eine nicht zugestellte Abrechnung wird nicht ohne Begründung fallengelassen — '
      + 'verworfenGrund ist Pflicht.'
  }
  return null
}

export interface DeadLetterAenderung {
  eintragId: string
  organizationId: string
  actorId: string
  neuerStatus: DeadLetterStatus
  notiz?: string
  verworfenGrund?: string
}

export async function aktualisiereDeadLetter(
  supabase: SupabaseClient,
  aenderung: DeadLetterAenderung,
): Promise<DeadLetterEintrag> {
  const { data: vorher } = await supabase
    .from('dta_dead_letter')
    .select('id, status')
    .eq('id', aenderung.eintragId)
    .eq('organization_id', aenderung.organizationId)
    .maybeSingle()

  if (!vorher) {
    throw new Error('Dead-Letter-Eintrag nicht gefunden oder gehört zu einer anderen Organisation')
  }

  const alt = vorher.status as DeadLetterStatus
  const problem = pruefeDeadLetterUebergang(alt, aenderung.neuerStatus, aenderung.verworfenGrund)
  if (problem) throw new Error(problem)

  const jetzt = new Date().toISOString()
  const { data: aktualisiert, error } = await supabase
    .from('dta_dead_letter')
    .update({
      status: aenderung.neuerStatus,
      notiz: aenderung.notiz ?? undefined,
      verworfen_grund: aenderung.verworfenGrund ?? undefined,
      wiedervorgelegt_am: aenderung.neuerStatus === 'wiedervorgelegt' ? jetzt : undefined,
      bearbeitet_von: aenderung.actorId,
      bearbeitet_am: jetzt,
    })
    .eq('id', aenderung.eintragId)
    .eq('organization_id', aenderung.organizationId)
    .select('*')
    .single()

  if (error || !aktualisiert) {
    throw new Error(`Dead-Letter-Eintrag konnte nicht aktualisiert werden: ${error?.message}`)
  }

  await logBillingAction(supabase, {
    entityType: 'dta_dead_letter',
    organizationId: aenderung.organizationId,
    entityId: aenderung.eintragId,
    action: 'dead_letter_status',
    previousState: { status: alt },
    newState: { status: aenderung.neuerStatus, notiz: aenderung.notiz ?? null },
    reason: aenderung.verworfenGrund ?? undefined,
    actorId: aenderung.actorId,
  })

  return zuEintrag(aktualisiert)
}

/**
 * Gibt den zugehörigen DAKOTA-Auftrag wieder für den Versand frei.
 *
 * Setzt NICHT selbst einen Versand in Gang: die Ursache stand in der Queue,
 * weil die Automatik sie nicht lösen konnte. Wer wiedervorlegt, hat sie
 * gesehen und startet den Versand danach bewusst.
 *
 * Aufträge, die bereits übermittelt oder quittiert sind, werden NICHT
 * zurückgesetzt — sonst entstünde aus einem Anzeigefehler eine doppelte
 * Lieferung.
 */
export async function zurueckInDieWarteschlange(
  supabase: SupabaseClient,
  params: { eintragId: string; organizationId: string; actorId: string; notiz?: string },
): Promise<{ eintrag: DeadLetterEintrag; auftragZurueckgesetzt: boolean; hinweis: string }> {
  const { data: eintrag } = await supabase
    .from('dta_dead_letter')
    .select('id, dakota_auftrag_id, status')
    .eq('id', params.eintragId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()

  if (!eintrag) {
    throw new Error('Dead-Letter-Eintrag nicht gefunden oder gehört zu einer anderen Organisation')
  }

  let zurueckgesetzt = false
  let hinweis = 'Kein DAKOTA-Auftrag verknüpft — der Versand muss von Hand angestossen werden.'

  if (eintrag.dakota_auftrag_id) {
    const { data: auftrag } = await supabase
      .from('dta_dakota_auftraege')
      .select('id, status')
      .eq('id', eintrag.dakota_auftrag_id)
      .eq('organization_id', params.organizationId)
      .maybeSingle()

    if (!auftrag) {
      hinweis = 'Verknüpfter DAKOTA-Auftrag nicht mehr vorhanden.'
    } else if (['uebermittelt', 'quittiert'].includes(auftrag.status)) {
      hinweis = `Auftrag steht auf "${auftrag.status}" — er ist bereits bei der Annahmestelle. `
        + 'Es wurde nichts zurückgesetzt; für eine erneute Lieferung einen Korrekturlauf anlegen.'
    } else {
      await supabase
        .from('dta_dakota_auftraege')
        .update({
          status: 'bereit_zur_uebermittlung',
          fehler_code: null,
          fehler_meldung: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', auftrag.id)
        .eq('organization_id', params.organizationId)

      zurueckgesetzt = true
      hinweis = 'Auftrag steht wieder auf "bereit_zur_uebermittlung". '
        + 'Der Versand wird nicht automatisch gestartet — bewusst erneut auslösen.'
    }
  }

  const aktualisiert = await aktualisiereDeadLetter(supabase, {
    eintragId: params.eintragId,
    organizationId: params.organizationId,
    actorId: params.actorId,
    neuerStatus: 'wiedervorgelegt',
    notiz: params.notiz,
  })

  return { eintrag: aktualisiert, auftragZurueckgesetzt: zurueckgesetzt, hinweis }
}
