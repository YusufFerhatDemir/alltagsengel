/**
 * Betriebsmodus — der Umschalter zwischen Testbetrieb und Echtabrechnung.
 *
 * DAS PROBLEM
 * Im EDIFACT-Kopfsegment (UNB) steht ein Dateiindikator: '0' = Testdatei,
 * '1' = Erprobung, '2' = Echtdatei. Die Annahmestelle verarbeitet eine '0'
 * folgenlos und eine '2' als Forderung. Bis hierher stand die '2' hartkodiert
 * im Export (kassenabrechnung-engine.ts) — jede jemals erzeugte Datei
 * behauptete Echtabrechnung, auch die allererste, vor jeder abgesprochenen
 * Testübertragung. Solange das Gate zu ist, ging nichts hinaus; in dem Moment,
 * in dem es aufgeht, wäre der erste Versuch sofort echt gewesen.
 *
 * DIE REGEL
 * Ohne Eintrag gilt Testbetrieb. Nicht "unbekannt", nicht "wie zuletzt" —
 * Test. Eine fehlende Zeile, ein Lesefehler, eine unbekannte Organisation:
 * alles endet bei '0'. Der teurere Fehler ist die versehentliche Echtdatei.
 *
 * DREI SPERREN VOR DER ECHTDATEI, ALLE GLEICHZEITIG NÖTIG:
 *   1. Env-Gate offen        — ITSG_ZERTIFIZIERT / SGB_V_302_FREIGABE /
 *                              KIM_AKTIV. Behauptet, dass ein Dritter etwas
 *                              erteilt hat.
 *   2. Testübertragung belegt — Datum + Referenz der Annahmestelle. Behauptet,
 *                              dass die Gegenstelle die Datei angenommen hat.
 *   3. Bestätigungswort       — die umschaltende Person tippt ECHTBETRIEB.
 *                              Verhindert den Klick aus Versehen.
 *
 * Der Rückweg nach 'test' ist immer offen und braucht nur eine Begründung:
 * zurück in den Testbetrieb ist die sichere Richtung, und eine Sperre auf dem
 * Rückweg würde im Zweifel dazu führen, dass jemand im Echtbetrieb bleibt.
 *
 * WAS DER MODUS NICHT ERSETZT
 * Er ist kein Ersatz für das Gate. Steht ein Kanal auf 'produktion' und das
 * Gate ist zu, geht weiterhin nichts hinaus — und `dateiindikatorFuer()`
 * liefert trotzdem '0'. Ein Kanal, der nicht senden darf, erzeugt keine
 * Echtdateien, die später versehentlich hochgeladen werden könnten.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import {
  EXTERNE_FREIGABEN, freigabeUebersicht, istFreigegeben,
  type ExterneFreigabeId,
} from './externe-freigaben'

/** Kanäle mit eigenem Betriebsmodus. 'manuell' hat keinen — dort entscheidet der Mensch. */
export type BetriebsKanal = 'sftp_105' | 'sftp_302' | 'kim'

export type Betriebsmodus = 'test' | 'produktion'

/** Dateiindikator im UNB-Segment je Modus. '1' (Erprobung) wird nicht verwendet. */
export const DATEIINDIKATOR: Record<Betriebsmodus, '0' | '2'> = {
  test: '0',
  produktion: '2',
}

/** Wort, das beim Umschalten auf Echtbetrieb eingetippt werden muss. */
export const BESTAETIGUNG_ECHTBETRIEB = 'ECHTBETRIEB'

/** Welches Env-Gate den jeweiligen Kanal freigibt. */
export const KANAL_FREIGABE: Record<BetriebsKanal, ExterneFreigabeId> = {
  sftp_105: 'itsg_zertifiziert',
  sftp_302: 'sgb_v_302_freigabe',
  kim: 'kim_aktiv',
}

export const KANAL_LABEL: Record<BetriebsKanal, string> = {
  sftp_105: '§ 105 SGB XI — Pflegeabrechnung (SFTP)',
  sftp_302: '§ 302 SGB V — häusliche Krankenpflege (SFTP)',
  kim: 'KIM — Telematikinfrastruktur',
}

export const BETRIEBS_KANAELE: BetriebsKanal[] = ['sftp_105', 'sftp_302', 'kim']

export interface BetriebsmodusEintrag {
  kanal: BetriebsKanal
  modus: Betriebsmodus
  dateiindikator: '0' | '2'
  /** true, wenn der Modus aus einer Zeile stammt und nicht aus dem Standard. */
  hinterlegt: boolean
  testuebertragungAm: string | null
  testuebertragungReferenz: string | null
  testuebertragungStelle: string | null
  begruendung: string | null
  umgestelltAm: string | null
  umgestelltVon: string | null
  /** Steht das zugehörige Env-Gate offen? */
  gateOffen: boolean
  envVariable: string
  /**
   * Was tatsächlich in die Datei geschrieben wird. Weicht vom `dateiindikator`
   * des Modus ab, wenn das Gate zu ist — dann bleibt es bei '0'.
   */
  effektiverDateiindikator: '0' | '2'
  hinweis: string | null
}

// ── Lesen ───────────────────────────────────────────────────────

function standard(kanal: BetriebsKanal, grund: string): BetriebsmodusEintrag {
  const freigabe = KANAL_FREIGABE[kanal]
  return {
    kanal,
    modus: 'test',
    dateiindikator: '0',
    hinterlegt: false,
    testuebertragungAm: null,
    testuebertragungReferenz: null,
    testuebertragungStelle: null,
    begruendung: null,
    umgestelltAm: null,
    umgestelltVon: null,
    gateOffen: istFreigegeben(freigabe),
    envVariable: EXTERNE_FREIGABEN[freigabe].envVariable,
    effektiverDateiindikator: '0',
    hinweis: grund,
  }
}

/**
 * Liest den Betriebsmodus eines Kanals.
 *
 * Wirft nie: ein Lesefehler darf keinen Export abbrechen, aber er darf auch
 * nicht zu einer Echtdatei führen. Beides zusammen geht nur, wenn der
 * Fehlerfall 'test' ist.
 */
export async function ladeBetriebsmodus(
  supabase: SupabaseClient,
  organizationId: string,
  kanal: BetriebsKanal,
): Promise<BetriebsmodusEintrag> {
  const freigabe = KANAL_FREIGABE[kanal]
  const gateOffen = istFreigegeben(freigabe)

  let zeile: Record<string, any> | null = null
  try {
    const { data } = await supabase
      .from('abrechnung_betriebsmodus')
      .select('kanal, modus, testuebertragung_am, testuebertragung_referenz, testuebertragung_stelle, begruendung, umgestellt_am, umgestellt_von')
      .eq('organization_id', organizationId)
      .eq('kanal', kanal)
      .maybeSingle()
    zeile = data ?? null
  } catch {
    return standard(kanal, 'Betriebsmodus nicht lesbar — es gilt Testbetrieb')
  }

  if (!zeile) {
    return standard(kanal, 'Kein Betriebsmodus hinterlegt — es gilt Testbetrieb (Dateiindikator 0)')
  }

  const modus: Betriebsmodus = zeile.modus === 'produktion' ? 'produktion' : 'test'
  const effektiv: '0' | '2' = modus === 'produktion' && gateOffen ? '2' : '0'

  return {
    kanal,
    modus,
    dateiindikator: DATEIINDIKATOR[modus],
    hinterlegt: true,
    testuebertragungAm: zeile.testuebertragung_am ?? null,
    testuebertragungReferenz: zeile.testuebertragung_referenz ?? null,
    testuebertragungStelle: zeile.testuebertragung_stelle ?? null,
    begruendung: zeile.begruendung ?? null,
    umgestelltAm: zeile.umgestellt_am ?? null,
    umgestelltVon: zeile.umgestellt_von ?? null,
    gateOffen,
    envVariable: EXTERNE_FREIGABEN[freigabe].envVariable,
    effektiverDateiindikator: effektiv,
    hinweis: modus === 'produktion' && !gateOffen
      ? `Echtbetrieb eingestellt, aber ${EXTERNE_FREIGABEN[freigabe].envVariable} ist zu — `
        + 'es werden weiterhin Testdateien (Indikator 0) erzeugt und nichts übertragen'
      : null,
  }
}

/**
 * Der Dateiindikator, der in das UNB-Segment gehört.
 *
 * Einzige Stelle, an der ein '2' entstehen kann. Jeder Generatoraufruf holt
 * ihn hier — ein hartkodiertes '2' im Export war der Zustand, den dieses Modul
 * ablöst.
 */
export async function dateiindikatorFuer(
  supabase: SupabaseClient,
  organizationId: string,
  kanal: BetriebsKanal,
): Promise<'0' | '2'> {
  const eintrag = await ladeBetriebsmodus(supabase, organizationId, kanal)
  return eintrag.effektiverDateiindikator
}

/** Alle Kanäle auf einen Blick — für Betriebsansicht und Health-Check. */
export async function alleBetriebsmodi(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<BetriebsmodusEintrag[]> {
  return Promise.all(
    BETRIEBS_KANAELE.map(k => ladeBetriebsmodus(supabase, organizationId, k)),
  )
}

// ── Umschalten ──────────────────────────────────────────────────

export interface UmschaltEingabe {
  organizationId: string
  kanal: BetriebsKanal
  actorId: string
  zielModus: Betriebsmodus
  begruendung: string
  /** Pflicht beim Wechsel auf 'produktion': das Wort ECHTBETRIEB. */
  bestaetigung?: string
  /** Pflicht beim Wechsel auf 'produktion': Datum der bestandenen Testübertragung. */
  testuebertragungAm?: string
  /** Pflicht beim Wechsel auf 'produktion': Beleg der Annahmestelle. */
  testuebertragungReferenz?: string
  testuebertragungStelle?: string
}

/**
 * Prüft eine Umschaltung, ohne Datenbank.
 *
 * Als reine Funktion herausgezogen, damit die Regel testbar ist, ohne eine
 * Verbindung aufzubauen: das ist die Stelle, an der ein Fehler eine echte
 * Forderung bei einer Kasse auslöst.
 *
 * @returns Fehlertext, oder null wenn zulässig.
 */
export function pruefeUmschaltung(
  eingabe: Pick<UmschaltEingabe, 'kanal' | 'zielModus' | 'begruendung' | 'bestaetigung' | 'testuebertragungAm' | 'testuebertragungReferenz'>,
  gateOffen: boolean,
): string | null {
  const envName = EXTERNE_FREIGABEN[KANAL_FREIGABE[eingabe.kanal]].envVariable

  if (!eingabe.begruendung?.trim()) {
    return 'Begründung ist Pflicht — ein Moduswechsel ohne nachvollziehbaren Anlass '
      + 'ist später nicht mehr rekonstruierbar.'
  }

  // Rückweg in den Testbetrieb: immer erlaubt.
  if (eingabe.zielModus === 'test') return null

  if (!gateOffen) {
    return `Echtbetrieb nicht möglich: ${envName} ist nicht auf "true" gesetzt. `
      + 'Der Kanal darf nichts übertragen, also darf er auch keine Echtdateien erzeugen. '
      + 'Zuerst die externe Freigabe beschaffen und die Env-Variable setzen.'
  }

  if (eingabe.bestaetigung?.trim() !== BESTAETIGUNG_ECHTBETRIEB) {
    return `Bestätigung fehlt: zum Umschalten auf Echtbetrieb muss "${BESTAETIGUNG_ECHTBETRIEB}" `
      + 'eingegeben werden. Ab diesem Zeitpunkt erzeugte Dateien lösen bei der Kasse '
      + 'eine Forderung aus.'
  }

  if (!eingabe.testuebertragungAm || !/^\d{4}-\d{2}-\d{2}$/.test(eingabe.testuebertragungAm)) {
    return 'Datum der bestandenen Testübertragung ist Pflicht (Format JJJJ-MM-TT). '
      + 'Ohne eine von der Annahmestelle bestätigte Testdatei (Indikator 0) gibt es '
      + 'keinen Beleg, dass das Format angenommen wird.'
  }

  if (!eingabe.testuebertragungReferenz?.trim()) {
    return 'Beleg der Testübertragung ist Pflicht — Ticketnummer, Protokoll- oder '
      + 'Mailreferenz der Annahmestelle. Ein Datum ohne Beleg ist eine Behauptung.'
  }

  return null
}

export interface UmschaltErgebnis {
  kanal: BetriebsKanal
  modusVorher: Betriebsmodus
  modusNachher: Betriebsmodus
  effektiverDateiindikator: '0' | '2'
  hinweis: string | null
}

/**
 * Schaltet einen Kanal um und schreibt Verlauf und Audit-Eintrag.
 *
 * Reihenfolge: prüfen → Zeile setzen → Historie → Audit. Die Historie wird auch
 * dann geschrieben, wenn der Audit-Eintrag scheitert — der Verlauf des
 * Umschaltens ist der Nachweis und darf nicht am Constraint einer anderen
 * Tabelle hängen.
 */
export async function setzeBetriebsmodus(
  supabase: SupabaseClient,
  eingabe: UmschaltEingabe,
): Promise<UmschaltErgebnis> {
  const { organizationId, kanal, actorId, zielModus } = eingabe

  const vorher = await ladeBetriebsmodus(supabase, organizationId, kanal)

  const problem = pruefeUmschaltung(eingabe, vorher.gateOffen)
  if (problem) throw new Error(problem)

  const jetzt = new Date().toISOString()
  const zeile = {
    organization_id: organizationId,
    kanal,
    modus: zielModus,
    // Beim Rückweg auf 'test' den Nachweis behalten: er gilt weiter, und ohne
    // ihn müsste er beim nächsten Umschalten neu beschafft werden.
    testuebertragung_am: eingabe.testuebertragungAm ?? vorher.testuebertragungAm,
    testuebertragung_referenz: eingabe.testuebertragungReferenz ?? vorher.testuebertragungReferenz,
    testuebertragung_stelle: eingabe.testuebertragungStelle ?? vorher.testuebertragungStelle,
    begruendung: eingabe.begruendung.trim(),
    umgestellt_am: jetzt,
    umgestellt_von: actorId,
    updated_at: jetzt,
  }

  const { error } = await supabase
    .from('abrechnung_betriebsmodus')
    .upsert(zeile, { onConflict: 'organization_id,kanal' })

  if (error) {
    throw new Error(`Betriebsmodus konnte nicht gesetzt werden: ${error.message}`)
  }

  const uebersicht = freigabeUebersicht()
  await supabase.from('abrechnung_betriebsmodus_historie').insert({
    organization_id: organizationId,
    kanal,
    modus_vorher: vorher.hinterlegt ? vorher.modus : null,
    modus_nachher: zielModus,
    begruendung: eingabe.begruendung.trim(),
    testuebertragung_am: zeile.testuebertragung_am,
    testuebertragung_referenz: zeile.testuebertragung_referenz,
    freigabe_status: Object.fromEntries(uebersicht.freigaben.map(f => [f.id, f.freigegeben])),
    umgestellt_von: actorId,
  })

  try {
    await logBillingAction(supabase, {
      entityType: 'abrechnung_betriebsmodus',
      organizationId,
      entityId: kanal,
      action: `betriebsmodus_${zielModus}`,
      previousState: { modus: vorher.modus, hinterlegt: vorher.hinterlegt },
      newState: {
        modus: zielModus,
        kanal,
        testuebertragung_am: zeile.testuebertragung_am,
        testuebertragung_referenz: zeile.testuebertragung_referenz,
        gate_offen: vorher.gateOffen,
      },
      reason: eingabe.begruendung.trim(),
      actorId,
    })
  } catch {
    // Historie steht bereits — der Nachweis ist gesichert.
  }

  const nachher = await ladeBetriebsmodus(supabase, organizationId, kanal)

  return {
    kanal,
    modusVorher: vorher.modus,
    modusNachher: zielModus,
    effektiverDateiindikator: nachher.effektiverDateiindikator,
    hinweis: nachher.hinweis,
  }
}

export interface HistorieEintrag {
  id: string
  kanal: BetriebsKanal
  modusVorher: Betriebsmodus | null
  modusNachher: Betriebsmodus
  begruendung: string
  testuebertragungAm: string | null
  testuebertragungReferenz: string | null
  freigabeStatus: Record<string, boolean>
  umgestelltVon: string | null
  createdAt: string
}

export async function ladeBetriebsmodusHistorie(
  supabase: SupabaseClient,
  organizationId: string,
  filter: { kanal?: BetriebsKanal; limit?: number } = {},
): Promise<HistorieEintrag[]> {
  let query = supabase
    .from('abrechnung_betriebsmodus_historie')
    .select('id, kanal, modus_vorher, modus_nachher, begruendung, testuebertragung_am, testuebertragung_referenz, freigabe_status, umgestellt_von, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 50, 200))

  if (filter.kanal) query = query.eq('kanal', filter.kanal)

  const { data } = await query

  return (data ?? []).map(z => ({
    id: z.id,
    kanal: z.kanal,
    modusVorher: z.modus_vorher,
    modusNachher: z.modus_nachher,
    begruendung: z.begruendung,
    testuebertragungAm: z.testuebertragung_am,
    testuebertragungReferenz: z.testuebertragung_referenz,
    freigabeStatus: z.freigabe_status ?? {},
    umgestelltVon: z.umgestellt_von,
    createdAt: z.created_at,
  }))
}
