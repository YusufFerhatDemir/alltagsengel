// ═══════════════════════════════════════════════════════════════════════
// Sicherheitsspur lesen — Filter, Seiten, Sortierung, Export
// ═══════════════════════════════════════════════════════════════════════
//
// MANDANTENFILTER IM CODE
// Gelesen wird mit dem Dienstschluessel; dort greift RLS nicht. Der
// Mandantenfilter MUSS deshalb hier stehen — genau wie in
// app/api/admin/zustellspur/route.ts. Die RLS-Policy auf der Tabelle ist
// die zweite Tuer fuer den Fall, dass jemand spaeter mit dem Browser-
// Client liest, nicht die erste.
//
// SUCHBEGRIFFE
// Freitext geht NICHT in `.or()`. Ein roher Suchbegriff ist dort eine
// freie Abfrage (Befund PostgREST-or()-Einschleusung) — die Suche laeuft
// deshalb ueber getrennte, gebundene Filter.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { csvZeile } from '@/lib/utils/csv'
import { istIp } from './geraet'
import {
  regelFuer, istKategorie, istSchweregrad,
  BEZEICHNUNG_KATEGORIE, BEZEICHNUNG_SCHWEREGRAD,
  type Kategorie, type Schweregrad,
} from './ereignisse'
import { alarmZustaende, alarmKurzfassung, LEERER_ALARM, type Alarmzustand } from './alarmspur'
import {
  provenienzFuerZeile, istEchteNutzeraktivitaet, istTest, quelleFuer,
  BEZEICHNUNG_PROVENIENZ, ECHTE_PROVENIENZEN,
  type Provenienz, type Quelle,
} from './herkunft'
import { ueberwachteKonten } from './watchlist'

type AdminClient = ReturnType<typeof createAdminClient>

export const SORTIERFELDER = ['created_at', 'event_type', 'severity', 'user_email'] as const
export type Sortierfeld = (typeof SORTIERFELDER)[number]

export const SEITENGROESSE_STANDARD = 50
export const SEITENGROESSE_MAX = 200
/** Obergrenze fuer den CSV-Export. Ein unbegrenzter Export ist ein
 *  Speicherproblem mit Ansage — und ein Prueflauf, der die halbe Tabelle
 *  in eine Datei zieht, will das in aller Regel gar nicht. */
export const EXPORT_MAX = 10_000

export interface SpurFilter {
  /** Pflicht: der Mandant. Ohne ihn wird nicht gelesen. */
  organizationId: string
  /**
   * Mandantenlose Zeilen mitlesen (fehlgeschlagene Anmeldungen zu
   * unbekannten Adressen). Standard: ja — sonst faellt genau die
   * Ereignisklasse weg, die auf einen Angriff von aussen hindeutet.
   */
  ohneOrganisationEinschliessen?: boolean
  userId?: string | null
  /** Teiltreffer auf der Adresse, kleingeschrieben. */
  suche?: string | null
  vonDatum?: string | null
  bisDatum?: string | null
  eventType?: string | null
  eventCategory?: Kategorie | null
  severity?: Schweregrad | null
  plattform?: string | null
  ip?: string | null
  /**
   * Herkunftsfilter. 'echt' zeigt nur belegte Nutzeraktivitaet,
   * 'nicht_echt' nur Nachgestelltes und Unbelegtes. Das ist die Frage,
   * die am 31.08.2026 nicht stellbar war: „zeig mir, was WIRKLICH
   * passiert ist".
   */
  herkunft?: 'echt' | 'nicht_echt' | null
  seite?: number
  seitengroesse?: number
  sortierFeld?: Sortierfeld
  sortierRichtung?: 'asc' | 'desc'
}

export interface SpurZeile {
  id: string
  createdAt: string
  eventType: string
  eventBezeichnung: string
  eventCategory: string | null
  kategorieBezeichnung: string
  severity: string
  severityBezeichnung: string
  userId: string | null
  userEmail: string | null
  userName: string | null
  organizationId: string | null
  organisationsName: string | null
  ip: string | null
  userAgent: string | null
  plattform: string | null
  geraet: string | null
  appVersion: string | null
  sessionReference: string | null
  metadata: Record<string, unknown> | null
  /**
   * Wurde zu DIESER Zeile gemeldet, und was sagt die Zustellspur?
   * Siehe lib/security/alarmspur.ts — dort steht auch, warum
   * „uebergeben" und „zugestellt" hier auseinandergehalten werden.
   */
  alarm: Alarmzustand
  /** Steht das betroffene Konto auf der aktiven Ueberwachungsliste? */
  ueberwacht: boolean
  /**
   * Herkunft der Zeile — echt oder nachgestellt. `null` bei Zeilen aus
   * der Zeit vor der Kennzeichnung (vor dem 31.08.2026); ueber die ist
   * nichts belegt, und sie gelten deshalb NICHT als echt.
   */
  provenienz: Provenienz | null
  provenienzBezeichnung: string
  /** Fail-closed: nur die drei belegten Echt-Provenienzen ergeben true. */
  echteNutzeraktivitaet: boolean
  /**
   * Ausdrueckliches Testereignis. Fail-closed in die ANDERE Richtung:
   * nur TEST_ALERT und ADMIN_TEST ergeben true. Eine unbelegte Zeile ist
   * weder echt noch Test — ueber sie ist nichts bekannt.
   */
  istTest: boolean
  /** Grobe Einordnung: real_user | synthetic_test | system | null. */
  quelle: Quelle | null
}

export interface SpurErgebnis {
  zeilen: SpurZeile[]
  gesamt: number
  seite: number
  seitengroesse: number
  seiten: number
}

const SPALTEN =
  'id, created_at, event_type, event_category, severity, user_id, user_email, ' +
  'organization_id, ip_address, user_agent, platform, device_info, app_version, ' +
  'session_reference, metadata'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function begrenze(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(Math.max(Math.trunc(n), min), max)
}

/** Baut die Abfrage inklusive Mandantenfilter. */
function abfrage(admin: AdminClient, f: SpurFilter, spalten: string, zaehlen: boolean) {
  // Die Kennung stammt aus dem Auth-Kontext, nicht aus der Anfrage —
  // trotzdem geprueft, weil sie unten in eine .or()-Bedingung eingesetzt
  // wird und eine .or()-Bedingung eine freie Abfrage IST. Ein Aufrufer,
  // der hier spaeter etwas anderes durchreicht, faellt sofort auf.
  if (!UUID_RE.test(f.organizationId)) {
    throw new Error('Sicherheitsspur: organizationId ist keine gueltige Kennung')
  }

  let q = admin
    .from('security_audit_log')
    .select(spalten, zaehlen ? { count: 'exact' } : undefined)

  // Mandantenfilter — nicht verhandelbar.
  if (f.ohneOrganisationEinschliessen === false) {
    q = q.eq('organization_id', f.organizationId)
  } else {
    // PostgREST-Syntax fuer „gehoert diesem Mandanten ODER keinem".
    // Beide Bestandteile sind hier vom Code gesetzt, kein Nutzertext —
    // das ist der Unterschied zur eingeschleusten .or()-Bedingung.
    q = q.or(`organization_id.eq.${f.organizationId},organization_id.is.null`)
  }

  if (f.userId && UUID_RE.test(f.userId)) q = q.eq('user_id', f.userId)
  if (f.suche) q = q.ilike('user_email', `%${f.suche.replace(/[%_,()]/g, '')}%`)
  if (f.vonDatum) q = q.gte('created_at', f.vonDatum)
  if (f.bisDatum) q = q.lte('created_at', f.bisDatum)
  if (f.eventType) q = q.eq('event_type', f.eventType)
  if (f.eventCategory && istKategorie(f.eventCategory)) q = q.eq('event_category', f.eventCategory)
  if (f.severity && istSchweregrad(f.severity)) q = q.eq('severity', f.severity)
  if (f.plattform) q = q.eq('platform', f.plattform)
  // ip_address ist vom Typ `inet`. Ein Wert, der keine Adresse ist,
  // laesst PostgREST mit 400 antworten — der Filter wird dann still
  // ignoriert statt die ganze Seite zu zerlegen.
  if (f.ip && istIp(f.ip)) q = q.eq('ip_address', f.ip)

  // Herkunft. Gefiltert wird auf metadata->>provenienz — PostgREST kann
  // das, und eine eigene Spalte gibt es nicht (DDL ist gesperrt, siehe
  // lib/security/herkunft.ts). `nicht_echt` ist bewusst KEINE
  // Aufzaehlung der drei Nicht-Echt-Werte, sondern das Gegenteil der
  // drei Echt-Werte: so faellt auch das Unbelegte hinein, und genau das
  // soll es — nicht belegt ist nicht echt.
  if (f.herkunft === 'echt') {
    q = q.in('metadata->>provenienz', [...ECHTE_PROVENIENZEN])
  } else if (f.herkunft === 'nicht_echt') {
    q = q.not('metadata->>provenienz', 'in', `(${ECHTE_PROVENIENZEN.join(',')})`)
  }

  return q
}

interface RohZeile {
  id: string
  created_at: string
  event_type: string
  event_category: string | null
  severity: string
  user_id: string | null
  user_email: string | null
  organization_id: string | null
  ip_address: string | null
  user_agent: string | null
  platform: string | null
  device_info: Record<string, unknown> | null
  app_version: string | null
  session_reference: string | null
  metadata: Record<string, unknown> | null
}

function geraetAus(device: Record<string, unknown> | null): string | null {
  if (!device) return null
  const browser = typeof device.browser === 'string' ? device.browser : null
  const os = typeof device.betriebssystem === 'string' ? device.betriebssystem : null
  const text = [browser, os].filter(w => w && w !== 'unbekannt').join(' auf ')
  return text || null
}

/**
 * Namen nachschlagen — in EINER Abfrage je Bezugstabelle, nicht je
 * Zeile. Eine Seite mit 200 Eintraegen ergaebe sonst 400 Abfragen.
 */
async function anreichern(admin: AdminClient, roh: RohZeile[]): Promise<SpurZeile[]> {
  const userIds = [...new Set(roh.map(r => r.user_id).filter((v): v is string => !!v))]
  const orgIds = [...new Set(roh.map(r => r.organization_id).filter((v): v is string => !!v))]

  // Alarm- und Zustellzustand fuer die ganze Seite in zwei Abfragen,
  // die Ueberwachungsliste in einer dritten. Alle drei fail-soft: eine
  // Sicherheitsansicht ohne Alarmspalte ist besser als keine Liste.
  const alarme = await alarmZustaende(admin, roh.map(r => r.id))
  let ueberwacht: ReadonlySet<string> = new Set()
  try { ueberwacht = await ueberwachteKonten(admin) } catch { /* fail-soft */ }

  const namen = new Map<string, string>()
  if (userIds.length > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', userIds)
    for (const p of data ?? []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      if (name) namen.set(p.id as string, name)
    }
  }

  const orgs = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data } = await admin.from('organizations').select('id, name').in('id', orgIds)
    for (const o of data ?? []) orgs.set(o.id as string, (o.name as string) ?? '')
  }

  return roh.map(r => {
    const regel = regelFuer(r.event_type)
    const kategorie = (r.event_category ?? regel.kategorie) as Kategorie
    const grad = (istSchweregrad(r.severity) ? r.severity : 'warning') as Schweregrad
    return {
      id: r.id,
      createdAt: r.created_at,
      eventType: r.event_type,
      eventBezeichnung: regel.bezeichnung,
      eventCategory: r.event_category,
      kategorieBezeichnung: BEZEICHNUNG_KATEGORIE[kategorie] ?? (r.event_category ?? '—'),
      severity: r.severity,
      severityBezeichnung: BEZEICHNUNG_SCHWEREGRAD[grad],
      userId: r.user_id,
      userEmail: r.user_email,
      userName: r.user_id ? (namen.get(r.user_id) ?? null) : null,
      organizationId: r.organization_id,
      organisationsName: r.organization_id ? (orgs.get(r.organization_id) ?? null) : null,
      ip: r.ip_address,
      userAgent: r.user_agent,
      plattform: r.platform,
      geraet: geraetAus(r.device_info),
      appVersion: r.app_version,
      sessionReference: r.session_reference,
      metadata: r.metadata,
      alarm: alarme.get(r.id) ?? LEERER_ALARM,
      ueberwacht: !!r.user_id && ueberwacht.has(r.user_id),
      ...(() => {
        // Einmal herleiten, viermal verwenden. `provenienzFuerZeile`
        // erkennt auch die Zeilen des Auth-Triggers als echte
        // Anmeldung — der feuert ausschliesslich bei einer
        // tatsaechlichen Aenderung von auth.users.last_sign_in_at.
        const p = provenienzFuerZeile(r.metadata, r.device_info, r.event_type)
        return {
          provenienz: p,
          provenienzBezeichnung: p
            ? BEZEICHNUNG_PROVENIENZ[p]
            : 'Herkunft unbelegt (Zeile vor dem 31.08.2026)',
          echteNutzeraktivitaet: istEchteNutzeraktivitaet(p),
          istTest: istTest(p),
          quelle: quelleFuer(p),
        }
      })(),
    }
  })
}

export async function leseSpur(admin: AdminClient, f: SpurFilter): Promise<SpurErgebnis> {
  const seitengroesse = begrenze(f.seitengroesse ?? SEITENGROESSE_STANDARD, 1, SEITENGROESSE_MAX)
  const seite = begrenze(f.seite ?? 1, 1, 100_000)
  const feld: Sortierfeld = (SORTIERFELDER as readonly string[]).includes(f.sortierFeld ?? '')
    ? (f.sortierFeld as Sortierfeld)
    : 'created_at'
  const aufsteigend = f.sortierRichtung === 'asc'

  const von = (seite - 1) * seitengroesse

  const { data, error, count } = await abfrage(admin, f, SPALTEN, true)
    .order(feld, { ascending: aufsteigend })
    .range(von, von + seitengroesse - 1)

  if (error) throw new Error(`Sicherheitsspur nicht lesbar: ${error.code ?? ''}`)

  const zeilen = await anreichern(admin, (data ?? []) as unknown as RohZeile[])
  const gesamt = count ?? zeilen.length

  return {
    zeilen,
    gesamt,
    seite,
    seitengroesse,
    seiten: Math.max(1, Math.ceil(gesamt / seitengroesse)),
  }
}

/**
 * CSV fuer eine Pruefung. Semikolon-getrennt (deutsche Excel-Locale),
 * jede Zelle ueber csvZelle() — die Formel-Entschaerfung ist hier nicht
 * optional: `user_agent` ist ein Wert von aussen und landet in einer
 * Datei, die jemand in Excel oeffnet.
 */
export async function exportiereSpur(admin: AdminClient, f: SpurFilter): Promise<string> {
  const { data, error } = await abfrage(admin, f, SPALTEN, false)
    .order('created_at', { ascending: false })
    .limit(EXPORT_MAX)

  if (error) throw new Error(`Export nicht moeglich: ${error.code ?? ''}`)

  const zeilen = await anreichern(admin, (data ?? []) as unknown as RohZeile[])

  const kopf = [
    // Herkunft steht VORNE, nicht am Ende: wer die Datei oeffnet, soll
    // nicht erst nach rechts scrollen muessen, um zu sehen, welche
    // Zeilen ueberhaupt echtes Nutzerverhalten belegen.
    'Herkunft', 'Echte Nutzeraktivität', 'Testereignis', 'Quelle',
    'Ereignis-ID', 'Zeitpunkt (UTC)', 'Ereignis', 'Ereignistyp', 'Kategorie',
    'Schweregrad', 'Konto-ID', 'E-Mail', 'Name', 'Organisation',
    'IP-Adresse', 'Plattform', 'Gerät', 'User-Agent', 'App-Version',
    'Sitzungsbezug', 'Zusatzdaten',
    // Die Alarmkette. Ohne sie beantwortet der Export die Frage nicht,
    // die eine Pruefung als erstes stellt: ist jemand informiert worden,
    // und ist die Nachricht angekommen?
    'Überwachtes Konto', 'Alarm ausgelöst', 'Alarm-Nachweis-ID', 'Meldegrund',
    'Mail-Empfänger', 'Zustellstatus', 'Provider', 'Provider-Nachrichten-ID',
    'Versuche', 'Letzter Versuch', 'Übergeben am', 'Gescheitert am', 'Fehlergrund',
    'Alarm-Kurzfassung',
  ]

  const koerper = zeilen.map(z => csvZeile([
    z.provenienz ?? 'UNBELEGT', z.echteNutzeraktivitaet ? 'ja' : 'nein',
    z.istTest ? 'ja' : 'nein', z.quelle ?? 'unbekannt',
    z.id, z.createdAt, z.eventBezeichnung, z.eventType, z.kategorieBezeichnung,
    z.severityBezeichnung, z.userId, z.userEmail, z.userName, z.organisationsName,
    z.ip, z.plattform, z.geraet, z.userAgent, z.appVersion,
    z.sessionReference, z.metadata ? JSON.stringify(z.metadata) : '',
    z.ueberwacht ? 'ja' : 'nein',
    z.alarm.ausgeloest ? 'ja' : 'nein',
    z.alarm.nachweisId, z.alarm.meldeGrund,
    z.alarm.zustellungen.map(v => v.empfaenger ?? '').join(' | '),
    z.alarm.zustellungen.map(v => v.status).join(' | '),
    z.alarm.zustellungen.map(v => v.provider ?? '').join(' | '),
    z.alarm.zustellungen.map(v => v.providerNachrichtId ?? '').join(' | '),
    z.alarm.zustellungen.map(v => String(v.versuche ?? '')).join(' | '),
    z.alarm.zustellungen.map(v => v.letzterVersuch ?? '').join(' | '),
    z.alarm.zustellungen.map(v => v.zugestelltAm ?? '').join(' | '),
    z.alarm.zustellungen.map(v => v.gescheitertAm ?? '').join(' | '),
    z.alarm.zustellungen.map(v => v.fehlergrund ?? '').join(' | '),
    alarmKurzfassung(z.alarm),
  ]))

  // BOM, sonst zeigt Excel Umlaute als Kraut an.
  return '﻿' + [csvZeile(kopf), ...koerper].join('\r\n') + '\r\n'
}
