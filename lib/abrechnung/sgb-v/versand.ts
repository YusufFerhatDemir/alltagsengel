/**
 * § 302 SGB V — Lauf und Versandpfad (häusliche Krankenpflege).
 *
 * Baugleich zum § 105-Pfad (lib/abrechnung/versand.ts), mit denselben Sperren
 * in derselben Reihenfolge — und einer zusätzlichen davor:
 *
 *   0. Generator      — `erzeugeSgbVDatei()` wirft, solange die Technische
 *                       Anlage 1 nicht vorliegt. Diese Sperre ist NICHT
 *                       umgehbar und hat nichts mit dem Feature-Gate zu tun.
 *   1. Version        — es muss eine spec-bestätigte Formatversion gelten.
 *   2. Routing        — die zuständige Datenannahmestelle je Kasse.
 *   3. GATE           — SGB_V_302_FREIGABE.
 *   4. Verschlüsselung + Übertragung — derselbe Transportweg wie § 105.
 *
 * WARUM DER PFAD TROTZDEM SCHON GEBAUT IST
 * Wenn TA1 vorliegt, ist genau eine Datei zu implementieren (generator.ts) und
 * ein Schalter umzulegen. Alles daneben — Lauf, Statusmodell, Protokoll,
 * Audit, Transport, Fehlerbehandlung — steht dann bereits und ist mit dem
 * § 105-Betrieb erprobt. Ohne diesen Pfad müsste zum ungünstigsten Zeitpunkt
 * (Frist läuft, Kasse wartet) die halbe Kette neu gebaut werden.
 *
 * WAS HEUTE PASSIERT: `erzeugeUndVersendeSgbV()` legt den Lauf an, füllt ihn
 * mit echten Positionen, scheitert am Generator und hinterlässt einen Lauf im
 * Status 'gesperrt_extern' mit Klartext-Begründung. Keine Datei, kein Versand,
 * keine Forderung.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../../billing/core/audit'
import { ExternGesperrtError, istFreigegeben, pruefeFreigabe } from '../externe-freigaben'
import { protokolliereVersand } from '../versand-protokoll'
import { dateiindikatorFuer } from '../betriebsmodus'
import { erzeugeSgbVDatei, exportImplementiert, SgbVSpecFehltError } from './generator'
import { aktuelleVersion, monatsStichtag, type SgbVFormat } from './versionen'
import { ladeRouting, findeRouting } from './routing'
import { pruefeAufbereitungTarife, type TarifBefund } from './validierung'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'
import {
  bereiteHkpVor, HKP_VERORDNUNG_TYPE,
  type HkpAufbereitung, type HkpLeistung, type HkpVerordnung, type HkpKlient,
} from './positionen'

const KANAL = 'sftp_302' as const

export interface SgbVLaufParams {
  organizationId: string
  /** JJJJ-MM */
  abrechnungsmonat: string
  bundesland?: string | null
  /** Nur diese Kasse abrechnen. Ohne Angabe: Sammellauf über alle. */
  kostentraegerIk?: string | null
  format?: SgbVFormat
  /**
   * Nur zum Herunterstufen: '0' erzwingt eine Testdatei, auch wenn der Kanal
   * auf Echtbetrieb steht. Ein '2' hat keine Wirkung — der Echtbetrieb kommt
   * ausschliesslich aus dem Betriebsmodus (lib/abrechnung/betriebsmodus.ts).
   */
  dateiindikator?: '0' | '2'
  actorId: string
}

export interface SgbVLaufErgebnis {
  laufId: string | null
  status: string
  /** Wo die Kette angehalten hat. */
  gestoppt: 'generator' | 'version' | 'routing' | 'extern' | 'daten' | 'stammdaten' | 'tarif' | null
  grund: string | null
  naechsterSchritt: string | null
  anzahlFaelle: number
  anzahlPositionen: number
  gesamtbetragCent: number
  /** Leistungen, die nicht abrechenbar sind — mit Begründung. */
  abgelehnt: HkpAufbereitung['abgelehnt']
  routingProbleme: Array<{ kostentraegerIk: string; hinweis: string | null }>
  /** Positionen, die an der § 37-Tarifprüfung gescheitert sind. */
  ohneTarif: TarifBefund[]
}

function monatsGrenzen(monat: string): { von: string; bis: string } {
  const [jahr, mon] = monat.split('-').map(Number)
  const letzterTag = new Date(Date.UTC(jahr, mon, 0)).getUTCDate()
  return { von: `${monat}-01`, bis: `${monat}-${String(letzterTag).padStart(2, '0')}` }
}

/**
 * Lädt HKP-Leistungen, Verordnungen und Klienten und bereitet die Fälle auf.
 * Exportiert, damit export-generator.ts/abrechnungslauf.ts denselben
 * Datenzugriff für den Prüf-Export nutzen können, statt ihn zu duplizieren.
 */
export async function ladeAufbereitung(
  supabase: SupabaseClient,
  organizationId: string,
  monat: string,
): Promise<HkpAufbereitung> {
  const { von, bis } = monatsGrenzen(monat)

  const [leistungenRes, verordnungenRes, klientenRes] = await Promise.all([
    supabase
      .from('service_records')
      .select('id, client_id, verordnung_id, date, duration_minutes, service_type, amount, proof_status, billing_status')
      .eq('organization_id', organizationId)
      .in('status', ['complete', 'signed', 'invoiced'])
      .gte('date', von)
      .lte('date', bis)
      .order('date', { ascending: true }),
    supabase
      .from('verordnungen')
      .select('id, client_id, verordnung_type, genehmigung_status, gueltig_von, gueltig_bis, genehmigung_bis, verordnung_nummer, genehmigung_aktenzeichen, kostentraeger_ik_nummer, kostentraeger_name')
      .eq('organization_id', organizationId)
      .eq('verordnung_type', HKP_VERORDNUNG_TYPE)
      .is('deleted_at', null),
    supabase
      .from('clients')
      .select('id, first_name, last_name, versichertennummer, geburtsdatum, date_of_birth')
      .eq('organization_id', organizationId),
  ])

  const verordnungen = (verordnungenRes.data || []) as HkpVerordnung[]
  const klienten = (klientenRes.data || []) as HkpKlient[]
  const hkpIds = new Set(verordnungen.map(v => v.id))
  // Storno raus, bevor aufbereitet wird. Dies ist der ECHTE § 302-Lauf: was
  // hier durchkommt, wird als Forderung an die Kasse uebermittelt. Ein
  // widerrufener Nachweis bleibt wegen des fehlenden status-Gegenstuecks auf
  // 'signed' stehen und kam durch den .in('status', …)-Filter.
  const leistungen = ohneStornierte((leistungenRes.data || []) as HkpLeistung[])
    .filter(l => l.verordnung_id && hkpIds.has(l.verordnung_id))

  return bereiteHkpVor(leistungen, verordnungen, klienten)
}

/**
 * Legt einen § 302-Lauf an und versucht, ihn zu erzeugen und zu versenden.
 *
 * Der Lauf wird IMMER angelegt, auch wenn die Kette danach stoppt: ein
 * Abrechnungsversuch, der keine Spur hinterlässt, ist später nicht von
 * "wurde nie versucht" zu unterscheiden — und genau das ist die Frage, wenn
 * eine Kasse eine fehlende Abrechnung anmahnt.
 */
export async function erzeugeUndVersendeSgbV(
  supabase: SupabaseClient,
  params: SgbVLaufParams,
): Promise<SgbVLaufErgebnis> {
  const {
    organizationId, abrechnungsmonat, actorId,
    format = 'edifact_slga_slla',
  } = params

  if (!/^\d{4}-\d{2}$/.test(abrechnungsmonat)) {
    throw new Error(`Abrechnungsmonat muss JJJJ-MM sein (erhalten: "${abrechnungsmonat}")`)
  }

  // Dateiindikator kommt aus dem Betriebsmodus des Kanals, nicht vom Aufrufer.
  // Ein Aufrufer darf herunterstufen ('0' erzwingen), aber nie heraufstufen:
  // sonst entschiede ein API-Parameter darüber, ob eine Datei bei der Kasse
  // eine Forderung auslöst.
  const betriebsIndikator = await dateiindikatorFuer(supabase, organizationId, 'sftp_302')
  const dateiindikator: '0' | '2' =
    betriebsIndikator === '2' && params.dateiindikator !== '0' ? '2' : '0'

  const start = Date.now()

  // ── Positionen aufbereiten ───────────────────────────────────
  const aufbereitung = await ladeAufbereitung(supabase, organizationId, abrechnungsmonat)

  const rohFaelle = params.kostentraegerIk
    ? aufbereitung.faelle.filter(f => f.kostentraeger_ik === params.kostentraegerIk)
    : aufbereitung.faelle

  // § 37-Tarifprüfung als eigene Stufe über der (rein synchronen) Aufbereitung.
  // Ohne sie liefe die Fail-Closed-Regel aus lib/billing/core/price-resolver
  // am Abrechnungslauf vorbei — pruefePosition() kennt keine Preise.
  const tarifPruefung = await pruefeAufbereitungTarife(supabase, organizationId, { faelle: rohFaelle })
  const faelle = tarifPruefung.faelle

  const gesamtbetragCent = faelle.reduce((s, f) => s + f.betrag_cent, 0)
  const anzahlPositionen = faelle.reduce((s, f) => s + f.positionen.length, 0)

  // ── Lauf anlegen ─────────────────────────────────────────────
  const { data: lauf, error: laufFehler } = await supabase
    .from('sgb_v_laeufe')
    .insert({
      organization_id: organizationId,
      abrechnungsmonat,
      bundesland: params.bundesland ?? null,
      kostentraeger_ik: params.kostentraegerIk ?? null,
      kostentraeger_name: params.kostentraegerIk
        // aus rohFaelle: bei einem Tarif-Stopp ist `faelle` leer, der Name
        // der Kasse gehört trotzdem an den Lauf.
        ? rohFaelle[0]?.kostentraeger_name ?? null
        : null,
      anzahl_faelle: faelle.length,
      anzahl_positionen: anzahlPositionen,
      gesamtbetrag_cent: gesamtbetragCent,
      dateiindikator,
      status: 'erstellt',
      erstellt_von: actorId,
    })
    .select('id')
    .single()

  if (laufFehler || !lauf) {
    // 23505 = ein aktiver Lauf für Monat + Kasse existiert bereits.
    if (laufFehler?.code === '23505') {
      throw new Error(
        `Für ${abrechnungsmonat} und Kostenträger ${params.kostentraegerIk ?? 'SAMMEL'} `
        + 'existiert bereits ein aktiver § 302-Lauf. Diesen abschliessen oder stornieren.',
      )
    }
    throw new Error(`§ 302-Lauf konnte nicht angelegt werden: ${laufFehler?.message}`)
  }

  const laufId = lauf.id as string

  await logBillingAction(supabase, {
    entityType: 'sgb_v_lauf',
    organizationId,
    entityId: laufId,
    action: 'sgb_v_lauf_erstellt',
    newState: {
      abrechnungsmonat,
      kostentraeger_ik: params.kostentraegerIk ?? null,
      faelle: faelle.length,
      positionen: anzahlPositionen,
      betrag_cent: gesamtbetragCent,
      dateiindikator,
    },
    actorId,
  })

  const stoppe = async (
    art: NonNullable<SgbVLaufErgebnis['gestoppt']>,
    grund: string,
    naechsterSchritt: string,
    routingProbleme: SgbVLaufErgebnis['routingProbleme'] = [],
    ohneTarif: TarifBefund[] = [],
  ): Promise<SgbVLaufErgebnis> => {
    // 'daten', 'tarif' und 'stammdaten' sind hausgemacht und im eigenen Haus
    // lösbar — sie dürfen nicht als 'gesperrt_extern' erscheinen, sonst sieht
    // ein interner Pflegefehler wie ein fehlender Kassenvertrag aus.
    const status = art === 'daten' || art === 'tarif' || art === 'stammdaten'
      ? 'validierung_fehlgeschlagen'
      : 'gesperrt_extern'
    await supabase
      .from('sgb_v_laeufe')
      .update({ status, sperr_grund: grund })
      .eq('id', laufId)
      .eq('organization_id', organizationId)

    await protokolliereVersand(supabase, {
      organizationId,
      kanal: KANAL,
      phase: art === 'extern' ? 'gate' : 'vorbereitung',
      ergebnis: art === 'extern' || art === 'generator' || art === 'version'
        ? 'gestoppt_extern'
        : 'gestoppt_intern',
      externeReferenz: laufId,
      protokoll: `§ 302-Lauf ${laufId} (${abrechnungsmonat}): ${faelle.length} Fälle, `
        + `${anzahlPositionen} Positionen, ${(gesamtbetragCent / 100).toFixed(2)} €`,
      fehlerCode: art === 'extern' ? 'EXTERN_GESPERRT' : art.toUpperCase(),
      fehlerMeldung: grund,
      empfaengerIk: params.kostentraegerIk ?? null,
      dauerMs: Date.now() - start,
      actorId,
    })

    return {
      laufId,
      status,
      gestoppt: art,
      grund,
      naechsterSchritt,
      anzahlFaelle: faelle.length,
      anzahlPositionen,
      gesamtbetragCent,
      abgelehnt: aufbereitung.abgelehnt,
      routingProbleme,
      ohneTarif,
    }
  }

  // ── Daten vorhanden? ─────────────────────────────────────────
  // Auf die UNgeprüften Fälle: sonst meldet ein reiner Tarifmangel
  // "keine Leistungen erfasst" und schickt die Suche in die falsche Richtung.
  if (rohFaelle.length === 0) {
    return stoppe(
      'daten',
      `Keine abrechenbaren HKP-Leistungen für ${abrechnungsmonat}`
        + (aufbereitung.abgelehnt.length > 0
          ? ` — ${aufbereitung.abgelehnt.length} Leistung(en) sind nicht abrechenbar (siehe Liste)`
          : ''),
      'Verordnungen und Leistungsnachweise prüfen (Vorschau: /api/billing/sgb-v/vorschau)',
    )
  }

  // ── § 37-Tarife ──────────────────────────────────────────────
  // Fail-closed und ohne Teilabrechnung: schon eine einzige Position ohne
  // verifizierten Tarif hält den Lauf an. Die Alternative — die betroffenen
  // Positionen still weglassen — wäre gegenüber der Kasse eine unvollständige
  // Abrechnung, die wie eine vollständige aussieht.
  if (!tarifPruefung.ok) {
    return stoppe(
      'tarif',
      `${tarifPruefung.ohneTarif.length} von ${tarifPruefung.geprueftePositionen} Position(en) haben keinen `
        + 'verifizierten § 37-Tarif. Ohne hinterlegten und als verifiziert markierten Tarif wird kein Betrag '
        + 'gegenüber einer Krankenkasse geltend gemacht.',
      'billing_tariffs mit Rechtsgrundlage "§37 SGB V" pflegen und nach Belegprüfung auf tarif_status = "verified" setzen',
      [],
      tarifPruefung.ohneTarif,
    )
  }

  // ── Absender-IK der Organisation ─────────────────────────────
  // Muss VOR dem Generator geladen werden: die Erzeugungsparameter verlangen
  // eine Absender-IK, und eine leere IK würde im Kopfsegment einer echten
  // Datei landen. Die Readiness prüft denselben Punkt — hier ist er scharf.
  const { data: absender } = await supabase
    .from('organizations')
    .select('ik_nummer')
    .eq('id', organizationId)
    .maybeSingle()

  const absenderIk = absender?.ik_nummer ? String(absender.ik_nummer) : ''
  if (!/^\d{9}$/.test(absenderIk)) {
    return stoppe(
      'stammdaten',
      `Der Organisation fehlt eine gültige neunstellige Absender-IK (gefunden: ${absenderIk || 'keine'}). `
        + 'Ohne sie kann kein § 302-Datensatz adressiert werden.',
      'IK-Nummer bei den Verbänden der Krankenkassen beantragen und in organizations.ik_nummer eintragen',
    )
  }

  // ── Formatversion ────────────────────────────────────────────
  const version = await aktuelleVersion(supabase, organizationId, abrechnungsmonat, format)
  if (!version.ok || !version.version) {
    return stoppe(
      'version',
      version.hinweis ?? 'Keine gültige, spec-bestätigte Formatversion',
      'Technische Anlage 1 beschaffen und sgb_v_formatversionen.spec_bestaetigt setzen',
    )
  }

  await supabase
    .from('sgb_v_laeufe')
    .update({ formatversion_id: version.version.id, ta_version: version.version.ta_version })
    .eq('id', laufId)
    .eq('organization_id', organizationId)

  // ── Routing ──────────────────────────────────────────────────
  const routingEintraege = await ladeRouting(supabase, organizationId)
  const stichtag = monatsStichtag(abrechnungsmonat)
  const kassenIks = [...new Set(faelle.map(f => f.kostentraeger_ik))]

  const routingProbleme: SgbVLaufErgebnis['routingProbleme'] = []
  let datenannahmestelleIk: string | null = null
  let datenannahmestelleName: string | null = null

  for (const ik of kassenIks) {
    const ergebnis = findeRouting(routingEintraege, ik, stichtag)
    if (!ergebnis.ok) {
      routingProbleme.push({ kostentraegerIk: ik, hinweis: ergebnis.hinweis })
    } else if (!datenannahmestelleIk) {
      datenannahmestelleIk = ergebnis.routing?.datenannahmestelle_ik ?? null
      datenannahmestelleName = ergebnis.routing?.datenannahmestelle_name ?? null
    }
  }

  if (routingProbleme.length > 0) {
    return stoppe(
      'routing',
      `Für ${routingProbleme.length} von ${kassenIks.length} Kasse(n) fehlt das § 302-Routing`,
      'sgb_v_routing pflegen: je Kassen-IK die zuständige Datenannahmestelle',
      routingProbleme,
    )
  }

  await supabase
    .from('sgb_v_laeufe')
    .update({
      datenannahmestelle_ik: datenannahmestelleIk,
      datenannahmestelle_name: datenannahmestelleName,
    })
    .eq('id', laufId)
    .eq('organization_id', organizationId)

  // ── GATE ─────────────────────────────────────────────────────
  try {
    pruefeFreigabe('sgb_v_302_freigabe', `§ 302-Lauf ${laufId}`)
  } catch (err) {
    if (!(err instanceof ExternGesperrtError)) throw err
    return stoppe(
      'extern',
      err.message,
      `Nach Vorliegen der TA1 und implementiertem Generator: ${err.envVariable}=true setzen`,
    )
  }

  // ── Generator ────────────────────────────────────────────────
  // Doppelte Sperre: auch bei offenem Gate und spec_bestaetigt=true fehlt ohne
  // implementierten Segment-Builder jede Grundlage für eine Datei.
  if (!exportImplementiert(format)) {
    return stoppe(
      'generator',
      `§ 302-Generator für Format "${format}" ist nicht implementiert — `
        + 'Segmentstrukturen werden nicht geraten.',
      'Segment-Builder und Validator nach TA1 implementieren (lib/abrechnung/sgb-v/generator.ts)',
    )
  }

  try {
    erzeugeSgbVDatei({
      aufbereitung: { ...aufbereitung, faelle },
      version: version.version,
      absenderIk,
      datenannahmestelleIk: datenannahmestelleIk ?? '',
      abrechnungsmonat,
      dateiindikator,
    })
  } catch (err) {
    if (err instanceof SgbVSpecFehltError) {
      return stoppe('generator', err.message, 'Technische Anlage 1 beschaffen und Generator implementieren')
    }
    throw err
  }

  // Ab hier läge die erzeugte Datei vor. Der Transportweg ist derselbe wie bei
  // § 105 (SECON → SFTP an die Datenannahmestelle) und wird angeschlossen,
  // sobald der Generator eine Datei liefert — bis dahin ist dieser Punkt
  // unerreichbar, und das ist der gewollte Zustand.
  throw new Error(
    '§ 302: Generator hat unerwartet eine Datei geliefert, der Transportanschluss steht aber noch aus. '
    + 'Das ist ein Programmierfehler — exportImplementiert() und erzeugeSgbVDatei() sind auseinandergelaufen.',
  )
}

export interface SgbVKanalStatus {
  freigegeben: boolean
  generatorImplementiert: boolean
  /** true nur, wenn beides zutrifft. */
  versandMoeglich: boolean
  blocker: string[]
}

/** Für Oberfläche und Readiness: warum ist der Kanal zu? */
export function sgbVKanalStatus(format: SgbVFormat = 'edifact_slga_slla'): SgbVKanalStatus {
  const freigegeben = istFreigegeben('sgb_v_302_freigabe')
  const generatorImplementiert = exportImplementiert(format)

  const blocker: string[] = []
  if (!generatorImplementiert) {
    blocker.push('Technische Anlage 1 liegt nicht vor — Generator nicht implementiert')
  }
  if (!freigegeben) {
    blocker.push('Feature-Gate SGB_V_302_FREIGABE steht auf false')
  }

  return {
    freigegeben,
    generatorImplementiert,
    versandMoeglich: freigegeben && generatorImplementiert,
    blocker,
  }
}
