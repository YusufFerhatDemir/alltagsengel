/**
 * Health-Check der Übertragungskanäle.
 *
 * DIE FRAGE, DIE ER BEANTWORTET
 * "Geht gerade etwas raus, und liegt etwas herum, das keiner sieht?" — für
 * jeden der drei Kanäle einzeln (§ 105 SFTP, § 302 SFTP, KIM), in derselben
 * Form. Die Readiness-Ansicht (readiness.ts) beantwortet die andere Frage:
 * "dürfen wir überhaupt starten?". Beide sind nötig. Ein Haus kann
 * versandbereit sein und trotzdem seit sechs Tagen nichts übertragen haben,
 * weil eine Verbindung klemmt.
 *
 * WAS EIN ROTER KANAL BEDEUTET
 * Nicht "kaputt", sondern "es liegt Arbeit, die nicht von selbst weggeht":
 * offene Dead-Letter-Einträge, überfällige Wiedervorlagen, Aufträge, die seit
 * Tagen in der Warteschlange stehen. Ein geschlossenes Gate macht einen Kanal
 * NICHT rot — es ist der erwartete Zustand, solange die externe Freigabe
 * fehlt, und ein Dauer-Rot, das jeder kennt, sieht niemand mehr.
 *
 * KEINE GEHEIMNISSE
 * Der Bericht nennt Hostnamen und IK-Nummern, nie Benutzernamen, Schlüssel
 * oder Passwörter. Er ist für eine Admin-Oberfläche gedacht und muss ohne
 * weitere Filterung anzeigbar sein.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  alleBetriebsmodi, BETRIEBS_KANAELE, KANAL_FREIGABE, KANAL_LABEL,
  type BetriebsKanal, type BetriebsmodusEintrag,
} from './betriebsmodus'
import { EXTERNE_FREIGABEN } from './externe-freigaben'
import { credentialUebersicht, type CredentialUebersicht } from './credentials'
import { deadLetterUebersicht, type DeadLetterUebersicht } from './dead-letter'
import { wiedervorlageUebersicht, type QueueUebersicht } from './wiedervorlage'

export type Ampel = 'gruen' | 'gelb' | 'rot'

/** Ab wann eine Warteschlange als "steht" gilt. */
export const WARTESCHLANGE_ALT_TAGE = 3

export interface LetzterVersand {
  am: string
  ergebnis: string
  phase: string
  dateiName: string | null
  empfaengerIk: string | null
  fehlerCode: string | null
}

export interface KanalGesundheit {
  kanal: BetriebsKanal
  label: string
  ampel: Ampel
  /** Externe Freigabe (Env-Gate). */
  gate: {
    envVariable: string
    offen: boolean
    stelle: string
  }
  betriebsmodus: {
    modus: 'test' | 'produktion'
    effektiverDateiindikator: '0' | '2'
    hinterlegt: boolean
    hinweis: string | null
  }
  /** Letzter Versuch mit tatsächlicher Übertragung. */
  letzteUebertragung: LetzterVersand | null
  /** Letzter Versuch beliebiger Art — auch der am Gate gestoppte. */
  letzterVersuch: LetzterVersand | null
  letzterFehler: LetzterVersand | null
  /** Wie viel darauf wartet, hinauszugehen. */
  warteschlange: {
    versandbereit: number
    inUebermittlung: number
    aeltesterWartendAm: string | null
    tageWartend: number | null
  }
  /** Unbearbeitete Rückmeldungen der Kassen. */
  ruecklaeufer: { offen: number }
  /** Nicht zustellbar — der Arbeitsvorrat aus der Fehlerqueue. */
  deadLetter: { offen: number; aeltesterOffenerAm: string | null }
  /** Klartextbefunde, in der Reihenfolge ihrer Dringlichkeit. */
  befunde: string[]
}

export interface Gesundheit {
  geprueftAm: string
  organizationId: string
  gesamt: Ampel
  kanaele: KanalGesundheit[]
  credentials: CredentialUebersicht
  /** Gilt kanalübergreifend: abgelehnte Positionen aus allen Rückläufern. */
  wiedervorlage: QueueUebersicht
  deadLetter: DeadLetterUebersicht
  /** Was sofort jemanden braucht — über alle Kanäle zusammengefasst. */
  handlungsbedarf: string[]
}

// ── Hilfen ──────────────────────────────────────────────────────

function tageSeit(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function zuVersand(z: Record<string, any> | null | undefined): LetzterVersand | null {
  if (!z) return null
  return {
    am: z.created_at,
    ergebnis: z.ergebnis,
    phase: z.phase,
    dateiName: z.datei_name ?? null,
    empfaengerIk: z.empfaenger_ik ?? null,
    fehlerCode: z.fehler_code ?? null,
  }
}

async function anzahl(
  supabase: SupabaseClient,
  tabelle: string,
  aufbau: (q: any) => any,
): Promise<number> {
  const { count } = await aufbau(
    supabase.from(tabelle).select('id', { count: 'exact', head: true }),
  )
  return count ?? 0
}

// ── Warteschlangen je Kanal ─────────────────────────────────────

/**
 * Wie viel im jeweiligen Kanal auf Übertragung wartet.
 *
 * Je Kanal eine andere Tabelle — deshalb hier gebündelt statt in der
 * Hauptfunktion verteilt: sonst wächst die Fallunterscheidung mit jedem
 * weiteren Kanal in die Länge des Berichts hinein.
 */
async function warteschlangeFuer(
  supabase: SupabaseClient,
  organizationId: string,
  kanal: BetriebsKanal,
): Promise<KanalGesundheit['warteschlange']> {
  const leer = {
    versandbereit: 0, inUebermittlung: 0, aeltesterWartendAm: null, tageWartend: null,
  }

  if (kanal === 'sftp_105') {
    const wartendStatus = ['bereit_zur_uebermittlung', 'verschluesselt', 'externer_zugang_fehlt', 'technischer_fehler']
    const [versandbereit, inUebermittlung] = await Promise.all([
      anzahl(supabase, 'dta_dakota_auftraege', (q: any) =>
        q.eq('organization_id', organizationId).in('status', wartendStatus)),
      anzahl(supabase, 'dta_dakota_auftraege', (q: any) =>
        q.eq('organization_id', organizationId).eq('status', 'uebermittlung_laeuft')),
    ])

    const { data: aeltester } = await supabase
      .from('dta_dakota_auftraege')
      .select('created_at')
      .eq('organization_id', organizationId)
      .in('status', wartendStatus)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    return {
      versandbereit,
      inUebermittlung,
      aeltesterWartendAm: aeltester?.created_at ?? null,
      tageWartend: tageSeit(aeltester?.created_at ?? null),
    }
  }

  if (kanal === 'sftp_302') {
    const wartendStatus = ['bereit_zur_uebermittlung', 'exportiert', 'bereit_zum_export', 'gesperrt_extern']
    const [versandbereit, inUebermittlung] = await Promise.all([
      anzahl(supabase, 'sgb_v_laeufe', (q: any) =>
        q.eq('organization_id', organizationId).is('deleted_at', null).in('status', wartendStatus)),
      anzahl(supabase, 'sgb_v_laeufe', (q: any) =>
        q.eq('organization_id', organizationId).is('deleted_at', null).eq('status', 'uebermittlung_laeuft')),
    ])

    const { data: aeltester } = await supabase
      .from('sgb_v_laeufe')
      .select('erstellt_am')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .in('status', wartendStatus)
      .order('erstellt_am', { ascending: true })
      .limit(1)
      .maybeSingle()

    return {
      versandbereit,
      inUebermittlung,
      aeltesterWartendAm: aeltester?.erstellt_am ?? null,
      tageWartend: tageSeit(aeltester?.erstellt_am ?? null),
    }
  }

  // KIM: Nachrichten im Status 'wartend' hängen an einem fehlenden Adapter,
  // 'gesperrt' wurde bewusst angehalten und zählt nicht als Warteschlange.
  const wartend = await anzahl(supabase, 'kim_nachrichten', (q: any) =>
    q.eq('organization_id', organizationId).is('deleted_at', null).eq('status', 'wartend'))

  const { data: aeltester } = await supabase
    .from('kim_nachrichten')
    .select('created_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .eq('status', 'wartend')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return {
    ...leer,
    versandbereit: wartend,
    aeltesterWartendAm: aeltester?.created_at ?? null,
    tageWartend: tageSeit(aeltester?.created_at ?? null),
  }
}

// ── Ein Kanal ───────────────────────────────────────────────────

async function kanalGesundheit(
  supabase: SupabaseClient,
  organizationId: string,
  modus: BetriebsmodusEintrag,
  deadLetter: DeadLetterUebersicht,
): Promise<KanalGesundheit> {
  const kanal = modus.kanal
  const freigabe = EXTERNE_FREIGABEN[KANAL_FREIGABE[kanal]]

  const [protokollzeilen, warteschlange, offeneRuecklaeufer] = await Promise.all([
    supabase
      .from('dta_versand_protokoll')
      .select('created_at, ergebnis, phase, datei_name, empfaenger_ik, fehler_code')
      .eq('organization_id', organizationId)
      .eq('kanal', kanal)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(r => r.data ?? []),
    warteschlangeFuer(supabase, organizationId, kanal),
    kanal === 'sftp_105'
      ? anzahl(supabase, 'dta_ruecklaeufer', (q: any) =>
          q.eq('organization_id', organizationId)
            .in('status', ['neu', 'in_pruefung', 'korrektur_erforderlich']))
      : Promise.resolve(0),
  ])

  const letzterVersuch = zuVersand(protokollzeilen[0])
  const letzteUebertragung = zuVersand(
    protokollzeilen.find(z => z.phase === 'uebertragung' && z.ergebnis === 'erfolg'),
  )
  const letzterFehler = zuVersand(protokollzeilen.find(z => z.ergebnis === 'fehler'))

  const dlOffen = deadLetter.proKanal[kanal] ?? 0

  const befunde: string[] = []
  let ampel: Ampel = 'gruen'
  const verschaerfe = (neu: Ampel) => {
    if (neu === 'rot' || (neu === 'gelb' && ampel === 'gruen')) ampel = neu
  }

  if (!modus.gateOffen) {
    befunde.push(
      `Kanal extern gesperrt: ${freigabe.envVariable} ist nicht gesetzt. `
      + `Es geht nichts hinaus und es entsteht keine Forderung. Freigabe erteilt: ${freigabe.stelle}.`,
    )
    // Bewusst nur gelb: das ist der erwartete Zustand vor der Freischaltung.
    verschaerfe('gelb')
  }

  if (modus.hinweis) {
    befunde.push(modus.hinweis)
    verschaerfe('gelb')
  }

  if (dlOffen > 0) {
    befunde.push(
      `${dlOffen} nicht zustellbare Übertragung(en) in der Fehlerqueue — `
      + 'jede davon ist eine Abrechnung, die die Kasse nicht erhalten hat.',
    )
    verschaerfe('rot')
  }

  if (warteschlange.tageWartend !== null && warteschlange.tageWartend >= WARTESCHLANGE_ALT_TAGE) {
    const text = `Ältester wartender Vorgang liegt seit ${warteschlange.tageWartend} Tagen in der Warteschlange`
    befunde.push(modus.gateOffen ? `${text} — Übertragung prüfen.` : `${text} (Kanal ist extern gesperrt).`)
    // Bei geschlossenem Gate ist Liegenbleiben die Folge der Sperre, kein Defekt.
    verschaerfe(modus.gateOffen ? 'rot' : 'gelb')
  }

  if (warteschlange.inUebermittlung > 0) {
    befunde.push(
      `${warteschlange.inUebermittlung} Vorgang/Vorgänge stehen auf "Übermittlung läuft" — `
      + 'bei einem abgebrochenen Aufruf bleiben sie dort hängen und müssen nachgesehen werden.',
    )
    verschaerfe('gelb')
  }

  if (offeneRuecklaeufer > 0) {
    befunde.push(`${offeneRuecklaeufer} unbearbeitete(r) Rückläufer.`)
    verschaerfe('gelb')
  }

  if (letzterFehler && letzteUebertragung && letzterFehler.am > letzteUebertragung.am) {
    befunde.push(
      `Der letzte Versuch schlug fehl (${letzterFehler.fehlerCode ?? 'ohne Code'}), `
      + 'die letzte erfolgreiche Übertragung liegt davor.',
    )
    verschaerfe('rot')
  }

  if (modus.gateOffen && !letzteUebertragung) {
    befunde.push('Über diesen Kanal wurde noch nie erfolgreich übertragen.')
    verschaerfe('gelb')
  }

  if (befunde.length === 0) {
    befunde.push('Keine offenen Punkte.')
  }

  return {
    kanal,
    label: KANAL_LABEL[kanal],
    ampel,
    gate: {
      envVariable: freigabe.envVariable,
      offen: modus.gateOffen,
      stelle: freigabe.stelle,
    },
    betriebsmodus: {
      modus: modus.modus,
      effektiverDateiindikator: modus.effektiverDateiindikator,
      hinterlegt: modus.hinterlegt,
      hinweis: modus.hinweis,
    },
    letzteUebertragung,
    letzterVersuch,
    letzterFehler,
    warteschlange,
    ruecklaeufer: { offen: offeneRuecklaeufer },
    deadLetter: {
      offen: dlOffen,
      aeltesterOffenerAm: dlOffen > 0 ? deadLetter.aeltesterOffenerAm : null,
    },
    befunde,
  }
}

// ── Gesamtbericht ───────────────────────────────────────────────

/**
 * Zustand aller Kanäle plus Zugangsmittel und offene Arbeitsvorräte.
 *
 * Ein einziger Aufruf, weil die Frage nie "wie geht es § 302" lautet, sondern
 * "kann ich heute abrechnen und liegt irgendwo etwas".
 */
export async function ermittleGesundheit(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Gesundheit> {
  const [modi, credentials, deadLetter, wiedervorlage] = await Promise.all([
    alleBetriebsmodi(supabase, organizationId),
    credentialUebersicht(supabase, organizationId),
    deadLetterUebersicht(supabase, organizationId),
    wiedervorlageUebersicht(supabase, organizationId),
  ])

  const kanaele = await Promise.all(
    BETRIEBS_KANAELE.map(k =>
      kanalGesundheit(
        supabase,
        organizationId,
        modi.find(m => m.kanal === k)!,
        deadLetter,
      ),
    ),
  )

  const handlungsbedarf: string[] = []

  if (deadLetter.offen > 0) {
    handlungsbedarf.push(
      `${deadLetter.offen} nicht zustellbare Übertragung(en) — Admin → Kassenabrechnung → Betrieb`,
    )
  }
  if (wiedervorlage.ueberfaellig > 0) {
    handlungsbedarf.push(
      `${wiedervorlage.ueberfaellig} überfällige Wiedervorlage(n) — `
      + `${(wiedervorlage.offenerBetragCent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} offen`,
    )
  }
  if (credentials.naechsterAblauf && credentials.naechsterAblauf.tage <= 60) {
    handlungsbedarf.push(
      `${credentials.naechsterAblauf.label} läuft in ${credentials.naechsterAblauf.tage} Tag(en) ab `
      + `(${credentials.naechsterAblauf.am})`,
    )
  }
  for (const punkt of credentials.offenIntern) {
    handlungsbedarf.push(`Zugangsmittel: ${punkt}`)
  }

  const gesamt: Ampel = kanaele.some(k => k.ampel === 'rot')
    ? 'rot'
    : kanaele.some(k => k.ampel === 'gelb')
      ? 'gelb'
      : 'gruen'

  return {
    geprueftAm: new Date().toISOString(),
    organizationId,
    gesamt,
    kanaele,
    credentials,
    wiedervorlage,
    deadLetter,
    handlungsbedarf,
  }
}
