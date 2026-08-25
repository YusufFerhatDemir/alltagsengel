/**
 * MONEY PATH PILOT — zentrale Betriebsübersicht der Geldpfade
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Track 7 von Phase 7. Eine Seite, die vor dem ersten begleiteten
 * Echtlauf beantwortet: was steht bereit, was ist blockiert, und warum
 * genau.
 *
 * ── ABGRENZUNG ZU /admin/go-live ───────────────────────────────────────
 * `lib/go-live/status.ts` beantwortet eine GESCHÄFTSfrage: welcher
 * Geschäftsbereich darf überhaupt Geld verdienen (Kassenabrechnung,
 * §45b, VP/KZP …). Sie schaut auf Stammdaten, Zertifikate und externe
 * Freigaben.
 *
 * Diese Datei beantwortet eine BETRIEBSfrage innerhalb eines bereits
 * freigegebenen Bereichs: wie viele Rechnungen stehen versandbereit, wie
 * viele Bankbuchungen sind ungeklärt, würde der DATEV-Export heute
 * durchlaufen. Sie ersetzt die Go-Live-Seite nicht und wird von ihr nicht
 * ersetzt.
 *
 * ── DIE WICHTIGSTE REGEL DIESER DATEI ──────────────────────────────────
 * ‼️ KEINE GELDAKTION WIRD HIER FREIGEGEBEN. ‼️
 *
 * Dieses Modul LIEST ausschließlich. Es exportiert keine Funktion, die
 * versendet, bucht, abbucht oder exportiert. Ein Feld wie
 * `rechnung.bereit = 12` ist eine Zählung, keine Erlaubnis.
 *
 * Der Grund steht im Auftrag: „Keine kritische Geldaktion darf NUR anhand
 * eines UI-Buttons ohne Backend-Prüfung freigegeben werden." Ein Dashboard,
 * das seine eigene Zählung als Freigabe weiterreicht, wäre genau das —
 * die Zählung ist eine Momentaufnahme, der Versand passiert Sekunden
 * später, und dazwischen kann sich der Status geändert haben.
 *
 * Die tatsächlichen Riegel sitzen deshalb dort, wo die Aktion passiert,
 * und bleiben es auch, wenn diese Seite etwas anderes anzeigt:
 *   · Rechnungsversand  → lib/billing/versand/rechnung-versand.ts
 *                         (NICHT_VERSANDFAEHIG, frozen_at, sent_at)
 *   · Mahnversand       → lib/billing/dunning/mahn-versand.ts
 *   · CAMT-Import       → app/api/billing/camt/import/route.ts
 *                         (Dateihash, Buchungshash, „ganz oder gar nicht")
 *   · DATEV-Export      → lib/billing/datev/export-service.ts
 *                         (Konfig-Prüfung + Stapel-/Dateiprüfung, fail-closed)
 *   · Rollen/Mandant    → requireOpsAdmin() + RESTRICTIVE org_fence
 *
 * ── FAIL-CLOSED ────────────────────────────────────────────────────────
 * Jede Messung, die nicht ausgeführt werden konnte, ergibt `null` und
 * erscheint unter `hinweise`. `null` wird nie als 0 angezeigt: „keine
 * Klärfälle" und „Klärfälle nicht zählbar" sind zwei verschiedene
 * Aussagen, und nur eine davon ist beruhigend.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { versandFlagsStand, type VersandFlagsStand } from '@/lib/config/versand-flags'
import type { Ampel } from './types'
import { getDatevConfig, isDatevConfigComplete } from '@/lib/billing/datev/datev-config'
import { heuteBerlin } from '@/lib/utils/timezone'

// ───────────────────────────────────────────────────────────────────────
// Typen
// ───────────────────────────────────────────────────────────────────────

/**
 * Eine Zahl, die auch „nicht messbar" sein kann.
 *
 * `null` ist kein Fehlerwert, den man wegoptimieren sollte — er ist die
 * einzige ehrliche Antwort, wenn die Abfrage scheiterte.
 */
export type Messwert = number | null

/**
 * Dasselbe Ampel-Vokabular wie der Rest des Pilotmoduls
 * (`lib/pilot/types.ts`) — plus einen vierten Zustand, den die
 * Betriebs-Checkliste nicht braucht und diese Uebersicht sehr wohl:
 *
 *   'ungeprueft' = die Messung ist gescheitert.
 *
 * Ohne diesen vierten Wert muesste ein Lesefehler entweder als 'gruen'
 * (Falschaussage) oder als 'rot' (nicht unterscheidbar von einem echten
 * Befund) erscheinen. Beides waere schlechter.
 */
export type MoneyPathAmpel = Ampel | 'ungeprueft'

export interface MoneyPathKennzahl {
  label: string
  wert: Messwert
  /** Ein Satz: was bedeutet diese Zahl, wenn sie nicht 0 ist? */
  bedeutung: string
  /** Ab wann ist die Zahl ein Problem? */
  ampel: MoneyPathAmpel
}

export interface MoneyPathBereich {
  id: 'camt' | 'rechnung' | 'mahnung' | 'datev' | 'system'
  titel: string
  ampel: MoneyPathAmpel
  /** Warum der Bereich diese Ampel hat — aus gemessenen Werten. */
  begruendung: string
  kennzahlen: MoneyPathKennzahl[]
}

export interface MoneyPathUebersicht {
  stichtag: string
  organisation: string | null
  organizationId: string
  bereiche: MoneyPathBereich[]
  /** Messungen, die technisch nicht ausgeführt werden konnten. */
  hinweise: string[]
  /**
   * Ausdrücklicher Hinweis für jede Oberfläche, die das hier anzeigt.
   * Steht im Datenmodell und nicht nur im Seitentext, damit er auch in
   * der API-Antwort auftaucht.
   */
  freigabeHinweis: string
}

export const FREIGABE_HINWEIS =
  'Diese Übersicht ist eine Messung, keine Freigabe. Jede Geldaktion wird '
  + 'unabhängig davon im Backend geprüft (Versandgate, Festschreibung, '
  + 'Dublettensperre, DATEV-Stapelprüfung, Mandantenzaun). Eine Zahl auf '
  + 'dieser Seite erlaubt nichts.'

// ───────────────────────────────────────────────────────────────────────
// Hilfen
// ───────────────────────────────────────────────────────────────────────

function kennzahl(
  label: string,
  wert: Messwert,
  bedeutung: string,
  ampel: MoneyPathAmpel = 'gruen',
): MoneyPathKennzahl {
  return { label, wert, bedeutung, ampel }
}

/**
 * Ampel eines Bereichs aus seinen Kennzahlen.
 *
 * Reihenfolge ist Absicht und fail-closed: eine nicht messbare Zahl
 * ('ungeprueft') schlägt eine rote, und beide schlagen 'gelb'.
 * Ein Bereich, in dem eine Messung fehlgeschlagen ist, darf nie grün
 * aussehen — der fehlende Wert könnte genau der schlechte sein.
 */
function ampelAus(kennzahlen: MoneyPathKennzahl[]): MoneyPathAmpel {
  const wirksam = kennzahlen.filter(k => k.ampel !== 'gruen')
  if (kennzahlen.some(k => k.wert === null)) return 'ungeprueft'
  const relevant = wirksam.filter(k => (k.wert ?? 0) > 0)
  if (relevant.some(k => k.ampel === 'rot')) return 'rot'
  if (relevant.some(k => k.ampel === 'gelb')) return 'gelb'
  return 'gruen'
}

/**
 * Zählt Zeilen mit `head: true` und fängt jeden Fehler ab.
 *
 * Ein Lesefehler ergibt `null`, nicht 0 — siehe Modulkopf.
 */
async function zaehle(
  hinweise: string[],
  label: string,
  bauen: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<Messwert> {
  try {
    const { count, error } = await bauen()
    if (error) {
      hinweise.push(`${label}: ${(error as { message?: string })?.message ?? 'unbekannter Fehler'}`)
      return null
    }
    return count ?? 0
  } catch (err) {
    hinweise.push(`${label}: ${(err as Error).message}`)
    return null
  }
}

// ───────────────────────────────────────────────────────────────────────
// 1. CAMT — Bankbuchungen
// ───────────────────────────────────────────────────────────────────────

async function bereichCamt(
  supabase: SupabaseClient,
  orgId: string,
  hinweise: string[],
): Promise<MoneyPathBereich> {
  const kopf = () => supabase.from('camt_imports').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  const ze = () => supabase.from('zahlungseingaenge').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)

  const [importe, fehlerhafte, buchungen, automatisch, klaerfaelle, ruecklastschriften, dubletten] = await Promise.all([
    zaehle(hinweise, 'camt_imports', () => kopf()),
    zaehle(hinweise, 'camt_imports (Status fehler)', () => kopf().eq('status', 'fehler')),
    zaehle(hinweise, 'zahlungseingaenge', () => ze()),
    zaehle(hinweise, 'zahlungseingaenge (automatisch)', () => ze().eq('zuordnungs_status', 'automatisch')),
    zaehle(hinweise, 'klaerfaelle (offen)', () =>
      supabase.from('klaerfaelle').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'offen')),
    zaehle(hinweise, 'zahlungseingaenge (Rücklastschrift)', () => ze().eq('ist_ruecklastschrift', true)),
    // Dubletten im Sinne von „wurde beim Import abgewiesen" lassen sich
    // nicht nachzählen — die Zeile entsteht ja gerade nicht. Zählbar ist
    // nur der Zustand, der eine Dublette WÄRE: zwei Zeilen mit demselben
    // Buchungshash. Findet man hier etwas, hat die Sperre versagt.
    zaehleHashDubletten(supabase, orgId, hinweise),
  ])

  const unzugeordnet = buchungen !== null && automatisch !== null
    ? Math.max(0, buchungen - automatisch - (ruecklastschriften ?? 0))
    : null

  const kennzahlen = [
    kennzahl('Importe gesamt', importe, 'Verarbeitete Kontoauszüge. 0 = der Geldeingangspfad ist nie gelaufen.'),
    kennzahl('Importe mit Fehler', fehlerhafte, 'Auszüge, bei denen mindestens eine Buchung nicht angelegt werden konnte. Der Saldo dieses Auszugs ist unvollständig.', 'rot'),
    kennzahl('Buchungen gesamt', buchungen, 'Zeilen in zahlungseingaenge.'),
    kennzahl('automatisch zugeordnet', automatisch, 'Vom Matching einer Rechnung zugeordnet.'),
    kennzahl('ungeklärt', unzugeordnet, 'Weder automatisch zugeordnet noch Rücklastschrift — Geld liegt auf dem Konto und ist keiner Forderung zugewiesen.', 'gelb'),
    kennzahl('offene Klärfälle', klaerfaelle, 'Warten auf manuelle Zuordnung.', 'gelb'),
    kennzahl('Rücklastschriften', ruecklastschriften, 'Zurückgeholte Zahlungen. Jede davon macht eine als bezahlt geltende Forderung wieder offen.', 'gelb'),
    kennzahl('Hash-Dubletten', dubletten, 'Zwei Zeilen mit identischem Buchungshash. Muss 0 sein — sonst hat die Dublettensperre versagt und Geld ist doppelt verbucht.', 'rot'),
  ]

  const ampel = ampelAus(kennzahlen)
  return {
    id: 'camt',
    titel: 'CAMT — Zahlungseingang',
    ampel,
    begruendung: begruendungCamt(importe, fehlerhafte, klaerfaelle, dubletten),
    kennzahlen,
  }
}

function begruendungCamt(
  importe: Messwert, fehlerhafte: Messwert, klaerfaelle: Messwert, dubletten: Messwert,
): string {
  if (dubletten === null || importe === null) return 'Mindestens eine Messung war nicht ausführbar — der Bereich gilt als ungeprüft.'
  if (dubletten > 0) return `${dubletten} Buchungshash-Dublette(n): dieselbe Bankbuchung ist mehrfach verbucht.`
  if ((fehlerhafte ?? 0) > 0) return `${fehlerhafte} Import(e) im Status "fehler" — dort fehlen Buchungen.`
  if (importe === 0) return 'Kein Kontoauszug importiert. Der Geldeingangspfad ist gebaut und getestet, aber nie gelaufen.'
  if ((klaerfaelle ?? 0) > 0) return `${klaerfaelle} offene(r) Klärfall/Klärfälle warten auf manuelle Zuordnung.`
  return 'Alle importierten Buchungen sind zugeordnet.'
}

/**
 * Zwei Zeilen mit demselben `quelldatei_hash` (= Buchungshash).
 *
 * Der Index darauf ist ausdrücklich NICHT unique (siehe Migration
 * 20260825010000) — die Sperre sitzt in der Route. Diese Zählung ist
 * deshalb die einzige Möglichkeit, ihr Versagen zu bemerken.
 */
async function zaehleHashDubletten(
  supabase: SupabaseClient, orgId: string, hinweise: string[],
): Promise<Messwert> {
  try {
    const { data, error } = await supabase
      .from('zahlungseingaenge')
      .select('quelldatei_hash')
      .eq('organization_id', orgId)
    if (error) {
      hinweise.push(`zahlungseingaenge (Dublettenprobe): ${error.message}`)
      return null
    }
    const gesehen = new Set<string>()
    let doppelt = 0
    for (const zeile of (data ?? []) as { quelldatei_hash: string | null }[]) {
      const h = zeile.quelldatei_hash
      if (!h) continue
      if (gesehen.has(h)) doppelt++
      else gesehen.add(h)
    }
    return doppelt
  } catch (err) {
    hinweise.push(`zahlungseingaenge (Dublettenprobe): ${(err as Error).message}`)
    return null
  }
}

// ───────────────────────────────────────────────────────────────────────
// 2. Rechnung
// ───────────────────────────────────────────────────────────────────────

/**
 * Statuswerte, aus denen heraus NICHT versendet werden darf.
 *
 * Aus `lib/billing/versand/rechnung-versand.ts` übernommen. Bewusst
 * dupliziert und nicht importiert: dort ist die Menge modulprivat, und
 * ein Export nur für ein Dashboard würde eine Sicherheitsregel zu einer
 * öffentlichen Schnittstelle machen. Der Regressionstest in
 * `__tests__/pilot/control-center.test.ts` hält beide Listen aneinander.
 */
export const NICHT_VERSANDFAEHIGE_STATUS = [
  'entwurf', 'geprueft', 'korrektur_erforderlich', 'storniert', 'abgeschrieben',
] as const

async function bereichRechnung(
  supabase: SupabaseClient,
  orgId: string,
  hinweise: string[],
  flags: VersandFlagsStand,
): Promise<MoneyPathBereich> {
  const inv = () => supabase
    .from('invoices').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).is('deleted_at', null)

  const nichtVersandfaehig = `(${NICHT_VERSANDFAEHIGE_STATUS.join(',')})`

  const [gesamt, versendet, blockiert, nichtFestgeschrieben, offen, protokollzeilen] = await Promise.all([
    zaehle(hinweise, 'invoices', () => inv()),
    zaehle(hinweise, 'invoices (versendet)', () => inv().not('sent_at', 'is', null)),
    zaehle(hinweise, 'invoices (nicht versandfähiger Status)', () => inv().in('status', [...NICHT_VERSANDFAEHIGE_STATUS])),
    zaehle(hinweise, 'invoices (nicht festgeschrieben)', () =>
      inv().is('frozen_at', null).not('status', 'in', nichtVersandfaehig)),
    zaehle(hinweise, 'invoices (versandbereit)', () =>
      inv().is('sent_at', null).not('frozen_at', 'is', null).not('status', 'in', nichtVersandfaehig)),
    zaehle(hinweise, 'invoice_email_log', () =>
      supabase.from('invoice_email_log').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
  ])

  // „Needs Review" = festgeschrieben und versandfähig, aber der Empfänger
  // fehlt. Diese Rechnungen zählen NICHT als bereit: der Versand würde sie
  // mit 'uebersprungen' zurückweisen, und niemand sähe warum.
  const ohneEmpfaenger = await zaehleRechnungenOhneEmpfaenger(supabase, orgId, hinweise)
  const bereit = offen !== null && ohneEmpfaenger !== null ? Math.max(0, offen - ohneEmpfaenger) : null

  const kennzahlen = [
    kennzahl('Rechnungen gesamt', gesamt, 'Nicht gelöschte Rechnungen dieses Mandanten.'),
    kennzahl('versandbereit', bereit, 'Festgeschrieben, versandfähiger Status, Empfänger vorhanden, noch nicht versendet.'),
    kennzahl('prüfen: kein Empfänger', ohneEmpfaenger, 'Versandbereit, aber beim Klienten ist keine E-Mail hinterlegt — der Versand würde still überspringen.', 'gelb'),
    kennzahl('blockiert: nicht festgeschrieben', nichtFestgeschrieben, 'Ohne frozen_at darf die Rechnung das Haus nicht verlassen.', 'rot'),
    kennzahl('blockiert: Status', blockiert, `Status in ${nichtVersandfaehig} — Entwurf, in Korrektur, storniert oder abgeschrieben.`, 'rot'),
    kennzahl('versendet', versendet, 'sent_at gesetzt.'),
    kennzahl('Protokollzeilen', protokollzeilen, 'Einträge in invoice_email_log. 0 bei versendeten Rechnungen wäre eine Protokolllücke.'),
  ]

  const ampel = ampelAus(kennzahlen)
  const schalter = flags.rechnung.aktiv
    ? 'Der automatische Rechnungsversand ist SCHARF.'
    : `Automatischer Rechnungsversand: ${flags.rechnung.grund}`

  return {
    id: 'rechnung',
    titel: 'Rechnung — Versand',
    ampel,
    begruendung: `${begruendungRechnung(gesamt, versendet, bereit, ohneEmpfaenger)} ${schalter}`,
    kennzahlen,
  }
}

function begruendungRechnung(
  gesamt: Messwert, versendet: Messwert, bereit: Messwert, ohneEmpfaenger: Messwert,
): string {
  if (gesamt === null || bereit === null) return 'Mindestens eine Messung war nicht ausführbar.'
  if (gesamt === 0) return 'Keine Rechnungen vorhanden.'
  if ((ohneEmpfaenger ?? 0) > 0) return `${ohneEmpfaenger} versandbereite Rechnung(en) ohne E-Mail-Adresse.`
  if (versendet === 0) return `${bereit} Rechnung(en) versandbereit, bisher wurde keine versendet.`
  return `${bereit} Rechnung(en) versandbereit, ${versendet} bereits versendet.`
}

/**
 * Versandbereite Rechnungen, deren Klient keine E-Mail-Adresse hat.
 *
 * Braucht eine Einbettung statt eines Zählers: PostgREST kann nicht auf
 * einer eingebetteten Tabelle filtern und gleichzeitig `head: true`
 * zählen.
 */
async function zaehleRechnungenOhneEmpfaenger(
  supabase: SupabaseClient, orgId: string, hinweise: string[],
): Promise<Messwert> {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, client:clients(email)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .is('sent_at', null)
      .not('frozen_at', 'is', null)
      .not('status', 'in', `(${NICHT_VERSANDFAEHIGE_STATUS.join(',')})`)
    if (error) {
      hinweise.push(`invoices (Empfängerprobe): ${error.message}`)
      return null
    }
    let ohne = 0
    for (const zeile of (data ?? []) as { client: unknown }[]) {
      const roh = zeile.client
      const client = (Array.isArray(roh) ? roh[0] : roh) as { email?: string | null } | null
      if (!client?.email) ohne++
    }
    return ohne
  } catch (err) {
    hinweise.push(`invoices (Empfängerprobe): ${(err as Error).message}`)
    return null
  }
}

// ───────────────────────────────────────────────────────────────────────
// 3. Mahnung
// ───────────────────────────────────────────────────────────────────────

async function bereichMahnung(
  supabase: SupabaseClient,
  orgId: string,
  hinweise: string[],
  flags: VersandFlagsStand,
): Promise<MoneyPathBereich> {
  const heute = heuteBerlin()
  const de = () => supabase
    .from('dunning_entries').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  const queue = () => supabase
    .from('dunning_email_queue').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const [faellig, gesperrt, wartend, versendet, fehlgeschlagen, aufgegeben] = await Promise.all([
    // Fällig = Mahnfrist erreicht, nicht gesperrt, noch nicht als bezahlt
    // markiert. Ob tatsächlich gemahnt wird, entscheidet der Mahnlauf
    // selbst — er wählt eigenständig und richtet sich nicht nach dieser
    // Zahl.
    zaehle(hinweise, 'dunning_entries (fällig)', () =>
      de().eq('block_dunning', false).neq('dunning_level', 'bezahlt').lte('next_dunning_at', heute)),
    zaehle(hinweise, 'dunning_entries (gesperrt)', () => de().eq('block_dunning', true)),
    zaehle(hinweise, 'dunning_email_queue (wartend)', () => queue().eq('status', 'wartend')),
    zaehle(hinweise, 'dunning_email_queue (versendet)', () => queue().eq('status', 'versendet')),
    zaehle(hinweise, 'dunning_email_queue (fehlgeschlagen)', () => queue().eq('status', 'fehlgeschlagen')),
    // 'aufgegeben' = Dead Letter (Migration 20261001000000). Eine Mahnung
    // dort geht NIE mehr raus, ohne dass jemand eingreift.
    zaehle(hinweise, 'dunning_email_queue (aufgegeben)', () => queue().eq('status', 'aufgegeben')),
  ])

  const kennzahlen = [
    kennzahl('mahnfähig', faellig, 'Mahnfrist erreicht, nicht gesperrt, nicht bezahlt. Der Mahnlauf wählt eigenständig — diese Zahl ist eine Vorschau, keine Liste.'),
    kennzahl('gesperrt', gesperrt, 'block_dunning gesetzt — bewusst von der Mahnung ausgenommen.', 'gelb'),
    kennzahl('Warteschlange: wartend', wartend, 'Mahnmails, die noch nicht raus sind.'),
    kennzahl('Warteschlange: versendet', versendet, 'Zugestellt an den Provider.'),
    kennzahl('Warteschlange: fehlgeschlagen', fehlgeschlagen, 'Versuch gescheitert, Wiederholung möglich.', 'gelb'),
    kennzahl('Dead Letter', aufgegeben, 'Endzustand: geht ohne manuellen Eingriff nie mehr raus.', 'rot'),
  ]

  const ampel = ampelAus(kennzahlen)
  const schalter = flags.mahnung.aktiv
    ? 'Der automatische Mahnversand ist SCHARF.'
    : `Automatischer Mahnversand: ${flags.mahnung.grund}`

  return {
    id: 'mahnung',
    titel: 'Mahnung — Lauf und Versand',
    ampel,
    begruendung: `${(aufgegeben ?? 0) > 0
      ? `${aufgegeben} Mahnung(en) im Dead Letter.`
      : `${faellig ?? '—'} Vorgang/Vorgänge mahnfähig.`} ${schalter}`,
    kennzahlen,
  }
}

// ───────────────────────────────────────────────────────────────────────
// 4. DATEV
// ───────────────────────────────────────────────────────────────────────

async function bereichDatev(
  supabase: SupabaseClient,
  orgId: string,
  hinweise: string[],
): Promise<MoneyPathBereich> {
  const ex = () => supabase
    .from('datev_exports').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const [gesamt, fehler, erstellt, heruntergeladen, zuordnungen] = await Promise.all([
    zaehle(hinweise, 'datev_exports', () => ex()),
    zaehle(hinweise, 'datev_exports (fehler)', () => ex().eq('status', 'fehler')),
    zaehle(hinweise, 'datev_exports (erstellt)', () => ex().eq('status', 'erstellt')),
    zaehle(hinweise, 'datev_exports (heruntergeladen)', () => ex().eq('status', 'heruntergeladen')),
    zaehle(hinweise, 'datev_kontenzuordnung', () =>
      supabase.from('datev_kontenzuordnung').select('client_id', { count: 'exact', head: true }).eq('organization_id', orgId)),
  ])

  // Konfiguration: ohne Berater- und Mandantennummer bricht
  // erstelleDatevExport() ab, bevor irgendetwas erzeugt wird.
  let konfigOk: boolean | null = null
  let konfigGrund = ''
  try {
    const config = await getDatevConfig(supabase, orgId)
    const { ok, fehlend } = isDatevConfigComplete(config)
    konfigOk = ok
    konfigGrund = ok
      ? `Kontenrahmen ${config.kontenrahmen}, Sachkontenlänge ${config.sachkontenlaenge}.`
      : `Fehlend: ${fehlend.join(', ')} — diese Werte kommen von der Steuerkanzlei (BUSINESS_INPUT_REQUIRED).`
  } catch (err) {
    hinweise.push(`datev_config: ${(err as Error).message}`)
    konfigGrund = 'Konfiguration nicht lesbar.'
  }

  const kennzahlen = [
    kennzahl('Exporte gesamt', gesamt, 'Erzeugte Buchungsstapel.'),
    kennzahl('Prüfung nicht bestanden', fehler, 'Läufe, bei denen keine Datei erzeugt wurde — die Befunde stehen in fehler_details.', 'rot'),
    kennzahl('erstellt, nicht abgeholt', erstellt, 'Datei liegt bereit, wurde aber nie heruntergeladen.', 'gelb'),
    kennzahl('heruntergeladen', heruntergeladen, 'An die Kanzlei übergeben.'),
    kennzahl('Debitorenzuordnungen', zuordnungen, 'Klienten mit fester Debitorennummer. Fehlende werden beim Export automatisch vergeben.'),
    kennzahl(
      'Konfiguration',
      konfigOk === null ? null : konfigOk ? 0 : 1,
      konfigGrund || 'Berater- und Mandantennummer müssen gesetzt sein.',
      'rot',
    ),
  ]

  const ampel = ampelAus(kennzahlen)
  return {
    id: 'datev',
    titel: 'DATEV — Finanzexport',
    ampel,
    begruendung: konfigOk === false
      ? `Export nicht möglich: ${konfigGrund}`
      : (fehler ?? 0) > 0
        ? `${fehler} Lauf/Läufe haben die Stapelprüfung nicht bestanden.`
        : gesamt === 0
          ? 'Noch kein Buchungsstapel erzeugt.'
          : `${gesamt} Export(e), davon ${heruntergeladen ?? 0} an die Kanzlei übergeben.`,
    kennzahlen,
  }
}

// ───────────────────────────────────────────────────────────────────────
// 5. System
// ───────────────────────────────────────────────────────────────────────

/**
 * Env-Variablen, ohne die kein Geldpfad läuft. Geprüft wird NUR die
 * Existenz — nie der Wert, und der Wert wird auch nie zurückgegeben.
 */
const PFLICHT_ENV: readonly (readonly string[])[] = [
  ['NEXT_PUBLIC_SUPABASE_URL'],
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['RESEND_API_KEY'],
  ['CRON_SECRET'],
]

async function bereichSystem(
  supabase: SupabaseClient,
  orgId: string,
  hinweise: string[],
  flags: VersandFlagsStand,
  quelle: Record<string, string | undefined>,
): Promise<MoneyPathBereich> {
  const fehlendeEnv = PFLICHT_ENV.filter(namen => !namen.some(n => (quelle[n] ?? '').length > 0))

  const [auditZeilen, auditHeute, zustellprotokoll] = await Promise.all([
    zaehle(hinweise, 'billing_audit_trail', () =>
      supabase.from('billing_audit_trail').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
    zaehle(hinweise, 'billing_audit_trail (heute)', () =>
      supabase.from('billing_audit_trail').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).gte('created_at', `${heuteBerlin()}T00:00:00`)),
    zaehle(hinweise, 'notification_delivery_log', () =>
      supabase.from('notification_delivery_log').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
  ])

  const kennzahlen = [
    kennzahl(
      'fehlende Pflicht-Variablen',
      fehlendeEnv.length,
      fehlendeEnv.length
        ? `Nicht gesetzt: ${fehlendeEnv.map(n => n.join(' oder ')).join(', ')}.`
        : 'Alle Pflicht-Variablen sind gesetzt (nur Existenz geprüft, nie der Wert).',
      'rot',
    ),
    kennzahl(
      'Versandschalter scharf',
      [flags.rechnung.aktiv, flags.mahnung.aktiv].filter(Boolean).length,
      'Anzahl der automatischen Versandwege, die echte Post auslösen. 0 = nichts geht automatisch raus.',
    ),
    kennzahl(
      'Schalter-Warnungen',
      flags.warnungen.length,
      flags.warnungen.length
        ? flags.warnungen.join(' ')
        : 'Keine Auffälligkeit an den Versandschaltern: kein ungültiger Wert, keine aktive Nicht-Produktions-Ausnahme.',
      'gelb',
    ),
    kennzahl('Audit-Einträge', auditZeilen, 'Zeilen in billing_audit_trail. 0 bei vorhandenen Rechnungen wäre eine Protokolllücke.'),
    kennzahl('Audit-Einträge heute', auditHeute, 'Belegt, dass das Protokoll aktuell schreibt.'),
    kennzahl('Zustellprotokoll', zustellprotokoll, 'Zeilen in notification_delivery_log über alle Kanäle.'),
  ]

  const ampel = ampelAus(kennzahlen)
  return {
    id: 'system',
    titel: 'System — Umgebung, Audit, Schalter',
    ampel,
    begruendung: fehlendeEnv.length
      ? `${fehlendeEnv.length} Pflicht-Variable(n) fehlen — betroffene Pfade laufen nicht.`
      : flags.warnungen.length
        ? flags.warnungen[0]
        : `Umgebung vollständig. Produktionslauf: ${flags.produktion ? 'ja' : 'nein'}.`,
    kennzahlen,
  }
}

// ───────────────────────────────────────────────────────────────────────
// Einstiegspunkt
// ───────────────────────────────────────────────────────────────────────

/**
 * Erhebt die komplette Pilot-Übersicht.
 *
 * Rein lesend. Der `quelle`-Parameter existiert, damit die Env-Prüfung
 * testbar ist, ohne `process.env` global zu verbiegen.
 */
export async function ermittleMoneyPath(
  supabase: SupabaseClient,
  organizationId: string,
  quelle: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<MoneyPathUebersicht> {
  const hinweise: string[] = []
  const flags = versandFlagsStand(quelle)

  let organisation: string | null = null
  try {
    const { data } = await supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle()
    organisation = (data as { name?: string } | null)?.name ?? null
  } catch (err) {
    hinweise.push(`organizations: ${(err as Error).message}`)
  }

  const bereiche = await Promise.all([
    bereichCamt(supabase, organizationId, hinweise),
    bereichRechnung(supabase, organizationId, hinweise, flags),
    bereichMahnung(supabase, organizationId, hinweise, flags),
    bereichDatev(supabase, organizationId, hinweise),
    bereichSystem(supabase, organizationId, hinweise, flags, quelle),
  ])

  return {
    stichtag: heuteBerlin(),
    organisation,
    organizationId,
    bereiche,
    hinweise,
    freigabeHinweis: FREIGABE_HINWEIS,
  }
}
