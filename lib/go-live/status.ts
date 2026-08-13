/**
 * Business-Go-Live-Status — die eine Seite, die sagt was heute Geld verdienen darf.
 *
 * Beantwortet pro Geschäftsbereich genau drei Fragen:
 *   1. Kann das heute produktiv genutzt werden?
 *   2. Warum nicht (konkret, mit gemessenem Wert — nicht mit Behauptung)?
 *   3. Was ist der nächste Schritt, damit es READY wird?
 *
 * ── DREI STATUS, BEWUSST NICHT ZWEI ────────────────────────────────────────
 *   READY    — heute nutzbar. Alle Pflichtprüfungen erfüllt.
 *   BLOCKED  — intern zu lösen. Code, Stammdaten oder Datenhygiene.
 *   EXTERNAL — wartet auf einen Dritten (ITSG, GKV-SV, gematik, BfArM,
 *              Bundesbank, Pflegekasse). Kein Deploy macht das wahr.
 *
 * Die Trennung BLOCKED/EXTERNAL ist der Kern der Seite. Eine Ampel, die beides
 * zu „rot" verschmilzt, verleitet dazu, extern Unerledigtes für machbar zu
 * halten — und umgekehrt internen Rückstand als „warten wir halt" abzutun.
 *
 * ── WARUM EXTERN DOMINIERT ─────────────────────────────────────────────────
 * Fällt in einem Bereich sowohl eine externe als auch eine interne Pflicht-
 * prüfung durch, ist der Bereich EXTERNAL — nicht BLOCKED. Grund: die interne
 * Lücke zu schliessen ändert nichts an der Nutzbarkeit, solange der externe
 * Blocker steht. Die interne Lücke verschwindet dabei nicht aus der Anzeige;
 * sie steht weiter in der Prüfliste und im nächsten Schritt.
 *
 * ── FAIL-CLOSED ────────────────────────────────────────────────────────────
 * Jede Prüfung, die nicht ausgeführt werden konnte (DB-Fehler, fehlende
 * Tabelle, Timeout), gilt als NICHT erfüllt und erscheint zusätzlich unter
 * `hinweise`. Ein kaputter Zähler darf nie zu einem grünen Feld führen.
 *
 * ── KEINE ERFUNDENEN WERTE ─────────────────────────────────────────────────
 * Es werden ausschliesslich gemessene Zahlen ausgegeben: Zeilenzahlen aus der
 * Produktions-DB, Existenz (nicht Inhalt!) von Env-Variablen, Rückgabewerte
 * der bestehenden Implementierungs-Gates. Keine Preise, keine Fristen, keine
 * Prognosen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { freigabeUebersicht } from '@/lib/abrechnung/externe-freigaben'
import { dipaModus, COACH_DIPA_MODUS_ENV } from '@/lib/coach/config'
import { kimVersandImplementiert } from '@/lib/kim/versand'
import { exportImplementiert } from '@/lib/abrechnung/sgb-v/generator'
import { budgetVersionFuerJahrOderNull } from '@/lib/config/budget-constants'
import { heuteBerlin } from '@/lib/utils/timezone'

export type GoLiveStatus = 'ready' | 'blocked' | 'external'
export type Zustaendigkeit = 'intern' | 'extern'

export interface GoLivePruefung {
  label: string
  /** Ergebnis der automatischen Prüfung. `null` = nicht prüfbar (zählt als nicht erfüllt). */
  erfuellt: boolean | null
  /** Gemessener Wert — niemals ein Geheimnis, nur Zahlen/Ja-Nein. */
  wert: string
  zustaendig: Zustaendigkeit
  /** `pflicht` steuert den Bereichsstatus, `hinweis` wird nur angezeigt. */
  relevanz: 'pflicht' | 'hinweis'
}

export interface GoLiveBereich {
  id: string
  titel: string
  status: GoLiveStatus
  /** Warum der Bereich diesen Status hat — aus gemessenen Werten gebildet. */
  begruendung: string
  /** Was konkret passieren muss, damit der Bereich READY wird. */
  naechsterSchritt: string
  /** Wo der nächste Schritt passiert. Bei READY die Empfehlung zum Weitermachen. */
  zustaendig: Zustaendigkeit
  pruefungen: GoLivePruefung[]
}

export interface GoLiveErgebnis {
  stichtag: string
  organisation: string | null
  bereiche: GoLiveBereich[]
  zusammenfassung: { ready: number; blocked: number; external: number; gesamt: number }
  /** Prüfungen, die technisch nicht ausgeführt werden konnten. */
  hinweise: string[]
}

/**
 * SEPA-Gläubiger-Identifikationsnummer, die als Platzhalter in der Stamm-Org
 * steht (Migration 20260812120000). Kein echter Wert — die Bundesbank vergibt
 * die echte ID erst auf Antrag. Solange dieser Wert dort steht, würde jede
 * Lastschrift von der Bank abgelehnt.
 */
export const SEPA_PLATZHALTER_ID = 'DE98ZZZ09999999999'

/** Env-Variablen, ohne die der Produktivbetrieb nicht läuft. Geprüft wird NUR die Existenz. */
const PFLICHT_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
] as const

/** Rechtsgrundlagen der Verhinderungs- und Kurzzeitpflege (§§ 39, 42 SGB XI). */
const VP_KZP_GRUNDLAGEN = ['§39', '§42', '§ 39', '§ 42']

// ───────────────────────────────────────────────────────────────────────────
// Hilfen
// ───────────────────────────────────────────────────────────────────────────

function pruefung(
  label: string,
  erfuellt: boolean | null,
  wert: string,
  zustaendig: Zustaendigkeit,
  relevanz: GoLivePruefung['relevanz'] = 'pflicht',
): GoLivePruefung {
  return { label, erfuellt, wert, zustaendig, relevanz }
}

/**
 * Bereichsstatus aus den Pflichtprüfungen.
 *
 * Reihenfolge ist Absicht: extern schlägt intern (siehe Modulkopf). `null`
 * (nicht prüfbar) zählt wie „nicht erfüllt" — fail-closed.
 */
function statusAus(pruefungen: GoLivePruefung[]): GoLiveStatus {
  const offen = pruefungen.filter(p => p.relevanz === 'pflicht' && p.erfuellt !== true)
  if (offen.length === 0) return 'ready'
  return offen.some(p => p.zustaendig === 'extern') ? 'external' : 'blocked'
}

function zustaendigkeitAus(pruefungen: GoLivePruefung[], status: GoLiveStatus): Zustaendigkeit {
  if (status === 'ready') return 'intern'
  return status === 'external' ? 'extern' : 'intern'
}

/** Wiederholte-Ziffern-UUIDs wie 33333333-3333-… stammen aus Seed-/Testdaten. */
function istSeedUuid(id: unknown): boolean {
  return typeof id === 'string' && /^(\w)\1{7}-(\w)\2{3}-/.test(id)
}

// ───────────────────────────────────────────────────────────────────────────
// Datenerhebung
// ───────────────────────────────────────────────────────────────────────────

export interface Messwerte {
  organisation: { name: string | null; ik_nummer: string | null; sepa_creditor_id: string | null; iban: string | null } | null
  tarife: Array<{ rechtsgrundlage: string | null; tarif_status: string | null; ist_aktiv: boolean | null }>
  leistungspreise: Array<{ tarif_status: string | null }>
  kunden: number | null
  einsaetze: number | null
  rechnungen: number | null
  rechnungenOhneFaelligkeit: number | null
  zertifikate: Array<{ typ: string | null; gueltig_bis: string | null }>
  bundeslaender: Array<{ bundesland: string | null; kassenrechnung_enabled: boolean | null; dakota_export_enabled: boolean | null }>
  annahmestellen: Array<{ aktiv: boolean | null; sftp_host: string | null; sftp_user: string | null; kim_adresse: string | null }>
  kostentraeger: number | null
  sgbVVersionen: Array<{ spec_bestaetigt: boolean | null; ta_version: string | null }>
  sgbVRouting: number | null
  kimKonfig: Array<{ freischaltungsstatus: string | null }>
  kimKarten: Array<{ karten_typ: string | null; status: string | null }>
  kimVersionen: Array<{ spec_bestaetigt: boolean | null }>
  bewertungen: Array<{ angel_id: unknown; reviewer_id: unknown }>
  testOrganisationen: number | null
  anonBewertungen: { lesbar: boolean | null; quelle: string }
  fehler: string[]
}

/** Wrapper: jeder Fehler landet in `fehler` und der Wert wird `null` (= nicht erfüllt). */
async function messe<T>(fehler: string[], label: string, fn: () => Promise<{ data: T | null; error: unknown; count?: number | null }>): Promise<{ data: T | null; count: number | null }> {
  try {
    const res = await fn()
    if (res.error) {
      fehler.push(`${label}: ${(res.error as { message?: string })?.message ?? 'unbekannter Fehler'}`)
      return { data: null, count: null }
    }
    return { data: res.data, count: res.count ?? null }
  } catch (err) {
    fehler.push(`${label}: ${(err as Error).message}`)
    return { data: null, count: null }
  }
}

/**
 * Liest die Bewertungstabelle mit dem öffentlichen Anon-Key — also exakt so,
 * wie ein Fremder es über PostgREST könnte. Der Test läuft absichtlich an der
 * eigenen API vorbei: der frühere Leak war genau deshalb unentdeckt geblieben,
 * weil nur die API abgesichert war, nicht die Tabelle.
 */
async function pruefeAnonZugriff(tabelle: string): Promise<{ lesbar: boolean | null; quelle: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return { lesbar: null, quelle: 'Anon-Key oder URL nicht gesetzt' }
  try {
    const res = await fetch(`${url}/rest/v1/${tabelle}?select=id&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      cache: 'no-store',
    })
    if (!res.ok) return { lesbar: false, quelle: `HTTP ${res.status}` }
    const rows = (await res.json()) as unknown[]
    return { lesbar: Array.isArray(rows) && rows.length > 0, quelle: Array.isArray(rows) ? `${rows.length} Zeile(n) anonym lesbar` : 'unerwartete Antwort' }
  } catch (err) {
    return { lesbar: null, quelle: `nicht prüfbar: ${(err as Error).message}` }
  }
}

async function erhebeMesswerte(supabase: SupabaseClient, organizationId: string): Promise<Messwerte> {
  const fehler: string[] = []
  const orgFilter = `organization_id.eq.${organizationId},organization_id.is.null`

  const [
    org, tarife, preise, kunden, einsaetze, rechnungen, ohneFaelligkeit,
    zerts, states, das, kt, sgbVVer, sgbVRoute, kimCfg, kimKarten, kimVer,
    reviews, testOrgs, anon,
  ] = await Promise.all([
    messe(fehler, 'organizations', async () => supabase.from('organizations').select('name, ik_nummer, sepa_creditor_id, iban').eq('id', organizationId).maybeSingle()),
    messe(fehler, 'billing_tariffs', async () => supabase.from('billing_tariffs').select('rechtsgrundlage, tarif_status, ist_aktiv').eq('organization_id', organizationId).is('deleted_at', null)),
    messe(fehler, 'leistungspreise', async () => supabase.from('leistungspreise').select('tarif_status').or(orgFilter)),
    // Kein deleted_at-Filter: die Soft-Delete-Spalte existiert auf clients live
    // (noch) nicht — ein Filter darauf quittiert PostgREST mit 400, und der
    // Bereich stünde dann dauerhaft auf „nicht prüfbar".
    messe(fehler, 'clients', async () => supabase.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    messe(fehler, 'service_records', async () => supabase.from('service_records').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    messe(fehler, 'invoices', async () => supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    messe(fehler, 'invoices.due_date', async () => supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('due_date', null)),
    messe(fehler, 'abrechnung_zertifikate', async () => supabase.from('abrechnung_zertifikate').select('typ, gueltig_bis').eq('organization_id', organizationId)),
    messe(fehler, 'state_settings', async () => supabase.from('state_settings').select('bundesland, kassenrechnung_enabled, dakota_export_enabled').eq('organization_id', organizationId)),
    messe(fehler, 'datenannahmestellen', async () => supabase.from('datenannahmestellen').select('aktiv, sftp_host, sftp_user, kim_adresse').or(orgFilter).is('deleted_at', null)),
    messe(fehler, 'dta_kostentraeger', async () => supabase.from('dta_kostentraeger').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('ist_aktiv', true).is('deleted_at', null)),
    messe(fehler, 'sgb_v_formatversionen', async () => supabase.from('sgb_v_formatversionen').select('spec_bestaetigt, ta_version').or(orgFilter)),
    messe(fehler, 'sgb_v_routing', async () => supabase.from('sgb_v_routing').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    messe(fehler, 'kim_konfiguration', async () => supabase.from('kim_konfiguration').select('freischaltungsstatus').eq('organization_id', organizationId)),
    messe(fehler, 'kim_karten', async () => supabase.from('kim_karten').select('karten_typ, status').eq('organization_id', organizationId)),
    messe(fehler, 'kim_formatversionen', async () => supabase.from('kim_formatversionen').select('spec_bestaetigt').or(orgFilter)),
    messe(fehler, 'reviews', async () => supabase.from('reviews').select('angel_id, reviewer_id')),
    messe(fehler, 'organizations (Testmandanten)', async () => supabase.from('organizations').select('id', { count: 'exact', head: true }).ilike('name', '%TEST%')),
    pruefeAnonZugriff('reviews'),
  ])

  return {
    organisation: (org.data as Messwerte['organisation']) ?? null,
    tarife: (tarife.data as Messwerte['tarife']) ?? [],
    leistungspreise: (preise.data as Messwerte['leistungspreise']) ?? [],
    kunden: kunden.count,
    einsaetze: einsaetze.count,
    rechnungen: rechnungen.count,
    rechnungenOhneFaelligkeit: ohneFaelligkeit.count,
    zertifikate: (zerts.data as Messwerte['zertifikate']) ?? [],
    bundeslaender: (states.data as Messwerte['bundeslaender']) ?? [],
    annahmestellen: (das.data as Messwerte['annahmestellen']) ?? [],
    kostentraeger: kt.count,
    sgbVVersionen: (sgbVVer.data as Messwerte['sgbVVersionen']) ?? [],
    sgbVRouting: sgbVRoute.count,
    kimKonfig: (kimCfg.data as Messwerte['kimKonfig']) ?? [],
    kimKarten: (kimKarten.data as Messwerte['kimKarten']) ?? [],
    kimVersionen: (kimVer.data as Messwerte['kimVersionen']) ?? [],
    bewertungen: (reviews.data as Messwerte['bewertungen']) ?? [],
    testOrganisationen: testOrgs.count,
    anonBewertungen: anon as { lesbar: boolean | null; quelle: string },
    fehler,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Bereiche
// ───────────────────────────────────────────────────────────────────────────

function zaehleTarife(m: Messwerte, passt: (rechtsgrundlage: string) => boolean) {
  const relevant = m.tarife.filter(t => t.ist_aktiv !== false && passt(t.rechtsgrundlage ?? ''))
  return {
    gesamt: relevant.length,
    verified: relevant.filter(t => t.tarif_status === 'verified').length,
    blocked: relevant.filter(t => t.tarif_status === 'blocked').length,
    unverified: relevant.filter(t => t.tarif_status === 'unverified').length,
  }
}

function bereichPflegeSoftware(m: Messwerte): GoLiveBereich {
  const jahr = Number(heuteBerlin().slice(0, 4))
  const budget = budgetVersionFuerJahrOderNull(jahr)
  const privat = zaehleTarife(m, r => r === 'privat')

  const pruefungen = [
    pruefung('Verifizierte Privattarife', privat.verified > 0, `${privat.verified} von ${privat.gesamt}`, 'intern'),
    pruefung('Klienten angelegt', (m.kunden ?? 0) > 0, m.kunden === null ? 'nicht prüfbar' : `${m.kunden}`, 'intern'),
    pruefung('Einsätze dokumentiert', (m.einsaetze ?? 0) > 0, m.einsaetze === null ? 'nicht prüfbar' : `${m.einsaetze}`, 'intern'),
    pruefung('Rechnungen erzeugt', (m.rechnungen ?? 0) > 0, m.rechnungen === null ? 'nicht prüfbar' : `${m.rechnungen}`, 'intern'),
    pruefung(`Gesetzliche Budgetwerte ${jahr} hinterlegt`, budget !== null, budget ? `${budget.gueltigAb} bis ${budget.gueltigBis === '9999-12-31' ? 'offen' : budget.gueltigBis}` : 'keine Version', 'intern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'pflege_software',
    titel: 'Pflege-Software',
    status,
    begruendung: status === 'ready'
      ? `Der Kernweg Klient → Buchung → Einsatz → Unterschrift → Rechnung ist mit echten Daten durchlaufen (${m.kunden} Klienten, ${m.einsaetze} Einsätze, ${m.rechnungen} Rechnungen).`
      : 'Mindestens ein Grundbaustein des Kernwegs fehlt oder war nicht prüfbar.',
    naechsterSchritt: status === 'ready'
      ? 'Erster Echtbetrieb: einen realen Kunden komplett durchführen und das Rechnungs-PDF gegenlesen, bevor Mitarbeitende selbständig arbeiten.'
      : 'Fehlende Grundbausteine anlegen — Privattarife verifizieren, Klienten und Einsätze erfassen.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereichPrivatabrechnung(m: Messwerte): GoLiveBereich {
  const privat = zaehleTarife(m, r => r === 'privat')
  const org = m.organisation

  const pruefungen = [
    pruefung('Verifizierte Privattarife', privat.verified > 0, `${privat.verified} verifiziert`, 'intern'),
    pruefung('Rechnungen mit Fälligkeitsdatum', m.rechnungenOhneFaelligkeit === 0, m.rechnungenOhneFaelligkeit === null ? 'nicht prüfbar' : `${m.rechnungenOhneFaelligkeit} ohne due_date`, 'intern'),
    pruefung('Absenderdaten für den Briefkopf', Boolean(org?.name && org?.ik_nummer), org?.name ? `${org.name}${org.ik_nummer ? ` · IK ${org.ik_nummer}` : ''}` : 'unvollständig', 'intern'),
    pruefung('Bankverbindung hinterlegt', Boolean(org?.iban), org?.iban ? 'gesetzt' : 'fehlt', 'intern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'privatabrechnung',
    titel: 'Privatabrechnung',
    status,
    begruendung: status === 'ready'
      ? `${privat.verified} verifizierte Privattarife, jede Rechnung hat ein Zahlungsziel, Briefkopf- und Bankdaten sind vollständig. Privatrechnungen sind ohne jede externe Freigabe möglich.`
      : 'Privatrechnungen sind nicht vollständig belegbar — siehe offene Prüfungen.',
    naechsterSchritt: status === 'ready'
      ? 'Nutzen: dies ist der einzige Abrechnungskanal, der heute ohne externe Freigabe Umsatz erzeugt.'
      : 'Offene Punkte in /admin/kassenabrechnung/tarife bzw. /admin/settings schliessen.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereich45b(m: Messwerte): GoLiveBereich {
  const jahr = Number(heuteBerlin().slice(0, 4))
  const budget = budgetVersionFuerJahrOderNull(jahr)
  const t = zaehleTarife(m, r => r.includes('45b'))

  const pruefungen = [
    pruefung(
      `Gesetzlicher Entlastungsbetrag ${jahr}`,
      budget !== null,
      budget ? `${budget.entlastungMonatlich} € / Monat · ${budget.entlastungJaehrlich} € / Jahr` : 'keine Version hinterlegt',
      'intern',
    ),
    pruefung('Verifizierte § 45b-Tarife', t.verified > 0, `${t.verified} von ${t.gesamt}`, 'intern'),
    pruefung('Keine blockierten § 45b-Tarife', t.blocked === 0, `${t.blocked} blockiert`, 'intern'),
    pruefung('Keine unverifizierten § 45b-Tarife', t.unverified === 0, `${t.unverified} unverifiziert`, 'intern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'entlastungsbetrag_45b',
    titel: '§ 45b Entlastungsbetrag',
    status,
    begruendung: status === 'ready'
      ? `Budgetführung und Tarife sind vollständig verifiziert (${t.verified} Tarife).`
      : `Die Budgetführung läuft, aber ${t.blocked + t.unverified} von ${t.gesamt} § 45b-Tarifen sind nicht verifiziert. Der Rechnungsweg ist fail-closed: unverifizierte oder blockierte Tarife werden abgelehnt, es entsteht keine Forderung.`,
    naechsterSchritt: status === 'ready'
      ? 'Abrechnung gegen den Entlastungsbetrag der Kunden laufen lassen.'
      : 'Primärquelle vorlegen (Anerkennungsbescheid nach § 45a SGB XI bzw. Vergütungsvereinbarung) und die Tarife unter /admin/kassenabrechnung/tarife verifizieren. Preise werden nicht geraten und nicht automatisch geändert.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereichVpKzp(m: Messwerte): GoLiveBereich {
  const jahr = Number(heuteBerlin().slice(0, 4))
  const budget = budgetVersionFuerJahrOderNull(jahr)
  const t = zaehleTarife(m, r => VP_KZP_GRUNDLAGEN.some(g => r.includes(g)))

  const pruefungen = [
    pruefung(
      `Gesetzliche VP/KZP-Werte ${jahr}`,
      budget !== null,
      budget ? `VP ${budget.vpJaehrlich} € · KZP ${budget.kzpJaehrlich} € · kombiniert ${budget.vpKzpKombiniert} € · ab PG ${budget.minPflegegradVpKzp}` : 'keine Version hinterlegt',
      'intern',
    ),
    pruefung('Verifizierte VP/KZP-Tarife', t.verified > 0, `${t.verified} von ${t.gesamt}`, 'intern'),
    pruefung('Keine unverifizierten VP/KZP-Tarife', t.unverified === 0, `${t.unverified} unverifiziert`, 'intern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'vp_kzp',
    titel: 'VP / KZP (§§ 39, 42 SGB XI)',
    status,
    begruendung: status === 'ready'
      ? `Budgetführung inkl. Pflegegrad-Ausschluss und ${t.verified} verifizierte Tarife.`
      : t.gesamt === 0
        ? 'Es sind keine VP/KZP-Tarife hinterlegt — es kann kein Betrag berechnet werden.'
        : `Die kombinierte Jahresbudgetführung läuft, aber keiner der ${t.gesamt} VP/KZP-Tarife ist verifiziert. Ohne verifizierten Tarif erzeugt der Rechnungsweg fail-closed keine Rechnung.`,
    naechsterSchritt: status === 'ready'
      ? 'Verhinderungs- und Kurzzeitpflege regulär abrechnen.'
      : 'Vergütungsvereinbarung bzw. Anerkennungsbescheid vorlegen und die VP/KZP-Tarife unter /admin/kassenabrechnung/tarife verifizieren.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereich105(m: Messwerte): GoLiveBereich {
  const gates = freigabeUebersicht()
  const itsg = gates.freigaben.find(f => f.id === 'itsg_zertifiziert')
  const absender = m.zertifikate.find(z => z.typ === 'absender')
  const mitTransport = m.annahmestellen.filter(d => d.aktiv && ((d.sftp_host && d.sftp_user) || d.kim_adresse))
  const kassenAktiv = m.bundeslaender.filter(b => b.kassenrechnung_enabled)
  const lp = {
    gesamt: m.leistungspreise.length,
    verified: m.leistungspreise.filter(p => p.tarif_status === 'verified').length,
  }

  const pruefungen = [
    pruefung('Freigabe ITSG_ZERTIFIZIERT', itsg?.freigegeben === true, itsg?.freigegeben ? 'gesetzt' : 'nicht gesetzt', 'extern'),
    pruefung('SECON-Absenderzertifikat hinterlegt', Boolean(absender), absender ? `gültig bis ${absender.gueltig_bis ?? 'unbekannt'}` : 'keines', 'extern'),
    pruefung('Zertifikat-Passwort gesetzt', Boolean(process.env.SECON_ZERT_PASSWORT), process.env.SECON_ZERT_PASSWORT ? 'gesetzt' : 'nicht gesetzt', 'extern'),
    pruefung('Datenannahmestelle mit Transportweg', mitTransport.length > 0, `${mitTransport.length} von ${m.annahmestellen.length}`, 'extern'),
    pruefung('Bundesland für Kassenabrechnung freigeschaltet', kassenAktiv.length > 0, `${kassenAktiv.length} von ${m.bundeslaender.length}`, 'extern'),
    pruefung('Leistungskomplex-Preise verifiziert', lp.gesamt > 0 && lp.verified === lp.gesamt, `${lp.verified} von ${lp.gesamt}`, 'extern'),
    pruefung('Aktive Kostenträger-Stammdaten', (m.kostentraeger ?? 0) > 0, m.kostentraeger === null ? 'nicht prüfbar' : `${m.kostentraeger}`, 'intern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'dta_105',
    titel: '§ 105 SGB XI — DTA an Pflegekassen',
    status,
    begruendung: status === 'ready'
      ? 'Zertifikat, Transportweg und Stammdaten liegen vollständig vor — Echtversand ist möglich.'
      : 'Die Pipeline ist vollständig gebaut (Erzeugung, SECON-Verschlüsselung, Versand, Antwortabruf, Rückläufer, Wiedervorlage) und im Testmodus nutzbar. Der Echtversand hängt am ITSG-Zertifikat und am SFTP-Zugang der Datenannahmestelle — beides ist nur extern beschaffbar.',
    naechsterSchritt: status === 'ready'
      ? 'Ersten Echtlauf mit Dateiindikator „1" fahren und den Rückläufer prüfen.'
      : 'ITSG-Zertifikat beim Trust Center beantragen, SFTP-Zugang bei der Datenannahmestelle registrieren, Testübertragung durchführen — danach ITSG_ZERTIFIZIERT=true. Ablauf: docs/KASSENABRECHNUNG_FREISCHALTUNG.md.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereich302(m: Messwerte): GoLiveBereich {
  const gates = freigabeUebersicht()
  const gate = gates.freigaben.find(f => f.id === 'sgb_v_302_freigabe')
  const specOk = m.sgbVVersionen.some(v => v.spec_bestaetigt === true)

  const pruefungen = [
    pruefung('Freigabe SGB_V_302_FREIGABE', gate?.freigegeben === true, gate?.freigegeben ? 'gesetzt' : 'nicht gesetzt', 'extern'),
    pruefung('Technische Anlage 1 hinterlegt', specOk, specOk ? 'bestätigt' : `${m.sgbVVersionen.length} Version(en), keine bestätigt`, 'extern'),
    pruefung('Datensatz-Erzeugung implementiert', exportImplementiert('edifact_slga_slla'), exportImplementiert('edifact_slga_slla') ? 'implementiert' : 'gesperrt bis TA1 vorliegt', 'extern'),
    pruefung('Krankenkassen-Routing hinterlegt', (m.sgbVRouting ?? 0) > 0, m.sgbVRouting === null ? 'nicht prüfbar' : `${m.sgbVRouting} Einträge`, 'extern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'sgb_v_302',
    titel: '§ 302 SGB V — Krankenkassen (HKP)',
    status,
    begruendung: status === 'ready'
      ? 'Spezifikation, Generator und Routing liegen vor.'
      : 'Lauftabelle, Statusmodell, Routing und Versandpfad sind gebaut. Der Generator wirft bewusst bei jedem Aufruf, solange die Technische Anlage 1 nicht vorliegt — Segmentstrukturen werden nicht rekonstruiert.',
    naechsterSchritt: status === 'ready'
      ? 'Testübertragung mit der Datenannahmestelle vereinbaren.'
      : 'Technische Anlage 1 zur § 302-Vereinbarung inkl. Schlüsselverzeichnisse beim GKV-Spitzenverband beschaffen (gkv-datenaustausch.de), Segment-Builder danach implementieren, dann SGB_V_302_FREIGABE=true.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereichKim(m: Messwerte): GoLiveBereich {
  const gates = freigabeUebersicht()
  const gate = gates.freigaben.find(f => f.id === 'kim_aktiv')
  const freigeschaltet = m.kimKonfig.filter(k => k.freischaltungsstatus === 'freigeschaltet')
  const smcB = m.kimKarten.filter(k => k.karten_typ === 'smc_b' && k.status === 'aktiv')
  const specOk = m.kimVersionen.some(v => v.spec_bestaetigt === true)

  const pruefungen = [
    pruefung('Freigabe KIM_AKTIV', gate?.freigegeben === true, gate?.freigegeben ? 'gesetzt' : 'nicht gesetzt', 'extern'),
    pruefung('KIM-Postfach freigeschaltet', freigeschaltet.length > 0, `${freigeschaltet.length} von ${m.kimKonfig.length}`, 'extern'),
    pruefung('Technische Anlage 5 hinterlegt', specOk, specOk ? 'bestätigt' : `${m.kimVersionen.length} Version(en), keine bestätigt`, 'extern'),
    pruefung('Einsatzbereite SMC-B', smcB.length > 0, `${smcB.length} von ${m.kimKarten.length}`, 'extern'),
    pruefung('KIM-Versand implementiert', kimVersandImplementiert(), kimVersandImplementiert() ? 'implementiert' : 'NULL_ADAPTER — jede Operation wirft', 'extern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'kim_ti',
    titel: 'KIM / Telematikinfrastruktur',
    status,
    begruendung: status === 'ready'
      ? 'Zulassung, Postfach, Karten und Adapter liegen vor.'
      : 'Adapter-Schnittstelle, Postfach- und Kartenverwaltung sowie Nachrichten-Warteschlange sind gebaut. Es ist kein Provider-Adapter registriert — der NULL_ADAPTER wirft bei jeder Operation, statt still nichts zu tun.',
    naechsterSchritt: status === 'ready'
      ? 'Testnachricht an ein Fremdpostfach senden und Zustellung bestätigen.'
      : 'gematik-Zulassung beschaffen, KIM-Provider-Vertrag abschliessen, Konnektor anbinden, SMC-B beantragen, Provider-Adapter implementieren — danach KIM_AKTIV=true.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereichDipaService(): GoLiveBereich {
  const modus = dipaModus()

  // Umgekehrte Logik: READY heisst hier, dass der Coach OHNE DiPA-Behauptung
  // läuft. Ein eingeschalteter DiPA-Modus ohne BfArM-Listung wäre eine
  // unzulässige Aussage zur Kostenerstattung — deshalb fail-closed BLOCKED.
  const pruefungen = [
    pruefung(`${COACH_DIPA_MODUS_ENV} steht auf false`, modus === false, modus ? 'true — DiPA-Modus aktiv' : 'false (Default)', 'intern'),
    pruefung('Keine Erstattungs- oder Preisaussage im Produktbereich', modus === false, modus ? 'Anspruchsprüfung und Kostenträgerbezug sichtbar' : 'nicht erreichbar', 'intern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'dipa_service',
    titel: 'PflegeCoach als normaler Service',
    status,
    begruendung: status === 'ready'
      ? 'Der PflegeCoach läuft als digitaler Pflege- und Assistenzservice. Anspruchsprüfung, Kostenträgerbezug und jede Erstattungsaussage sind über den Schalter abgeschaltet und weder im UI noch über die API erreichbar.'
      : `${COACH_DIPA_MODUS_ENV} ist eingeschaltet, ohne dass eine BfArM-Listung nachgewiesen ist. Damit macht das Produkt Aussagen zur Kostenerstattung, die nicht gedeckt sind.`,
    naechsterSchritt: status === 'ready'
      ? 'Als kostenpflichtigen Eigenleistungs-Service vermarkten — ohne jede Aussage zu Kassenerstattung.'
      : `${COACH_DIPA_MODUS_ENV} auf false setzen, bis die BfArM-Listung vorliegt.`,
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereichDipaErstattung(): GoLiveBereich {
  const modus = dipaModus()

  // Es gibt keine Datenquelle, die eine BfArM-Listung belegen könnte. Solange
  // das so ist, kann diese Prüfung nur „nicht erfüllt" sein — genau richtig:
  // ein Listing behauptet man nicht, man weist es nach.
  const pruefungen = [
    pruefung('BfArM-Listung als DiPA nachgewiesen', false, 'kein Nachweis im System', 'extern'),
    pruefung('Vergütungsvereinbarung mit Pflegekasse', false, 'keine hinterlegt', 'extern'),
    pruefung(`DiPA-Modus (${COACH_DIPA_MODUS_ENV}) freigeschaltet`, modus, modus ? 'true' : 'false', 'extern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'dipa_erstattung',
    titel: 'DiPA kassenerstattungsfähig',
    status,
    begruendung: 'Der PflegeCoach ist technisch als DiPA vorbereitet (Schalter, Einwilligungen, Messinstrumente, Anforderungskatalog), aber nicht beim BfArM gelistet. Ohne Listung gibt es keinen Erstattungsanspruch — und das Produkt behauptet auch keinen.',
    naechsterSchritt: 'Gap-Liste in docs/DIPA_BFARM_READINESS.md abarbeiten. Extern zu beschaffen: DSFA-Freigabe, AV-Kette, Penetrationstest, Sicherheitszertifikat, Barrierefreiheits-Audit, Nutzennachweis/Erprobung, Software-QMS, FHIR-Mapping.',
    zustaendig: 'extern',
    pruefungen,
  }
}

function bereichSecurity(m: Messwerte): GoLiveBereich {
  const seedBewertungen = m.bewertungen.filter(b => istSeedUuid(b.angel_id) || istSeedUuid(b.reviewer_id)).length
  const anon = m.anonBewertungen

  const pruefungen = [
    pruefung('Bewertungen nicht anonym lesbar', anon.lesbar === false, anon.lesbar === null ? `nicht prüfbar (${anon.quelle})` : anon.lesbar ? `LECK — ${anon.quelle}` : 'anon liefert 0 Zeilen', 'intern'),
    pruefung('Keine Demo-/Seed-Bewertungen in Produktion', seedBewertungen === 0, `${seedBewertungen} von ${m.bewertungen.length}`, 'intern'),
    pruefung('Service-Role-Key serverseitig gesetzt', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), process.env.SUPABASE_SERVICE_ROLE_KEY ? 'gesetzt' : 'fehlt', 'intern'),
    pruefung('Mehr-Faktor-Authentisierung (MFA)', false, 'nicht implementiert', 'intern', 'hinweis'),
    pruefung('Penetrationstest durch Dritte', false, 'nicht durchgeführt', 'extern', 'hinweis'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'security',
    titel: 'Security',
    status,
    begruendung: status === 'ready'
      ? 'RLS greift auch am öffentlichen Anon-Key vorbei geprüft, keine Seed-Daten in produktiven Tabellen. MFA und ein externer Penetrationstest fehlen weiterhin — beides ist für den Pflegebetrieb nicht zwingend, für eine DiPA-Listung aber Pflicht.'
      : seedBewertungen > 0
        ? `In der produktiven Bewertungstabelle liegen noch ${seedBewertungen} Datensätze aus Seed-/Testdaten. Sie sind per RLS geschützt, gehören aber nicht in den Echtbetrieb.`
        : 'Mindestens eine Pflichtprüfung ist nicht erfüllt oder war nicht prüfbar.',
    naechsterSchritt: status === 'ready'
      ? 'Vor einer DiPA-Listung: MFA implementieren und externen Penetrationstest beauftragen.'
      : 'Seed-Datensätze aus den produktiven Tabellen löschen; anschliessend Anon-Zugriff erneut prüfen.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

function bereichProduction(m: Messwerte): GoLiveBereich {
  const org = m.organisation
  const sepaPlatzhalter = org?.sepa_creditor_id === SEPA_PLATZHALTER_ID
  const fehlendeEnv = PFLICHT_ENV.filter(k => !process.env[k])
  const testOrgs = m.testOrganisationen ?? 0

  const pruefungen = [
    pruefung(
      'Echte SEPA-Gläubiger-ID hinterlegt',
      Boolean(org?.sepa_creditor_id) && !sepaPlatzhalter,
      !org?.sepa_creditor_id ? 'keine hinterlegt' : sepaPlatzhalter ? 'PLATZHALTER — keine echte ID' : 'gesetzt',
      'intern',
    ),
    pruefung('Absender-IK der Organisation', Boolean(org?.ik_nummer), org?.ik_nummer ?? 'fehlt', 'intern'),
    pruefung('Bankverbindung hinterlegt', Boolean(org?.iban), org?.iban ? 'gesetzt' : 'fehlt', 'intern'),
    pruefung('Pflicht-Env-Variablen gesetzt', fehlendeEnv.length === 0, fehlendeEnv.length === 0 ? `${PFLICHT_ENV.length} von ${PFLICHT_ENV.length}` : `fehlt: ${fehlendeEnv.join(', ')}`, 'intern'),
    pruefung('Keine Testmandanten in der Produktions-DB', testOrgs === 0, m.testOrganisationen === null ? 'nicht prüfbar' : `${testOrgs}`, 'intern'),
  ]
  const status = statusAus(pruefungen)

  return {
    id: 'production',
    titel: 'Production',
    status,
    begruendung: sepaPlatzhalter
      ? `Die hinterlegte SEPA-Gläubiger-ID ist ein Platzhalter aus der Migration und keine echte Kennung. Ein Lastschrifteinzug damit würde von der Bank abgelehnt.${testOrgs > 0 ? ` Zusätzlich liegen ${testOrgs} Testmandanten in der Produktions-Datenbank.` : ''}`
      : status === 'ready'
        ? 'Stammdaten, Bankverbindung, Gläubiger-ID und Pflicht-Env-Variablen sind vollständig; keine Testmandanten in der Produktions-DB.'
        : 'Mindestens eine Pflichtprüfung des Produktivbetriebs ist offen.',
    naechsterSchritt: sepaPlatzhalter
      ? 'Gläubiger-Identifikationsnummer bei der Deutschen Bundesbank beantragen (kostenfrei, Online-Antrag) und den Platzhalter in den Organisationsstammdaten ersetzen. Ablauf: docs/ANLEITUNG_SEPA_CREDITOR_ID.md. Bis dahin keinen Lastschrifteinzug starten.'
      : status === 'ready'
        ? 'Betrieb aufnehmen. Rechnungsversand und Lastschrift sind freigegeben.'
        : 'Offene Punkte in den Organisationsstammdaten bzw. in der Vercel-Umgebung schliessen.',
    zustaendig: zustaendigkeitAus(pruefungen, status),
    pruefungen,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Einstieg
// ───────────────────────────────────────────────────────────────────────────

/** Baut die Bereichsliste aus bereits erhobenen Messwerten. Getrennt, damit sie testbar ist. */
export function baueBereiche(m: Messwerte): GoLiveBereich[] {
  return [
    bereichPflegeSoftware(m),
    bereichPrivatabrechnung(m),
    bereich45b(m),
    bereichVpKzp(m),
    bereich105(m),
    bereich302(m),
    bereichKim(m),
    bereichDipaService(),
    bereichDipaErstattung(),
    bereichSecurity(m),
    bereichProduction(m),
  ]
}

export type GoLiveMesswerte = Messwerte

/**
 * Ermittelt den Go-Live-Status. Erwartet einen Client mit Lesezugriff auf die
 * Organisation — in der Praxis der Admin-Client hinter dem Admin-Guard der Seite.
 */
export async function ermittleGoLiveStatus(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<GoLiveErgebnis> {
  const m = await erhebeMesswerte(supabase, organizationId)
  const bereiche = baueBereiche(m)

  return {
    stichtag: heuteBerlin(),
    organisation: m.organisation?.name ?? null,
    bereiche,
    zusammenfassung: {
      ready: bereiche.filter(b => b.status === 'ready').length,
      blocked: bereiche.filter(b => b.status === 'blocked').length,
      external: bereiche.filter(b => b.status === 'external').length,
      gesamt: bereiche.length,
    },
    hinweise: m.fehler,
  }
}
